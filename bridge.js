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
    return (
      simpleWildcardPattern.test(text) ||
      text.includes('@if{') ||
      /!\~\([^)]*\)/.test(text) || // Exclusion syntax !~(tag)
      /(?<!@if){([^|{}]+(?:\|[^|{}]+)+)}/.test(text) ||
      doublePipePattern.test(text)
    );
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

  function parseIf(text, context, matchText) {
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
        const checkString = (context.prompt || '').replace(matchText, '');
        const conditionRe = new RegExp(`\\b${escapeRegExp(varName)}=${escapeRegExp(varValue)}\\b`);
        return conditionRe.test(checkString) ? thenBranch : elseBranch;
      }
      const [scope, condition] = conditionParts;
      let targetText = getPropertyByScope(context, scope);
      // The same @if expression is included in the evaluation target, which causes an incorrect condition determination, so it is excluded.
      if (typeof targetText === 'string') {
        targetText = targetText.replace(matchText, '');
      }
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

    // Use a regex that can handle nested braces to some extent, but not infinitely.
    // This is a limitation but better than the previous implementation.
    const ifPattern = /@if{((?:[^{}]|{(?:[^{}]|{[^{}]*})*})*?)}/;
    const ifMatch = result.match(ifPattern);

    if (ifMatch) {
        const wholeMatch = ifMatch[0];
        const content = ifMatch[1];
        const replacement = parseIf(content, context, wholeMatch);
        return result.replace(wholeMatch, replacement);
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
  // 1) すべての !~(...) を収集
  const tagGroups = [...text.matchAll(/!\~\(([^)]*)\)/g)];
  if (tagGroups.length === 0) return text;

  // 2) キャプチャ m[1] からタグを取り出す
  const tags = tagGroups.flatMap(m =>
    m[1]                      // "dog, cat" などキャプチャ部分
      .split(',')             // カンマで区切る
      .map(t => t.trim())     // 前後空白を除去
      .filter(Boolean)        // 空文字を除去
  );

  // 3) 全 !~(...) をテキストから除去
  let stripped = text.replace(/!\~\([^)]*\)/g, '');

  // 4) "," または "and" でセグメント分割
  const segments = stripped.split(/,\s*|\s+and\s+/i);

  // 5) 各セグメントに除外タグが含まれていれば捨てる
  const kept = segments
    .filter(seg =>
      !tags.some(tag => new RegExp(`\\b${escapeRegExp(tag)}\\b`, 'i').test(seg))
    )
    .map(s => s.trim())
    .filter(Boolean);

  // 6) 再結合して後始末
  return kept
    .join(', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[,\.]\s*$/, '');
}

// ユーティリティ: 正規表現用に特殊文字をエスケープ
function collectTokens(text) {
  if (!text) return [];
  const regex = /(@if{[^{}]*})|(__[A-Za-z0-9_\/-]+__)|({[^{}]*\|[^{}]*})/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    parts.push(match[0]); // PUSH THE MATCHED STRING
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

  function expandWithRules(tokens, wildcards, rules = {}) {
    // rules are ignored for now (Task 2.2)
    const expanded = tokens.map(tokenObj => {
      const token = Array.isArray(tokenObj) ? tokenObj : tokenObj;

      // This is a simplified expansion that only handles wildcards and choices.
      // It does not handle @if or !~() syntax, which will be handled by the main recursiveSwap loop for now.
      
      const simpleWildcardMatch = token.match(simpleWildcardPattern);
      if (simpleWildcardMatch) {
          const name = simpleWildcardMatch[1]; // Use captured group
          let raw = wildcards[name];
          if (!raw && name.includes('/')) {
              const variations = [name.replace(/\//g, '_'), name.replace(/\//g, '-'), name.replace(/\//g, '')];
              for (const variation of variations) {
                  if (wildcards[variation]) {
                      raw = wildcards[variation];
                      break;
                  }
              }
          }
          if (!raw) return token;
          raw = raw.replace(/\\\(/g, '(').replace(/\\\)/g, ')');
          const lines = raw.split(/\r?\n/).filter(Boolean);
          if (!lines.length) return token;
          return lines[Math.floor(rng() * lines.length)];
      }

      const choiceMatch = token.match(/(?<!@if){([^|{}]+(?:\|[^|{}]+)+)}/);
      if (choiceMatch) {
          const group = choiceMatch[1]; // Use captured group
          const opts = group.split('|');
          return opts.some(opt => /(?<!\\):/.test(opt)) ? chooseWeighted(opts) : opts[Math.floor(rng() * opts.length)];
      }
      
      return token;
    });

    return expanded.join('');
  }

  function recursiveSwap(txt, options) {
    const { wildcards, context } = options;
    const tokens = collectTokens(txt);
    let expanded = expandWithRules(tokens, wildcards);

    // The main loop now handles more complex syntax like @if and !~()
    // that were not handled by the initial expandWithRules.
    let current = expanded;
    let iteration = 0;
    const history = new Set([current]);

    while (containsWildcardSyntax(current) && iteration < 100) {
      const next = swap(current, wildcards, context);
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

  const deepSwap = (o, options) => {
    if (typeof o === 'string') return recursiveSwap(o, options);
    if (Array.isArray(o)) return o.map(item => deepSwap(item, options));
    if (o && typeof o === 'object') {
      const newObj = {};
      for (const k in o) {
        // Pass the full object 'o' as context for each level
        const newOptions = { wildcards: options.wildcards, context: o };
        newObj[k] = deepSwap(o[k], newOptions);
        if (k === 'char_captions' && Array.isArray(newObj[k]) && newObj[k].length > 6)
          newObj[k] = newObj[k].slice(0, 6);
      }
      return newObj;
    }
    return o;
  };

  function getPropertyByScope(obj, scope) {
    const scopeLower = scope.toLowerCase().trim();

    if (scopeLower === 'prompt' || scopeLower === 'input') {
      return obj.prompt ?? obj.input;
    }
    
    if (scopeLower === 'uc' || scopeLower === 'negative_prompt') {
      if (typeof obj.uc === 'string') return obj.uc;
      if (typeof obj.negative_prompt === 'string') return obj.negative_prompt;
      if (obj?.parameters && typeof obj.parameters.negative_prompt === 'string') {
        return obj.parameters.negative_prompt;
      }
      return ''; // Return empty string if none found
    }

    if (typeof obj[scope] !== 'undefined') {
      return obj[scope];
    }
    if (obj?.parameters && typeof obj.parameters[scope] !== 'undefined') {
      return obj.parameters[scope];
    }
    return undefined;
  }

  // --- End of moved functions ---
  // --- For testing purposes ---
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createRNG,
      containsWildcardSyntax,
      chooseWeighted,
      parseIf,
      swap,
      escapeRegExp,
      removeExclusiveTags,
      recursiveSwap,
      deepSwap,
      getPropertyByScope,
      collectTokens,
      expandWithRules,
    };
    return; // Prevent rest of the script from running in test env
  }

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
      const options = { wildcards: wildcards, context: payload };
      const result = deepSwap(payload, options);
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
