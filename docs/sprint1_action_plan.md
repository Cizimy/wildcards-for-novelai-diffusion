## 概要（要約）

* **better-sqlite3＋WAL＋FTS5** を基盤に据えることで、ファイル読み込み型より 10〜30× 高速なタグ検索を実現しつつ、JS からの同期 API でコードを簡潔化します ([GitHub][1], [GitHub][2])。
* テーブル設計は **“タグ辞書” と “ルール DSL” を正規化**。`Rules` テーブルには *scope (入力欄)* と *priority* を持たせ、循環参照を静的検査で弾く設計を採用します。索引は頻出列＋外部キーに絞り、`FTS5` 仮想テーブルを併用して LIKE 多用による全表走査を排除します ([sqlite.org][3], [Reddit][4], [blog.sqlitecloud.io][5])。
* **Knex などの Migration レイヤ** でスキーマのバージョン管理を自動化し、GitHub Actions → SQLite CLI テストまでを CI に組み込みます ([knexjs.org][6])。
* フェーズ3では **軽量ルールエンジン＋GUI** を載せ、ユーザが「矛盾ルール」を視覚的に ON/OFF／優先順位変更できるようにします。OSS の JS ルールエンジン（例えば Nected の調査で挙がる FastRuleEngine など）を組み込みつつ ([nected.ai][7])、データベース上の DSL を JIT コンパイルして実行速度を確保します。
* UI には **全文検索＋自動補完＋Wiki 抜粋ツールチップ** を実装し、Danbooru Wiki 2024 データセットの本文を FTS インデックスに取り込んでクエリレスポンスを <20 ms 程度に保ちます ([Hugging Face][8], [blog.sqlitecloud.io][9])。
* ブラウザ拡張としての配布を続ける場合は **SQLite-Wasm + Origin Private FileSystem (OPFS)** を fallback に使い、ネイティブ／Wasm の 2 層ビルドを生成します ([Chrome for Developers][10])。

---

## フェーズ2 — SQLite へのインフラ移行

### 2.1 ライブラリ選定とランタイム

| 選択肢                        | 長所                                             | 短所                                 |
| -------------------------- | ---------------------------------------------- | ---------------------------------- |
| **better-sqlite3** (ネイティブ) | 同期 API・最速ベンチ ([GitHub][1], [GitHub][2])        | ネイティブ Add-on が必要 (Electron/拡張でビルド) |
| `node:sqlite`              | Node18+ 公式、非同期                                 | 実装が若く、拡張性が未知数                      |
| **sqlite-wasm + OPFS**     | ブラウザ内で動作し拡張配布が容易 ([Chrome for Developers][10]) | 大規模データでは GC がコストに                  |

> **推奨:** デスクトップ版は *better-sqlite3*、ブラウザ拡張は Wasm ビルドの二本立て。
> \[WAL] をデフォルトにし、同時アクセス時のロック待ちを最小化する。

### 2.2 スキーマ設計 & インデックス

```sql
CREATE TABLE tag_categories (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE
);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE,
  category_id INTEGER REFERENCES tag_categories(id),
  popularity REAL,
  synonyms TEXT
);

CREATE TABLE wildcards (
  id INTEGER PRIMARY KEY,
  path TEXT,          -- ディレクトリ階層
  weight REAL DEFAULT 1.0,
  tag_id INTEGER REFERENCES tags(id)
);

CREATE TABLE rules (
  id INTEGER PRIMARY KEY,
  scope TEXT,         -- prompt / negative / uc など
  condition TEXT,     -- DSL (e.g. "1girl && !long_hair")
  action TEXT,        -- DSL (e.g. "EXCLUDE long_hair")
  priority INTEGER
);
```

* **索引**: `CREATE INDEX idx_tags_name ON tags(name);` など条件列中心 ([Reddit][4])。
* **全文検索**:

  ```sql
  CREATE VIRTUAL TABLE tag_search USING fts5(name, synonyms, tokenize="unicode61");
  ```

  で *部分一致・多言語* 検索を実装 ([sqlite.org][3], [SQL Easy][11])。

### 2.3 マイグレーション & CI

* **Knex.js** で `npx knex migrate:make init` → `migrate:latest` を GitHub Actions に組み込み、PR ごとに E2E テスト ([knexjs.org][6])。
* 既存 `.txt` → `INSERT` は Node スクリプトでワンショット変換し、差分アップデートは `ON CONFLICT DO UPDATE` で idempotent に。

