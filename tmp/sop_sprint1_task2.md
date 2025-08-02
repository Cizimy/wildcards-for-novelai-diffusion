# SOP: Sprint 1 - Task 2.0-2.3

## 1. 目的

`sprint1_action_plan.md` のタスク 2.0 から 2.3 に基づき、`bridge.js` のAPIを拡張し、二段階パス処理（トークン収集 → ルール適用による展開）を実装する。

## 2. プロジェクト憲法

- **TDD**: 変更には必ずテストを先行させるか、既存のテストカバレッジを維持・向上させる。
- **YAGNI**: `sprint1_action_plan.md` で要求されている機能のみを実装する。
- **KISS**: 複雑なロジックは避け、可読性の高いシンプルなコードを維持する。

## 3. 作業手順

### 3.1. `bridge.js` API拡張 (Task 2.0)

1.  **シグネチャ変更**:
    -   `recursiveSwap(txt, dict, context)` を `recursiveSwap(reqJson, options)` に変更する。
    -   `options` オブジェクトには `wildcards` (旧 `dict`) を含める。
    -   `deepSwap(o, dict, context)` を `deepSwap(o, options)` に変更する。
2.  **呼び出し元修正**:
    -   `bridge.js` 内の `deepSwap` から `recursiveSwap` への呼び出しを新シグネチャに合わせる。
    -   `injector.js` の `deepSwap` から `bridge.js` への `postMessage` のペイロードを修正する。
3.  **テスト修正**:
    -   `tests/bridge.test.js` のテストケースを新しい `recursiveSwap` のシグネチャに合わせて修正する。
    -   `npm test` を実行し、すべてのテストがパスすることを確認する。

### 3.2. 二段階パス実装 (Task 2.1 & 2.2)

1.  **Pass 1: `collectTokens` 実装 (Task 2.1)**
    -   `bridge.js` 内に `collectTokens(text)` 関数を新規作成する。
    -   この関数は、与えられたテキストからワイルドカード (`__name__`) や選択構文 (`{a|b}`) などのトークンを再帰的に収集し、配列として返す。
    -   `collectTokens` 用の単体テストを `tests/bridge.test.js` に追加し、テストをパスさせる。
2.  **Pass 2: `expandWithRules` 実装 (Task 2.2)**
    -   `bridge.js` 内に `expandWithRules(tokens, wildcards, rules)` 関数を新規作成する。
    -   この関数は `collectTokens` が返したトークン配列とワイルドカード辞書を元に、プロンプトを展開する。
    -   初期実装では `rules` 引数は無視し、従来のワイルドカード展開ロジックのみを実装する。
    -   `expandWithRules` 用の単体テストを追加し、テストをパスさせる。
3.  **`recursiveSwap` のリファクタリング**:
    -   `recursiveSwap` の内部ロジックを、`collectTokens` と `expandWithRules` を呼び出す二段階パス処理に置き換える。
    -   `npm test` を実行し、既存のテストがすべてパスすることを確認する。

### 3.3. 呼び出し元修正 (Task 2.3)

1.  **`injector.js` の最終調整**:
    -   `bridge.js` のAPI変更に伴う `injector.js` の呼び出し部分を最終確認し、必要であれば修正する。
    -   特に `deepSwap` の非同期呼び出しが正しく動作することを確認する。
2.  **`popup.js` の確認**:
    -   `popup.js` が今回の変更で影響を受けていないかを確認する。現時点では影響はない見込み。
3.  **手動テスト**:
    -   Chrome拡張機能をビルド（またはリロード）し、実際に画像生成を試す。
    -   従来のワイルドカード機能（`__name__`, `{a|b}` など）がすべてクラッシュせずに動作することを確認する。

## 4. 完了条件

- `sprint1_action_plan.md` のタスク 2.0, 2.1, 2.2, 2.3 の完了条件をすべて満たしていること。
- `npm test` がすべてのテストをパスすること。
- 拡張機能が既存のユースケースで正常に動作すること。

## 5. クリーンアップ

- 作業完了後、このSOPファイル (`sop_sprint1_task2.md`) を削除する。