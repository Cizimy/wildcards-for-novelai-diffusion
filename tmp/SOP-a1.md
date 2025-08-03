# SOP-a1: リポジトリ更新・Issue 作成・トークン一覧ドラフト

## 1. 目的

`feature/sprint1`ブランチをリモートリポジトリにプッシュし、関連するIssueを作成する。また、Chevrotainパーサで使用するトークンの一覧をドラフトとして作成する。

## 2. 手順

### 2.1. リポジトリ更新

1.  ローカルリポジトリで`feature/sprint1`ブランチが最新の状態であることを確認する。
2.  `git push origin feature/sprint1` を実行し、リモートリポジトリにブランチをプッシュする。

### 2.2. Issue作成

1.  GitHubリポジトリのIssuesタブに移動する。
2.  "New issue"をクリックする。
3.  タイトルを `feat(parser): add WildcardToken & basic grammar skeleton (#SOP‑a1)` とする。
4.  本文にタスクの概要と`grammar_spec_tokens_sop.md`へのリンクを記載する。
5.  `enhancement` ラベルを付与する。
6.  担当者を自分自身に割り当てる。

### 2.3. トークン一覧ドラフト作成

1.  `grammar_spec_tokens_sop.md` の `付録 A — Token 定義雛形 (TypeScript)` を参考に、`wildcards-for-novelai-diffusion/packages/core/parser/tokens.ts` ファイルを作成する。
2.  以下のトークンを定義する。
    *   `LBrace`
    *   `RBrace`
    *   `Pipe`
    *   `IfKeyword`
    *   `BangTilde`
    *   `WildcardToken`
    *   `TextToken`
3.  `allTokens` 配列にすべてのトークンを含める。

## 3. 完了条件

*   `feature/sprint1` ブランチがリモートリポジトリにプッシュされている。
*   Issueが作成され、適切な情報が設定されている。
*   `tokens.ts` ファイルが作成され、トークンのドラフトが定義されている。