### 2.4 インポートパイプライン

1. HuggingFace API から最新 parquet を DL ([Hugging Face][8])。
2. `category` ごとにフィルタし、`tags` テーブルへバルク挿入。
3. `other_names` → synonyms、`body` 先頭 120字 → ツールチップ。

### 2.5 パフォーマンス計測指標

| 処理                  | 目標 (500k タグ) | 備考                         |
| ------------------- | ------------ | -------------------------- |
| `__hair/color__` 展開 | ≤ 5 ms/回     | `prepared` statement キャッシュ |
| 全文検索 (FTS5)         | ≤ 20 ms      | PC/Wasm ともに                |
| txt→DB 変換           | 20k 行 / 秒    | Node16 i7                  |

---

## フェーズ3 — 新機能の統合と洗練

### 3.1 ルールエンジン

* **Nected などの軽量 OSS ルールエンジンをベース**に、DSL (`if{scope:expr|}`) を AST へパース ([nected.ai][7])。
* プロンプト毎に **ルール集合をトポロジカルソート** → 循環検出で即エラー。
* アクションは `EXCLUDE`, `INJECT`, `WEIGHT=` など 5 種でスコープごとに実行。

### 3.2 クロス入力欄ロジック

* **二段階パス (先読み→展開)** を正式仕様に格上げし、`prompt|negative|uc` をまたぐ除外を実現。
* チートシートの `!~()` と重ね、**実行時に「削除対象タグ一覧」を生成して一括フィルタ** 。

### 3.3 管理 UI

* **Rule Manager タブ**

  * テーブル (Vue/React) に `scope / condition / action / priority / enabled` を列挙。
  * 行ダブルクリックで DSL 編集 → SQL `UPDATE`.
* **FTS5 Live Search** でタグ候補を 10 件サジェスト (LIKE fallback)。
* GitHub mattjaybe のワイルドカード UI 等を参考にツールチップを表示 ([GitHub][12], [GitHub][13])。

### 3.4 自動チューニング & 分析

* 生成ログを DB に書き戻し、**タグ頻度 × 結果評価 (CLIPScore)** から重みをベイズ最適化。
* `EXPLAIN QUERY PLAN` を CI で回し、重いクエリは Slack 通知 ([sqlite.org][14])。

### 3.5 データ更新と互換維持

* HuggingFace 上流の commit を週次 diff → `ALTER TABLE ...` & reindex。
* バックアップは `VACUUM INTO 'wildcards_YYYYMMDD.db'`.

### 3.6 ブラウザ拡張対応

* Wasm ビルドでは **OPFS** 保存なので、容量 2 GB 上限に注意 ([Chrome for Developers][10])。
* オフライン fallback は IndexedDB に差分キャッシュ→起動時 merge。

---

## 次のアクション（90 日以内）

| 期間          | 作業                                        | 成果物                                                 |
| ----------- | ----------------------------------------- | --------------------------------------------------- |
| **0-30 日**  | better-sqlite3 PoC、txt→DB 移行スクリプト         | `wildcard_import.js`, `schema_v0.sql`               |
| **31-60 日** | Knex Migration ＆ Rule DSL AST 実装          | `migration/*.js`, `rule_parser.ts`                  |
| **61-90 日** | Rule Manager GUI, FTS5 チューニング, Wasm build | `popup-rule.vue`, `build-wasm.sh`, `perf_report.md` |

---

これでフェーズ2・3の土台と強化ポイントを網羅しました。
特に **FTS5 活用・二段階パス・GUI ルール管理** が “破綻のない画像生成” の完成度を大きく底上げする部分です。追加で深掘りしたい項目（例：評価メトリクスの数学的定義や CI/CD の詳細設計など）があればお知らせください。

