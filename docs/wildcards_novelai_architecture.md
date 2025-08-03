# Wildcards for NovelAI Diffusion ― 基盤アーキテクチャ設計ドキュメント

## 1. プロジェクト概要

本プロジェクトは **NovelAI WebUI** 向けワイルドカード展開ツールの改造版を、スケーラブルかつ拡張性の高い形へ再構築することを目的とする。従来の *正規表現＋置換* 中心の実装では、条件分岐や入力欄横断ロジックを追加した際に保守性が限界に達したため、以下の 3 段階で刷新を進める。

- **Phase 1:** パーサ／評価エンジンを AST＋Web Worker 化（≒現行コードの置き換え）
- **Phase 2:** ワイルドカード辞書を SQLite へ移行し、高速全文検索（FTS5）を導入
- **Phase 3:** ルールエンジン・GUI・自動チューニングの統合

## 2. 全体アーキテクチャ

```
┌──────────────┐
│ NovelAI WebUI │  ユーザ入力
└─────┬─────────┘
      │ postMessage({prompt,…})
      ▼
┌──────────────────────────────┐
│ Content Script (injector.js) │  *薄いアダプタ*
└─────┬────────────────────────┘
      │ StructuredClone
      ▼
┌──────────────────────────────┐
│  Web Worker (core.worker)    │
│  ├─ PEG/Chevrotain パーサ     │  AST 生成
│  ├─ 評価パイプライン         │  ①Token展開 ②条件判定 ③重み抽選 ④除外
│  ├─ SQLite アクセス層        │  better‑sqlite3 / sqlite‑wasm
│  └─ ルールエンジン           │  json‑rules‑engine 等
└─────┬────────────────────────┘
      │ expandedPrompt
      ▼
┌──────────────┐
│ NovelAI fetch │ 最終プロンプト送信
└──────────────┘
```

### 2.1 技術選定

| 階層      | 技術スタック                                                 | 理由                            |
| ------- | ------------------------------------------------------ | ----------------------------- |
| パーサ     | **Chevrotain (TS)**                                    | 高速・エラー回復・AST 自由度              |
| データベース  | **better‑sqlite3 (ネイティブ)** / **sqlite‑wasm+OPFS (拡張)** | 同期 API で簡潔・高速。ブラウザでもワンコード運用   |
| ルールエンジン | **json‑rules‑engine** (ブラウザ互換)                         | JSON DSL で宣言的、優先度 & 依存関係管理が容易 |
| UI      | Vue / React + Vite                                     | 既存拡張と親和性が高い                   |

### 2.2 AST 評価パス

1. **Token 展開** … `__tag__` / `__file/path__` を DB クエリでランダム又は重み付き解決
2. **条件分岐 (@if)** … ルール DSL へ変換し、json‑rules‑engine で真偽判定
3. **Choice (**``**)** … 重み抽選は 1 ノード 1 回のみ実行
4. **排他 (!\~())** … 対象タグ一覧を生成後、一括フィルタ

## 3. データベース設計

```sql
-- 主要テーブル
CREATE TABLE tag_categories (
  id          INTEGER PRIMARY KEY,
  name        TEXT UNIQUE
);
CREATE TABLE tags (
  id          INTEGER PRIMARY KEY,
  name        TEXT UNIQUE,
  category_id INTEGER REFERENCES tag_categories(id),
  popularity  REAL,
  synonyms    TEXT
);
CREATE TABLE wildcards (
  id       INTEGER PRIMARY KEY,
  path     TEXT,
  weight   REAL DEFAULT 1.0,
  tag_id   INTEGER REFERENCES tags(id)
);
CREATE TABLE rules (
  id        INTEGER PRIMARY KEY,
  scope     TEXT,      -- prompt / negative / uc
  condition TEXT,      -- DSL
  action    TEXT,      -- DSL
  priority  INTEGER
);
-- FTS5 仮想テーブル
CREATE VIRTUAL TABLE tag_search USING fts5(name, synonyms, tokenize="unicode61");
```

**インデックス** は `tags(name)`, `wildcards(path)`, `rules(scope,priority)` を中心に作成。`FTS5` で全文検索を処理し、LIKE の全表走査を排除。

## 4. ルールエンジン統合

- Rules テーブル → AST 変換 → json‑rules‑engine へ投入し、プロンプトごとに **トポロジカルソート** で循環を静的検査。
- アクション種類：`EXCLUDE`, `INJECT`, `WEIGHT=`, `OVERRIDE`, `DISABLE` 等を予定。
- ルール GUI では行単位で ON/OFF・優先度変更を即時 Worker へ送信。

## 5. パフォーマンス最適化

| 処理        | 目標               | 手段                            |
| --------- | ---------------- | ----------------------------- |
| ワイルドカード展開 | ≤ 5 ms/回         | prepared statement & メモ化      |
| FTS5 検索   | ≤ 20 ms (10 件)   | FTS5 + snippet() + PRAGMA 数調整 |
| AST 生成    | ≤ 2 ms/500 token | Chevrotain FAST mode          |
| UI 応答     | ノンブロッキング         | すべて Worker 経由                 |

## 6. テストと CI/CD

1. **Unit**: AST → 期待出力スナップショット (Jest)
2. **Property**: ランダム辞書・条件で無限ループ検証 (fast‑check)
3. **E2E**: Puppeteer で NovelAI 生成リクエスト body を比較
4. **CI**: GitHub Actions で `knex migrate:latest`, `sqlite3 < schema.sql`, `npm test`

## 7. フェーズ別ロードマップ (90 日)

| 期間      | マイルストーン                         | 主なアウトプット                               |
| ------- | ------------------------------- | -------------------------------------- |
| 0–30 日  | AST Worker & better‑sqlite3 PoC | `core.worker.ts`, `wildcard_import.js` |
| 31–60 日 | Knex Migration + ルール DSL パーサ    | `rule_parser.ts`, `migration/*.js`     |
| 61–90 日 | ルール GUI & FTS5 チューニング           | `RuleManager.vue`, `perf_report.md`    |

## 8. ブラウザ拡張 (OPFS) 対応

- sqlite‑wasm を **Dedicated Worker** 内で同期呼び出し。
- DB ファイルは OPFS 直下に保存 (容量上限 2 GB)；バックアップは IndexedDB に差分コピー。
- オフライン時は差分キャッシュを起動時にマージ。

## 9. リスクと対策

| リスク           | 影響      | 対策                         |
| ------------- | ------- | -------------------------- |
| DB ロック競合      | レスポンス遅延 | WAL + busyTimeout + 読取主体設計 |
| FTS5 インデックス膨張 | ストレージ圧迫 | 必要列のみトークナイズ、定期 `optimize`  |
| ルール循環参照       | 無限ループ   | AST 構築時に循環検出・CI でテスト       |

## 10. まとめ

本設計は「**AST → Web Worker → SQLite (FTS5) → ルールエンジン**」のレイヤ分離により、

- **保守性**：新機能は AST ノード追加で済み、既存パスを壊さない
- **性能**：同期 API でも UI 非ブロック、FTS5 で高速検索
- **拡張性**：Phase 3 の高度ルール・GUI・ベイズ最適化までシームレスに吸収 という 3 点を同時達成する。

今後はロードマップに沿って PoC → マイグレーション → GUI 統合を進め、画像生成プロンプトの複雑化に耐えうる堅牢な基盤を完成させる。

