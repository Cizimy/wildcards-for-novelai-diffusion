// bridge.js - Content Script
(async () => {
  // --- Start of functions moved from injector.js ---

  const curlyPattern = /{([^{}]*\|[^{}]*)}/;
  const doublePipePattern = /\|\|(?:[^|]+\|)+[^|]+\|\|/;
  const simpleWildcardPattern = /__([A-Za-z0-9_\/-]+)__/;

  function createRNG() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      return function() {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        return array[0] / (0xFFFFFFFF + 1);
      };
    }
    return Math.random;
  }
  const rng = createRNG();

  function containsWildcardSyntax(text) {
    if (typeof text !== 'string') return false;
    return simpleWildcardPattern.test(text) ||
      curlyPattern.test(text) ||
      doublePipePattern.test(text);
  }

  function chooseWeighted(opts) {
    const weighted = opts.map(s => {
      let colonIndex = -1;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === ':' && (i === 0 || s[i - 1] !== '\\')) {
          colonIndex = i;
          break;
        }
      }
      if (colonIndex === -1) {
        return { weight: 1, label: s.trim().replace(/\\:/g, ':') };
      }
      const weightStr = s.substring(0, colonIndex).trim();
      let weight = 1;
      const parsedWeight = parseFloat(weightStr);
      if (Number.isFinite(parsedWeight) && parsedWeight >= 0) {
        weight = parsedWeight;
      }
      const label = s.substring(colonIndex + 1).trim().replace(/\\:/g, ':');
      return { weight, label };
    });
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) {
        const validOptions = weighted.filter(i => i.label);
        if (validOptions.length === 0) return '';
        return validOptions[Math.floor(rng() * validOptions.length)].label;
    }
    let random = rng() * totalWeight;
    for (const item of weighted) {
      random -= item.weight;
      if (random <= 0) return item.label;
    }
    return weighted[weighted.length - 1].label;
  }

  function swap(txt, dict, context) {
    let result = txt.replace(/__([A-Za-z0-9_\/-]+)__/g, (match, name) => {
      let raw = dict[name];
      if (!raw && name.includes('/')) {
        const variations = [
          name.replace(/\//g, '_'),
          name.replace(/\//g, '-'),
          name.replace(/\//g, '')
        ];
        for (const variation of variations) {
          if (dict[variation]) {
            raw = dict[variation];
            break;
          }
        }
      }
      if (!raw) return match;
      raw = raw.replace(/\\\(/g, '(').replace(/\\\)/g, ')');
      const lines = raw.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return match;
      // With v3 logic removed, we always return a random line.
      // The original distinction for `||...||` syntax is no longer needed
      // as the recursive nature handles nested replacements.
      return lines[Math.floor(rng() * lines.length)];
    });
    result = result.replace(/{([^|{}]+(?:\|[^|{}]+)+)}/g, (match, group) => {
      const opts = group.split('|');
      if (opts.some(opt => /(?<!\\):/.test(opt))) {
        return chooseWeighted(opts);
      } else {
        return opts[Math.floor(rng() * opts.length)];
      }
    });
    result = result.replace(/\|\|((?:[^|]+\|)+[^|]+)\|\|/g, (match, group) => {
      const opts = group.split('|');
      if (opts.some(opt => /(?<!\\):/.test(opt))) {
        return chooseWeighted(opts);
      } else {
        return opts[Math.floor(rng() * opts.length)];
      }
    });
    
    // --- Conditional Tags ---
    // @if{variable=value|then|else}
    result = result.replace(/@if{([^}]+)}/g, (match, content) => {
      const [conditionSpec, thenBranch = '', elseBranch = ''] = content.split('|');
      const conditionParts = conditionSpec.split(':');

      // Legacy @if{variable=value} support
      if (conditionParts.length === 1) {
        const [varName, varValue = ''] = conditionSpec.split('=').map(s => s.trim());
        if (!varName) return elseBranch;
        const conditionRe = new RegExp(`\\b${escapeRegExp(varName)}=${escapeRegExp(varValue)}\\b`);
        return conditionRe.test(result) ? thenBranch : elseBranch;
      }

      // New @if{scope:condition} syntax
      const [scope, condition] = conditionParts;
      const targetText = getPropertyByScope(context, scope);

      if (typeof targetText !== 'string') {
        return elseBranch; // Scope not found or not a string
      }

      const isNegation = condition.startsWith('!');
      const keyword = isNegation ? condition.substring(1) : condition;
      const keywordPattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i');
      const hasKeyword = keywordPattern.test(targetText);

      const conditionMet = isNegation ? !hasKeyword : hasKeyword;
      return conditionMet ? thenBranch : elseBranch;
    });

    // @scene{keyword|then|else}
    result = result.replace(/@scene{([^}]+)}/g, (match, content) => {
      const [keyword, thenBranch = '', elseBranch = ''] = content.split('|').map(s => s.trim());

      if (!keyword) {
        return elseBranch;
      }

      // Check against the *current* result for scene keywords
      const contextPattern = new RegExp(`\\b(${escapeRegExp(keyword)})\\b`, 'i');
      const hasKeyword = contextPattern.test(result);

      return hasKeyword ? thenBranch : elseBranch;
    });

    return result;
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function removeExclusiveTags(text) {
    const exclusionPattern = /!((?:"[^"]+")|(?:[\w./-]+(?:,\s*[\w./-]+)*))/g;
    const exclusions = [];
    let result = text;
    result = result.replace(exclusionPattern, (fullMatch, tag) => {
      const tagsToExclude = (tag.startsWith('"') && tag.endsWith('"'))
        ? [tag.substring(1, tag.length - 1)]
        : tag.split(',').map(t => t.trim()).filter(Boolean);
      
      exclusions.push(...tagsToExclude);
      return ''; // Remove the exclusion tags from the prompt
    });

    for (const exclusion of exclusions) {
      if (!exclusion) continue;
      const escapedExclusion = escapeRegExp(exclusion);
      const tagPattern = new RegExp(`\\b${escapedExclusion}\\b`, 'gi');
      result = result.replace(tagPattern, '%%REMOVED%%');
    }

    const cleaned = result.replace(/%%REMOVED%%/g, '');
    // The split/map/filter/join approach is generally robust.
    // To address the review's concern about edge cases, we add a more aggressive
    // regex cleanup pass before the final join.
    const veryCleaned = cleaned.replace(/,\s*(,|$)/g, '$1').trim().replace(/^,|,$/g, '');
    const parts = veryCleaned.split(',')
                         .map(s => s.trim())
                         .filter(Boolean);
    return parts.join(', ');
  }

  function recursiveSwap(txt, dict, context) {
    let current = txt;
    let iteration = 0;
    // Increased iteration limit for very complex nested wildcards.
    while (containsWildcardSyntax(current) && iteration < 100) {
      const next = swap(current, dict, context);
      if (next === current) break;
      current = next;
      iteration++;
    }
    current = removeExclusiveTags(current);
    return current;
  }

  const deepSwap = (o, dict, context) => {
    if (typeof o === 'string') return recursiveSwap(o, dict, context);
    if (Array.isArray(o)) return o.map(item => deepSwap(item, dict, context));
    if (o && typeof o === 'object') {
      const newObj = {};
      for (const k in o) {
        newObj[k] = deepSwap(o[k], dict, context);
        if (k === 'char_captions' && Array.isArray(newObj[k]) && newObj[k].length > 6)
          newObj[k] = newObj[k].slice(0, 6);
      }
      return newObj;
    }
    return o;
  };

  function getPropertyByScope(obj, scope) {
    // Simple key access for now. Can be expanded for nested access later.
    // e.g., 'prompt', 'uc', 'sampler_options.seed'
    return obj[scope];
  }

  // --- End of moved functions ---

  let wildcards = {};
  let preservePrompt = false;

  // 1) Load initial settings
  const loadSettings = async () => {
    const settings = await chrome.storage.local.get(['wildcards', 'preservePrompt']);
    wildcards = settings.wildcards || {};
    preservePrompt = settings.preservePrompt || false;
  };

  await loadSettings();

  // 2) Inject the page script
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('injector.js');
  s.onload = () => {
    // Send only necessary settings, not the whole wildcard map
    window.postMessage({
      type: '__WILDCARD_INIT__',
      preservePrompt: preservePrompt
    }, '*');
    s.remove();
  };
  (document.head || document.documentElement).appendChild(s);

  // 3) Listen for setting changes
  chrome.storage.onChanged.addListener(async (changes) => {
    await loadSettings(); // Reload all settings on any change
    window.postMessage({
      type: '__WILDCARD_UPDATE__',
      preservePrompt: preservePrompt
    }, '*');
  });

  // 4) Listen for swap requests from the page script
  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data.type !== '__WILDCARD_SWAP_REQUEST__') {
      return;
    }

    const { id, payload } = e.data;
    if (!id || !payload) return;

    try {
      const result = deepSwap(payload, wildcards, payload);
      window.postMessage({
        type: '__WILDCARD_SWAP_RESPONSE__',
        id: id,
        payload: result
      }, '*');
    } catch (error) {
      console.error('[Wildcard Bridge] Error processing swap request:', error);
      window.postMessage({
        type: '__WILDCARD_SWAP_RESPONSE__',
        id: id,
        error: error.message
      }, '*');
    }
  });

})();