[1]: https://github.com/WiseLibs/better-sqlite3?utm_source=chatgpt.com "WiseLibs/better-sqlite3: The fastest and simplest library for ..."
[2]: https://github.com/WiseLibs/better-sqlite3/issues/1266?utm_source=chatgpt.com "`node:sqlite` and benchmarking · Issue #1266"
[3]: https://www.sqlite.org/fts5.html?utm_source=chatgpt.com "SQLite FTS5 Extension"
[4]: https://www.reddit.com/r/SQL/comments/s2w4ia/sqlite_what_are_the_best_practices_for_indexing/?utm_source=chatgpt.com "SQLite, what are the best practices for indexing? : r/SQL"
[5]: https://blog.sqlitecloud.io/choosing-the-right-index-in-sqlite?utm_source=chatgpt.com "Choosing the Right Index in SQLite"
[6]: https://knexjs.org/guide/migrations?utm_source=chatgpt.com "Migrations"
[7]: https://www.nected.ai/us/blog-us/open-source-rules-engine?utm_source=chatgpt.com "10 Best Open Source Rule Engines in 2025"
[8]: https://huggingface.co/datasets/isek-ai/danbooru-wiki-2024?utm_source=chatgpt.com "isek-ai/danbooru-wiki-2024 · Datasets at Hugging Face"
[9]: https://blog.sqlitecloud.io/fts5-sqlite-text-search-extension?utm_source=chatgpt.com "SQLite Extensions: Full-text search with FTS5"
[10]: https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system?utm_source=chatgpt.com "SQLite Wasm in the browser backed by the Origin Private File ..."
[11]: https://www.sql-easy.com/learn/sqlite-full-text-search/index.html?utm_source=chatgpt.com "SQLite Full-Text Search: Your Ultimate Guide to Optimizing ..."
[12]: https://github.com/mattjaybe/sd-wildcards?utm_source=chatgpt.com "mattjaybe/sd-wildcards: A collection of ..."
[13]: https://github.com/adieyal/sd-dynamic-prompts?utm_source=chatgpt.com "adieyal/sd-dynamic-prompts"
[14]: https://sqlite.org/forum/info/47429810bd2232ebe0c1096c4910b43f6313b9d92bca6eab8496d59d3f585e4c?utm_source=chatgpt.com "SQLite User Forum: Performance Analysis"

---

以下では **「第一スプリント（2 週間想定）」** として、
現在の GitHub `develop` ブランチ構成を起点に (1)フェーズ 1 の最小実装、(2)フェーズ 2 に備えた種まき、(3)検証フレームの整備──という３本柱で **クリティカルパスに沿った Todo リスト** を提示します。
“まず踏むべき地雷” を優先度順に並べ、完了判定の基準も添えました。

---

## 0. まとめ（要点）

* **bridge.js リファクタ** を最優先：`recursiveSwap()` が *JSON 全体* を受け取れるようインターフェースを拡張し、**二段階パス処理**（先読み→展開）を実装する。これが後続すべての土台。([GitHub][1])
* **ルール DSL（@if {}構文）** のパーサを軽量に組み込み、`sample-wildcards` に PoC を追加。次スプリントで SQLite に移植しやすい AST 形式を返す。([GitHub][2], [nected.ai][3])
* **better-sqlite3＆WAL＋FTS5** で “Hello, DB” を確認し、タグ検索 20 ms 以内のベンチを取る。Wasm ＋ OPFS バックエンドは **ブランチだけ切って雛形コミット** に留める。([GitHub][4], [sqlite.org][5], [sqlite.org][6], [Chrome for Developers][7])
* **最小 CI**：`npm test` で単体テスト＋`PRAGMA journal_mode=WAL` 動作テスト、`knex migrate:latest` が通ることを Gate に。([knexjs.org][8], [Gist][9])
* **測定回帰**：`benchmark/` にスクリプトを置き、旧実装との所要時間差を可視化（ターゲット：ワイルドカード展開 5 ms 以下）。([Hacker News][10], [powersync.com][11])

---

## 1. Todo — 詳細タスクリスト

