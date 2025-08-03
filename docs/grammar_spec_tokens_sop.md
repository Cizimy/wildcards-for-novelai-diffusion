# Grammar Spec & Tokens — SOP (Standard Operating Procedure)

> **対象タスク** : `a1 Grammar Spec & Tokens` — 2025‑08‑03 開始、3 日完了 **対象リポジトリ** : `github.com/Cizimy/wildcards-for-novelai-diffusion (feature/sprint1)` **適用方針** : TDD / YAGNI / KISS を順守

---

## 1. 目的

Chevrotain ベースのパーサ実装に先立ち、**最小実用文法**（Token / Choice / Conditional / Exclusion）のシンボル定義とトークン化ルールを 3 日で確定する。​以降の AST・評価レイヤの土台とし、ユニットテストで仕様を固定する。

---

## 2. 成果物 (DoD)

| ID | 成果物                        | 完了条件                                             |
| -- | -------------------------- | ------------------------------------------------ |
| D1 | `grammar/tokens.ts`        | Chevrotain Token 定義を export。CI で型エラー・Lint エラー 0。 |
| D2 | `grammar/grammar.ne.md`    | 人間可読な BNF/PEG 仕様書 (Markdown) をコミット。              |
| D3 | `tests/parser.spec.ts`     | 30 fixture が ALL GREEN。Jest snapshot。            |
| D4 | `benchmark/parser.test.ts` | 10 k 文字 ≤ 10 ms を満たす。                            |

---

## 3. タイムライン & クリティカルチェック

| 日             | 主要作業                                   | 担当    | レビュー  | Exit Gate           |
| ------------- | -------------------------------------- | ----- | ----- | ------------------- |
| Day 0 (08‑03) | リポジトリ更新・Issue 作成 (`SOP‑a1`)、トークン一覧ドラフト | Dev A | TL    | Issue 承認            |
| Day 1         | Token 正規表現 & モード実装、BNF 起草              | Dev A | Dev B | `tokens.ts` lint OK |
| Day 2 AM      | FAST モード Grammar 実装、サンプル入力 10 本通過      | Dev A | Dev B | Parser 生成 OK        |
| Day 2 PM      | Jest 30 Fixture 作成 + snapshot 固定       | Dev B | Dev A | Unit GREEN          |
| Day 3 AM      | 10 k Bench 計測 → チューニング (if >10 ms)     | Dev A | TL    | Perf 合格             |
| Day 3 PM      | SOP レビュー & Merge → Tag `poc‑a1‑done`   | Dev B | TL    | Pull Request merged |

---

## 4. 実装ガイドライン (KISS/YAGNI 適用)

1. **Token 分割は 4 系統のみ** :
   - `LBrace`, `RBrace`, `Pipe`, `BangTilde` など構造トークン
   - `IfKeyword` → `@if` だけ専用 Token
   - `WildcardToken` → `__[^_]+__` 正規表現（貪欲禁止）
   - `TextToken` → それ以外の文字列
2. **モード数は 1** (DEFAULT) — ネスト深度によるモード切替は Phase 2 で検討。
3. **エスケープ仕様は未実装 (YAGNI)** — `\{`, `\|` などは未サポート。必要が明確になるまで保留。
4. **エラー回復** は `recover(true)` フラグのみ設定し、詳細ハンドラは後続タスク。

---

## 5. サンプル BNF (draft v0.1)

```bnf
<Prompt>      ::= <Branch> ("," <Branch>)*
<Branch>      ::= <Choice> | <Conditional> | <Exclusion> | <Token>
<Choice>      ::= "{" <Branch> ("|" <Branch>)+ "}"
<Conditional> ::= "@if" "{" <Condition> ":" <Branch> ("|" <Branch>)? "}"
<Exclusion>   ::= "!~(" <CSVTags> ")"
<Token>       ::= <Wildcard> | <Text>
```

---

## 6. テスト設計 (TDD)

### 6.1 フィクスチャ項目

| Case                            | 入力                    | 期待 AST ルート        |                    |
| ------------------------------- | --------------------- | ----------------- | ------------------ |
| 01                              | `hello`               | `TextNode`        |                    |
| 02                              | \`{red                | blue}\`           | `ChoiceNode(br=2)` |
| 03                              | `@if{prompt:cat:dog}` | `ConditionalNode` |                    |
| 04                              | `__hair/color__`      | `WildcardNode`    |                    |
| 05                              | `!~(long_hair)`       | `ExclusionNode`   |                    |
| *拡張は 30 ケースまで増やし、深度 5 ネストを含める。* |                       |                   |                    |

### 6.2 パフォーマンス試験

```ts
const longPrompt = "a ".repeat(5000);
expect(parse(longPrompt).time).toBeLessThan(10);
```

---

## 7. コーディング規約

- **ファイル配置** : `packages/core/parser/{tokens.ts, grammar.ts}`
- **命名** : Token 名は `CamelCaseToken`、CST/AST ノードは `PascalNode`
- **型** : `export interface WildcardNode extends BaseNode { path: string }`
- **禁止事項** : RegExp の後読み／後方参照 (`(?<=)`/`(?=)`) は使用しない

---

## 8. レビュー基準

| 項目          | Accept 条件                             |
| ----------- | ------------------------------------- |
| Style       | ESLint (airbnb‑base) & Prettier pass  |
| Coverage    | `parser.spec.ts` 行カバレッジ ≥ 90 %        |
| Performance | 10 k文字 < 10 ms (M1 MacBook / Node 20) |
| Docs        | `grammar.ne.md` に BNF + Token 一覧完備    |

---

## 9. ベストプラクティス参照 (Web)

- **Chevrotain v10 Docs**: FAST mode & embedded actions
- **ANTLR v4 Best Grammar Practices** for error recovery 選択肢
- **Parser Benchmarks 2024**: Chevrotain が JS ライブラリ中最速 (median)

---

## 10. コミットメッセージ規約

`feat(parser): add WildcardToken & basic grammar skeleton (#SOP‑a1)`

---

### 付録 A — Token 定義雛形 (TypeScript)

```ts
import { createToken } from "chevrotain";
export const LBrace       = createToken({ name: "LBrace", pattern: /\{/ });
export const RBrace       = createToken({ name: "RBrace", pattern: /\}/ });
export const Pipe         = createToken({ name: "Pipe", pattern: /\|/ });
export const IfKeyword    = createToken({ name: "IfKeyword", pattern: /@if/ });
export const BangTilde    = createToken({ name: "BangTilde", pattern: /!~/ });
export const WildcardToken= createToken({ name: "WildcardToken", pattern: /__[^_]+__/ });
export const TextToken    = createToken({ name: "TextToken", pattern: /[^{}|]+/ });
export const allTokens    = [LBrace,RBrace,Pipe,IfKeyword,BangTilde,WildcardToken,TextToken];
```

---

**完了したら PoC ドキュメントの **``** チェックボックスに ✅ を入れ、次タスク **``** へ移行する。**

