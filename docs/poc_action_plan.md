# PoC フェーズ ― アクションプラン

## 0. 位置づけ

本ドキュメントは「基盤アーキテクチャ設計ドキュメント」で定義した Phase 1 (=PoC) を **30 日で完遂** するための具体的な行動計画を示す。目的は *AST + Worker + SQLite + 最小ルール* をつなぎ込み、NovelAI に正しく展開済みプロンプトを返す最短経路を検証すること。

---

## 1. ゴール & 完了基準

| カテゴリ        | ゴール                                   | 計測方法                             |
| ----------- | ------------------------------------- | -------------------------------- |
| **機能**      | `__tag__` の DB 展開 & `@if{}` 条件 ON/OFF | Jest スナップショット全通過                 |
| **パフォーマンス** | 10 k 文字を **< 10 ms** でパース             | `benchmark.ts` 自動計測              |
| **統合**      | NovelAI fetch body に展開プロンプトが入る        | Puppeteer E2E テスト                |
| **品質**      | GitHub Actions で CI 緑                 | Node 20 / Chrome Headless matrix |

達成後に Architecture Doc の次フェーズへ移行する。

---

## 2. クリティカルパス

```mermaid
gantt
title PoC Critical Path (Day 0–30)
dateFormat  YYYY-MM-DD
section Core AST
  Grammar Spec & Tokens          :a1, 2025-08-03,3d
  Chevrotain Parser Skeleton     :a2, after a1,4d
  Unit Tests (AST)               :a3, after a2,3d
section Worker & Messaging
  Worker Bundle (Vite)           :b1, parallel a2,3d
  StructuredClone Contract       :b2, after b1,2d
section SQLite Layer
  Schema DDL + better-sqlite3    :c1, after a3,3d
  Import Script (TXT→DB)         :c2, after c1,2d
section Eval Pipeline
  Token Expansion Pass           :d1, after c2,2d
  Rule Pass (json-rules-engine)  :d2, after d1,2d
section Integration & Test
  Injector Bridge Replacement    :e1, after d2,2d
  Snapshot & E2E Tests           :e2, after e1,3d
  Perf Baseline & Docs           :e3, after e2,1d
```

**依存関係を崩さない** ために `a1→a2→a3→c1…` の順を固定。並列タスクは *Parser 実装* と *Worker バンドル* のみ。

---

## 3. タスク詳細

### 3.1 リポジトリ初期化

- `pnpm init -w` → `packages/core` & `packages/extension` を生成。
- ESLint / Prettier / husky (pre‑commit) をセット。
- GitHub Actions: Node 20, ubuntu‑latest。Chrome は `playwright install` で取得。

### 3.2 AST パーサ

| 項目        | 内容                                                    |
| --------- | ----------------------------------------------------- |
| **ライブラリ** | Chevrotain 10.x FAST mode [Best Practice: singletons] |
| **文法**    | `Token / Choice / Conditional / Exclusion` の4ノードのみ    |
| **テスト**   | `tests/parser.spec.ts` で 30 Fixture をスナップショット         |
| **Perf**  | 毎コミット `npm run bench:parser` 実行。                      |

### 3.3 Web Worker & 通信

- Vite `build.lib` で `core.worker.js` をバンドル。
- `structuredClone` + Transferable (ArrayBuffer) でゼロコピー。
- エラーは `SerializedError` 型で返す。

### 3.4 SQLite データ層

| 項目         | 内容                                                                   |
| ---------- | -------------------------------------------------------------------- |
| **ランタイム**  | better‑sqlite3 9.x (`npm i`)                                         |
| **DDL**    | `schema_v0.sql` (Tags / Wildcards / Rules + FTS5)                    |
| **Import** | `/scripts/import-wildcards.ts` … .txt → bulk INSERT                  |
| **CI**     | `npx knex migrate:latest && sqlite3 :memory: < schema_v0.sql` でチェック。 |

### 3.5 評価パイプライン

1. **Pass1: Token 展開** — `SELECT name FROM wildcards WHERE path=? ORDER BY RANDOM() LIMIT 1` を prepared。
2. **Pass2: Rule 判定** — `json-rules-engine` に `facts = {prompt, negative, uc}` を投入し、`EXCLUDE` だけ実装。
3. **Pass3: Choice / Exclusion** — 重み抽選とタグ削除。

### 3.6 テスト戦略

- **Unit (Jest)**: Parser と Evaluator の pure 関数をテスト。
- **Property (fast-check)**: ランダム辞書 + 深さ制限 AST で無限ループ検出。
- **E2E (Playwright/Puppeteer)**: NovelAI ページをモックし、`fetch` Intercept で body 検証。
- **Bench**: `benchmark.ts` が Perf Regression を GitHub Checks に出力。

---

## 4. 推奨ディレクトリ構造

```
/ packages
  / core
    parser/
    evaluator/
    db/
    tests/
  / extension
    injector.ts
    worker.ts
    manifest.json
/ scripts
  import-wildcards.ts
  benchmark.ts
/vite.config.ts
```

---

## 5. チームロードマップ (30 日)

| 週 | 完了目標                       | 担当            |
| - | -------------------------- | ------------- |
| 1 | Grammar 固定・Worker 雛形       | Dev A / Dev B |
| 2 | better‑sqlite3 + Import 完了 | Dev A         |
| 3 | Token + ルール Pass 実装        | Dev B         |
| 4 | Injector 置換・CI 緑           | Dev A / Dev B |

---

## 6. リスク & 対応

| リスク               | 兆候               | 対応策                                                |
| ----------------- | ---------------- | -------------------------------------------------- |
| Parser 性能不足       | ベンチで 10 ms 超     | Chevrotain `EmbeddedActions` 化 or WebAssembly 化を検討 |
| DB 競合             | `SQLITE_BUSY` 多発 | WAL + `PRAGMA busy_timeout` を増加                    |
| Worker → UI エラー伝播 | UI が無反応          | `postMessage({type:'error',…})` ハンドリングを必須化         |

---

## 7. 完了時に得られるもの

- **core.worker.ts**: AST → 展開文字列を返す純粋 API
- **wildcard\_import.js**: `.txt → SQLite` 変換スクリプト
- **E2E green**: fetch body に置換済みプロンプト
- **Perf Report**: 10 k 文字, 5 ms/回 の計測ログ

---

本 PoC の成果をベースに Phase 2 (FTS5 高速化) へ進むことで、大量タグ辞書 & 高度ルールでも破綻しないパフォーマンスを保証できる。

