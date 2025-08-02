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
      text.includes('@if{') ||
      /(?<!@if){([^|{}]+(?:\|[^|{}]+)+)}/.test(text) ||
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

  function parseIf(text, context) {
      const parts = [];
      let balance = 0;
      let lastIndex = 0;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') balance++;
        if (text[i] === '}') balance--;
        if (text[i] === '|' && balance === 0) {
          parts.push(text.substring(lastIndex, i));
          lastIndex = i + 1;
        }
      }
      parts.push(text.substring(lastIndex));
      const [conditionSpec, thenBranch = '', elseBranch = ''] = parts;
      const conditionParts = conditionSpec.split(':');
      if (conditionParts.length === 1) {
        const [varName, varValue = ''] = conditionSpec.split('=').map(s => s.trim());
        if (!varName) return elseBranch;
        const checkString = context.prompt.replace(`@if{${text}}`, '');
        const conditionRe = new RegExp(`\\b${escapeRegExp(varName)}=${escapeRegExp(varValue)}\\b`);
        return conditionRe.test(checkString) ? thenBranch : elseBranch;
      }
      const [scope, condition] = conditionParts;
      const targetText = getPropertyByScope(context, scope);
      if (typeof targetText !== 'string') {
        return elseBranch;
      }
      const isNegation = condition.startsWith('!');
      const keyword = isNegation ? condition.substring(1) : condition;
      const keywordPattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i');
      const hasKeyword = keywordPattern.test(targetText);
      const conditionMet = isNegation ? !hasKeyword : hasKeyword;
      return conditionMet ? thenBranch : elseBranch;
  }

  function swap(txt, dict, context) {
    let result = txt;

    if (simpleWildcardPattern.test(result)) {
        return result.replace(simpleWildcardPattern, (match, name) => {
            let raw = dict[name];
            if (!raw && name.includes('/')) {
                const variations = [name.replace(/\//g, '_'), name.replace(/\//g, '-'), name.replace(/\//g, '')];
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
            return lines[Math.floor(rng() * lines.length)];
        });
    }

    const ifIndex = result.indexOf('@if{');
    if (ifIndex !== -1) {
        let balance = 1;
        let endIndex = -1;
        for (let i = ifIndex + 4; i < result.length; i++) {
            if (result[i] === '{') balance++;
            if (result[i] === '}') balance--;
            if (balance === 0) {
                endIndex = i;
                break;
            }
        }
        if (endIndex !== -1) {
            const match = result.substring(ifIndex, endIndex + 1);
            const content = result.substring(ifIndex + 4, endIndex);
            const replacement = parseIf(content, context);
            return result.replace(match, replacement);
        }
    }

    if (/(?<!@if){([^|{}]+(?:\|[^|{}]+)+)}/.test(result)) {
        return result.replace(/(?<!@if){([^|{}]+(?:\|[^|{}]+)+)}/, (match, group) => {
            const opts = group.split('|');
            return opts.some(opt => /(?<!\\):/.test(opt)) ? chooseWeighted(opts) : opts[Math.floor(rng() * opts.length)];
        });
    }

    if (doublePipePattern.test(result)) {
        return result.replace(doublePipePattern, (match, group) => {
            const opts = group.split('|');
            return opts.some(opt => /(?<!\\):/.test(opt)) ? chooseWeighted(opts) : opts[Math.floor(rng() * opts.length)];
        });
    }
    
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
      return '';
    });

    for (const exclusion of exclusions) {
      if (!exclusion) continue;
      const escapedExclusion = escapeRegExp(exclusion);
      const tagPattern = new RegExp(`\\b${escapedExclusion}\\b`, 'gi');
      result = result.replace(tagPattern, '%%REMOVED%%');
    }

    const cleaned = result.replace(/%%REMOVED%%/g, '');
    const veryCleaned = cleaned.replace(/,\s*(,|$)/g, '$1').trim().replace(/^,|,$/g, '');
    const parts = veryCleaned.split(',')
                         .map(s => s.trim())
                         .filter(Boolean);
    return parts.join(', ');
  }

  function recursiveSwap(txt, dict, context) {
    let current = txt;
    let iteration = 0;
    const history = new Set([current]);

    while (containsWildcardSyntax(current) && iteration < 100) {
      const next = swap(current, dict, context);
      if (next === current) {
        break;
      }
      if (history.has(next)) {
        console.warn(`[Wildcard] Infinite loop detected. Breaking. History:`, Array.from(history));
        break;
      }
      history.add(next);

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
    if (typeof obj[scope] !== 'undefined') {
      return obj[scope];
    }
    if (obj?.parameters && typeof obj.parameters[scope] !== 'undefined') {
      return obj.parameters[scope];
    }
    return undefined;
  }

  // --- End of moved functions ---

  let wildcards = {};
  let preservePrompt = false;

  const loadSettings = async () => {
    const settings = await chrome.storage.local.get(['wildcards', 'preservePrompt']);
    wildcards = settings.wildcards || {};
    preservePrompt = settings.preservePrompt || false;
  };

  await loadSettings();

  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('injector.js');
  s.onload = () => {
    window.postMessage({
      type: '__WILDCARD_INIT__',
      preservePrompt: preservePrompt
    }, '*');
    s.remove();
  };
  (document.head || document.documentElement).appendChild(s);

  chrome.storage.onChanged.addListener(async (changes) => {
    await loadSettings();
    window.postMessage({
      type: '__WILDCARD_UPDATE__',
      preservePrompt: preservePrompt
    }, '*');
  });

  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data.type !== '__WILDCARD_SWAP_REQUEST__') {
      return;
    }

    const { id, payload } = e.data;
    if (typeof id === 'undefined' || !payload) return;

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