| #       | タスク                                                              | 完了条件                                           | 担当    | 依存          |       |     |
| ------- | ---------------------------------------------------------------- | ---------------------------------------------- | ----- | ----------- | ----- | --- |
| **1.0** | **Repo セットアップ**<br>‒ `develop` を fork → `feature/sprint1` ブランチ作成 | ブランチが push され CI 通過                            | 全員    | –           |       |     |
| 1.1     | Node 20 + pnpm/ npm 8 ローカル環境整備                                   | `npm i && npm run build` が警告ゼロ                 | Dev A | 1.0         |       |     |
| **2.0** | **bridge.js API 拡張**：`recursiveSwap(reqJson, options)` へ変更       | 既存ユースケースで画像生成成功                                | Dev B | 1.1         |       |     |
| 2.1     | 二段階パスの **Pass 1 (collectTokens)** 実装                             | `collectTokens()` が配列を返しテスト green              | Dev B | 2.0         |       |     |
| 2.2     | **Pass 2 (expandWithRules)** 実装                                  | 新 DSL なしでも従来通り動作                               | Dev B | 2.1         |       |     |
| 2.3     | 旧 API 呼び出し部分を修正 (`injector.js`, `popup.js`)                      | Chrome 拡張がクラッシュしない                             | Dev B | 2.2         |       |     |
| **3.0** | **DSL ミニパーサ**（@if 構文のみ）                                          | \`parseRule("@if{prompt\:girl                  | boy   | }")\` → AST | Dev C | 2.1 |
| 3.1     | AST → 実行ロジック統合（排他/条件分岐のみ）                                        | 単体テスト 20 ケース緑                                  | Dev C | 3.0         |       |     |
| 3.2     | `sample-wildcards/` にテスト用 txt 追加                                 | `npm run demo` でランダム展開確認                       | Dev C | 3.1         |       |     |
| **4.0** | **better-sqlite3 PoC**：`db/schema_v0.sql` 作成                     | `node scripts/init_db.js` が DB 作成              | Dev D | 1.1         |       |     |
| 4.1     | PRAGMA `journal_mode=WAL` & `synchronous=NORMAL` 設定              | `PRAGMA journal_mode` returns `wal`            | Dev D | 4.0         |       |     |
| 4.2     | `tags`,`wildcards` テーブルに 1k 行インサート                               | 1k 行 SELECT < 20 ms                            | Dev D | 4.1         |       |     |
| 4.3     | FTS5 仮想テーブルに `unicode61` トークナイザ適用                                | `MATCH` クエリ通る                                  | Dev D | 4.2         |       |     |
| **5.0** | **Knex migration + CI**                                          | `npm run migrate:test` green in GitHub Actions | Dev E | 4.0         |       |     |
| **6.0** | **Benchmark スクリプト**：旧 vs 新 展開時間計測                                | Markdown レポート生成 & push                         | Dev E | 2.2         |       |     |
| **7.0** | **ドキュメント更新**<br>‒ README (新 API) / ENHANCED\_USAGE.md (DSL) 追記   | MR approved                                    | Dev A | 3.2, 4.3    |       |     |
| **8.0** | **レビュー & マージ** (`feature/sprint1` → `develop`)                   | 2名以上レビュー、CI green                              | 全員    | 2–7         |       |     |

---

## 2. スプリント内のマイルストーン

1. **Day 3** : bridge.js 新 API で旧ユースケースを通す（タスク 2.0〜2.2）。
2. **Day 6** : DSL パーサ & 二段階パス連携完了、単体テスト green（タスク 3.1）。
3. **Day 9** : better-sqlite3 でタグ検索 20 ms 達成（タスク 4.2）。
4. **Day 11** : Knex migration + CI 通過（タスク 5.0）。
5. **Day 13** : ベンチ結果レポート & ドキュメント更新（タスク 6.0, 7.0）。
6. **Day 14** : PR レビュー → `develop` マージ、タグ v0.4.0 打ち。

---

## 3. 成果物と受け入れ基準

| 成果物               | 受け入れ条件                                                                     |          |                 |
| ----------------- | -------------------------------------------------------------------------- | -------- | --------------- |
| **bridge.js v2**  | (a) 旧ワイルドカード txt 全展開が可能<br>(b) `recursiveSwap(reqJson)` 新シグネチャ対応           |          |                 |
| **DSL PoC**       | \`@if{prompt\:girl                                                         | !\~(boy) | }\` が期待値どおり除外動作 |
| **SQLite PoC DB** | `SELECT name FROM tags WHERE name MATCH 'blonde'` < 20 ms (8GB Ryzen 7 相当) |          |                 |
| **CI パイプライン**     | push 時に `npm test && npm run migrate:test` 自動実行                            |          |                 |
| **ベンチレポート**       | 旧版比較で ≥ 3× 高速化達成 or 根拠付き改善案提出                                              |          |                 |

---

## 4. リスク & 留意点

* **同期 API のブロッキング**
  `better-sqlite3` は同期 I/O のため、WebWorker へ分離必須。第１スプリントでは *メインスレッド上での PoC* に留め、性能数値を先に把握。([GitHub][4], [Hacker News][10])
* **WAL ファイル肥大化**
  `PRAGMA wal_autocheckpoint=1000;` 測定しつつ調整。WAL 効果は 試験規模 < 100 MB で十分検証できる。([sqlite.org][5], [powersync.com][11])
* **FTS5 のトークンサイズ増大**
  `unicode61` は DB サイズ +2× 程度になり得る点をチームに共有。([Stack Overflow][12])
* **DSL 拡張** は Scope & Priority だけに限定し、**排他/条件** 以外（重み操作など）は次スプリントへ後送り。

---

### 主要情報源

* Repository 構成 ([GitHub][1])
* better-sqlite3 パフォーマンス ([GitHub][4], [Hacker News][10])
* WAL 仕組み & 速度 ([sqlite.org][5], [powersync.com][11])
* FTS5 / unicode61 公式＋解説 ([sqlite.org][6], [Audrey Feldroy][13])
* SQLite Wasm × OPFS 概要 ([Chrome for Developers][7], [MDN Web Docs][14])
* Knex Migration ガイド ([knexjs.org][8], [Gist][9])
* ルールエンジン選定記事（json-rules-engine 等） ([nected.ai][3], [GitHub][15])
* Danbooru Wiki 2024 データセット ([Hugging Face][16])
* Dynamic Prompts / 階層ワイルドカード実装例 ([GitHub][2])

---

この Todo を完遂すれば、**「入力欄横断ロジック」＋「SQLite 基盤」** への足掛かりが揃い、第２スプリントでのフル DB 移行・GUI 連携にスムーズに移行できます。追加の質問やタスク粒度の調整があればご連絡ください。

[1]: https://github.com/Cizimy/wildcards-for-novelai-diffusion/tree/develop "GitHub - Cizimy/wildcards-for-novelai-diffusion at develop"
[2]: https://github.com/adieyal/sd-dynamic-prompts?utm_source=chatgpt.com "adieyal/sd-dynamic-prompts"
[3]: https://www.nected.ai/us/blog-us/open-source-rules-engine?utm_source=chatgpt.com "10 Best Open Source Rule Engines in 2025"
[4]: https://github.com/WiseLibs/better-sqlite3?utm_source=chatgpt.com "WiseLibs/better-sqlite3: The fastest and simplest library for ..."
[5]: https://www.sqlite.org/wal.html?utm_source=chatgpt.com "Write-Ahead Logging"
[6]: https://www.sqlite.org/fts5.html?utm_source=chatgpt.com "SQLite FTS5 Extension"
[7]: https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system?utm_source=chatgpt.com "SQLite Wasm in the browser backed by the Origin Private File ..."
[8]: https://knexjs.org/guide/migrations?utm_source=chatgpt.com "Migrations"
[9]: https://gist.github.com/NigelEarle/70db130cc040cc2868555b29a0278261?utm_source=chatgpt.com "Migration and seeding instructions using Knex.js!"
[10]: https://news.ycombinator.com/item?id=16616374&utm_source=chatgpt.com "Better-sqlite3: A faster Sqlite library for Node.js"
[11]: https://www.powersync.com/blog/sqlite-optimizations-for-ultra-high-performance?utm_source=chatgpt.com "SQLite Optimizations for Ultra High-Performance"
[12]: https://stackoverflow.com/questions/75368862/lossless-sqlite-fts5-search-of-a-substring?utm_source=chatgpt.com "Lossless SQLite FTS5 search of a substring"
[13]: https://audrey.feldroy.com/nbs/2025-01-13-SQLite-FTS5-Tokenizers-unicode61-and-ascii?utm_source=chatgpt.com "# SQLite FTS5 Tokenizers: `unicode61` and `ascii`"
[14]: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system?utm_source=chatgpt.com "Origin private file system - Web APIs | MDN"
[15]: https://github.com/gorules/zen?utm_source=chatgpt.com "gorules/zen: Open-source Business Rules Engine ..."
[16]: https://huggingface.co/datasets/isek-ai/danbooru-wiki-2024?utm_source=chatgpt.com "isek-ai/danbooru-wiki-2024 · Datasets at Hugging Face"