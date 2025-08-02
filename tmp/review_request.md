# コードレビュー依頼：`bridge.js`のリファクタリングにおける課題

## 1. 目的

`docs/sprint1_action_plan.md`に基づき、`bridge.js`のワイルドカード処理を二段階パス（トークン収集 → ルール適用・展開）方式にリファクタリングしています。

## 2. 現在の状況

- Jestによるテスト環境を構築済みです。
- `recursiveSwap`関数を、`options`オブジェクトを受け取るようにリファクタリングしました。
- `recursiveSwap`の内部で`collectTokens`（Pass 1）と`expandWithRules`（Pass 2）を呼び出す二段階パス処理を導入しました。
- 基本的なワイルドカード展開に関するテストはパスしています。

## 3. 課題：解決できないテスト失敗

いくつかの修正を試みましたが、以下の2つのテストケースが依然として失敗します。

### 失敗ケース1：`@if`構文の否定条件

`@if{scope:condition|then|else}`構文で、条件が偽の場合に`else`節が返されるべきテストが失敗します。常に`then`節が返されてしまいます。

- **該当テストコード (`tests/bridge.test.js`):**
  ```javascript
  test('should handle @if syntax correctly (negative case)', () => {
    const context = { prompt: "A dog is here. @if{prompt:cat|Meow|Woof}" };
    const options = { wildcards, context };
    const result = recursiveSwap(context.prompt, options);
    expect(result).toBe("A dog is here. Woof"); // 失敗： "A dog is here. Meow" が返る
  });
  ```- **考えられる原因:** `deepSwap`による再帰処理の過程で、`parseIf`関数が参照する`context`が正しく更新されておらず、常にトップレベルのプロンプトを評価している可能性があります。

### 失敗ケース2：`!~()`除外構文

`!~(tag)`構文で指定したタグをプロンプトから除外するテストが失敗します。タグは削除されるものの、不要なカンマやスペースが残ってしまい、文字列が不正な形式になります。

- **該当テストコード (`tests/bridge.test.js`):**
  ```javascript
  test('should handle exclusion syntax !~()', () => {
    const context = { prompt: "A cat, a dog, and a bird. !~(dog, bird)" };
    const options = { wildcards, context };
    const result = recursiveSwap(context.prompt, options);
    expect(result).toBe("A cat"); // 失敗： "A cat, a, and a, ." のような不正な文字列が返る
  });
  ```
- **考えられる原因:** `removeExclusiveTags`関数内の正規表現が、タグの前後の空白やカンマを適切に処理できていないようです。

## 4. 関連コード (`bridge.js`)

レビューをお願いしたい主要な関数は以下の通りです。

```javascript
// deepSwap: 再帰的にオブジェクトを探索し、文字列にrecursiveSwapを適用する
const deepSwap = (o, options) => {
  if (typeof o === 'string') return recursiveSwap(o, options);
  if (Array.isArray(o)) return o.map(item => deepSwap(item, options));
  if (o && typeof o === 'object') {
    const newObj = {};
    for (const k in o) {
      // ここのコンテキストの渡し方に問題がある可能性
      const newOptions = { wildcards: options.wildcards, context: o };
      newObj[k] = deepSwap(o[k], newOptions);
      if (k === 'char_captions' && Array.isArray(newObj[k]) && newObj[k].length > 6)
        newObj[k] = newObj[k].slice(0, 6);
    }
    return newObj;
  }
  return o;
};

// parseIf: @if構文を解釈する
function parseIf(text, context) {
  // ...
  // ここで参照するcontext.promptが常にトップレベルのものになっている可能性
  const checkString = (context.prompt || '').replace(`@if{${text}}`, '');
  // ...
}

// removeExclusiveTags: !~()構文を処理する
function removeExclusiveTags(text) {
  // ...
  // タグ削除後のカンマやスペースの処理に問題がある可能性
  const tagPattern = new RegExp(`\\s*,?\\s*\\b${escapedTag}\\b\\s*,?`, 'gi');
  result = result.replace(tagPattern, ',');
  // ...
}
```

実装のロジックに根本的な誤りがある可能性があります。第三者の視点からのレビューをいただけますと幸いです。