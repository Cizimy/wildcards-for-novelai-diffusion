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
        return array / (0xFFFFFFFF + 1);
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

  function swap(txt, dict, v3) {
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
      const forceV3 = lines.some(line => containsWildcardSyntax(line));
      const effectiveV3 = forceV3 || v3;
      if (effectiveV3) {
        return lines[Math.floor(rng() * lines.length)];
      } else {
        return `||${lines.join('|')}||`;
      }
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
    
    // Conditional logic is intentionally simplified here for security review.
    // A full implementation would require more robust parsing.
    return result;
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function removeExclusiveTags(text) {
    const exclusionPattern = /!((?:"[^"]+")|(?:[A-Za-z0-9_ -]+))/g;
    const exclusions = [];
    let result = text;
    result = result.replace(exclusionPattern, (fullMatch, tag) => {
      if (tag.startsWith('"') && tag.endsWith('"')) {
        tag = tag.substring(1, tag.length - 1);
      }
      exclusions.push(tag.trim());
      return '';
    });
    for (const exclusion of exclusions) {
      if (!exclusion) continue;
      const escapedExclusion = escapeRegExp(exclusion);
      const tagPattern = new RegExp(`(^|[,\\s])${escapedExclusion}(?=$|[,\\s])`, 'gi');
      result = result.replace(tagPattern, '$1%%REMOVED%%');
    }
    return result.replace(/%%REMOVED%%/g, '')
                   .replace(/,\s*,/g, ',')
                   .replace(/^\s*,\s*|\s*,\s*$/g, '')
                   .replace(/\s+/g, ' ')
                   .trim();
  }

  function recursiveSwap(txt, dict, v3) {
    let current = txt;
    let iteration = 0;
    while (containsWildcardSyntax(current) && iteration < 500) {
      const next = swap(current, dict, v3);
      if (next === current) break;
      current = next;
      iteration++;
    }
    current = removeExclusiveTags(current);
    return current;
  }

  const deepSwap = (o, dict, v3) => {
    if (typeof o === 'string') return recursiveSwap(o, dict, v3);
    if (Array.isArray(o)) return o.map(item => deepSwap(item, dict, v3));
    if (o && typeof o === 'object') {
      const newObj = {};
      for (const k in o) {
        newObj[k] = deepSwap(o[k], dict, v3);
        if (k === 'char_captions' && Array.isArray(newObj[k]) && newObj[k].length > 6)
          newObj[k] = newObj[k].slice(0, 6);
      }
      return newObj;
    }
    return o;
  };

  // --- End of moved functions ---

  let wildcards = {};
  let v3mode = false;
  let preservePrompt = false;

  // 1) Load initial settings
  const loadSettings = async () => {
    const settings = await chrome.storage.local.get(['wildcards', 'v3mode', 'preservePrompt']);
    wildcards = settings.wildcards || {};
    v3mode = settings.v3mode || false;
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
      v3: v3mode,
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
      v3: v3mode,
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
      const result = deepSwap(payload, wildcards, v3mode);
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
