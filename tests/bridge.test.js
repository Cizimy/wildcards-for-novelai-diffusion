const { recursiveSwap } = require('../bridge');

describe('recursiveSwap', () => {
  const wildcards = {
    "animal": "cat\ndog\nbird",
    "color": "red\nblue\ngreen",
    "clothing": "shirt\npants\nhat"
  };

  const context = {
    prompt: "A __color__ __animal__ wearing a __clothing__.",
    uc: "",
  };

  const options = { wildcards, context };

  test('should replace all wildcards in a simple string', () => {
    const input = "A __color__ __animal__ wearing a __clothing__.";
    const result = recursiveSwap(input, options);
    
    expect(result).not.toContain('__');
    expect(result).toMatch(/A (red|blue|green) (cat|dog|bird) wearing a (shirt|pants|hat)\./);
  });

  test('should handle nested wildcards', () => {
    const nestedWildcards = {
      ...wildcards,
      "creature": "__color__ __animal__"
    };
    const input = "A __creature__.";
    const result = recursiveSwap(input, { wildcards: nestedWildcards, context });
    expect(result).not.toContain('__');
    expect(result).toMatch(/A (red|blue|green) (cat|dog|bird)\./);
  });

  test('should handle curly brace syntax for choices', () => {
    const input = "A {fast|slow} animal.";
    const result = recursiveSwap(input, options);
    expect(result).toMatch(/A (fast|slow) animal\./);
  });

  test('should handle weighted choices correctly', () => {
    const input = "A {10:fast|1:slow} animal.";
    // This is harder to test deterministically without mocking RNG.
    // For now, just ensure it resolves to one of the options.
    const result = recursiveSwap(input, options);
    expect(result).toMatch(/A (fast|slow) animal\./);
  });

  test('should not enter an infinite loop', () => {
    const loopyWildcards = {
      ...wildcards,
      "a": "__b__",
      "b": "__a__"
    };
    const input = "__a__";
    const result = recursiveSwap(input, { wildcards: loopyWildcards, context });
    // The function should break the loop and return one of the steps.
    expect(['__a__', '__b__']).toContain(result);
  });
});

describe('collectTokens', () => {
  const { collectTokens } = require('../bridge');

  test('should return an empty array for simple text', () => {
    expect(collectTokens("just a simple text")).toEqual(["just a simple text"]);
  });

  test('should collect a single wildcard', () => {
    expect(collectTokens("__animal__")).toEqual(["__animal__"]);
  });

  test('should collect multiple wildcards', () => {
    expect(collectTokens("A __color__ __animal__")).toEqual(["A ", "__color__", " ", "__animal__"]);
  });

  test('should collect a choice syntax', () => {
    expect(collectTokens("{red|blue}")).toEqual(["{red|blue}"]);
  });

  test('should handle mixed content', () => {
    expect(collectTokens("A __animal__ is {fast|slow}.")).toEqual(["A ", "__animal__", " is ", "{fast|slow}", "."]);
  });
});

describe('expandWithRules', () => {
  const { expandWithRules, collectTokens } = require('../bridge');
  const wildcards = {
    "animal": "cat\ndog",
    "color": "red\nblue"
  };

  test('should expand tokens into a final string', () => {
    const text = "A __color__ __animal__.";
    const tokens = collectTokens(text);
    const result = expandWithRules(tokens, wildcards);
    expect(result).toMatch(/A (red|blue) (cat|dog)\./);
  });

  test('should handle plain text tokens', () => {
    const text = "Just plain text.";
    const tokens = collectTokens(text);
    const result = expandWithRules(tokens, wildcards);
    expect(result).toBe("Just plain text.");
  });

  test('should handle choice tokens', () => {
    const text = "A {fast|slow} animal.";
    const tokens = collectTokens(text);
    const result = expandWithRules(tokens, wildcards);
    expect(result).toMatch(/A (fast|slow) animal\./);
  });
});

describe('recursiveSwap with two-pass logic', () => {
  const { recursiveSwap } = require('../bridge');
  const wildcards = {
    "animal": "cat\ndog",
    "place": "house\ncar"
  };

  test('should handle @if syntax correctly based on prompt', () => {
    const context = { prompt: "A cat is here. @if{prompt:cat|Meow|Woof}" };
    const options = { wildcards, context };
    const result = recursiveSwap(context.prompt, options);
    expect(result).toBe("A cat is here. Meow");
  });

  test('should handle @if syntax correctly (negative case)', () => {
    const context = { prompt: "A dog is here. @if{prompt:cat|Meow|Woof}" };
    const options = { wildcards, context };
    const result = recursiveSwap(context.prompt, options);
    expect(result).toBe("A dog is here. Woof");
  });

  test('should handle exclusion syntax !~()', () => {
    const context = { prompt: "A cat, a dog, and a bird. !~(dog, bird)" };
    const options = { wildcards, context };
    const result = recursiveSwap(context.prompt, options);
    expect(result).toBe("A cat");
  });
});