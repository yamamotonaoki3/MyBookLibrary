# MyBookLibrary — エージェント作業ルール

このファイルは、[`CLAUDE.md`](CLAUDE.md) の開発・運用ルールを、Codexを含む作業エージェント向けに同期したものです。矛盾する場合は `CLAUDE.md` を正とします。機能仕様は [`docs/requirements.md`](docs/requirements.md) を正とします。

## 必須の開発フロー

すべてのコード変更・機能追加・バグ修正・ドキュメント更新は、次の順で進める。

1. 対象の要件定義（`docs/requirements.md`）・関連する画面/API/データモデル・[`docs/lessons-learned.md`](docs/lessons-learned.md) を読む。
2. GitHub Issueを作成する（テンプレートを使う）。Issue本文には対象領域、参照ドキュメント、受け入れ基準、依存Issueを含める。Issueなしでブランチを切らない。
3. Issue番号を含む専用ブランチを作成する。
4. 実装し、対象Issueの受け入れ基準と関連テストを満たす。**E2Eが今回の実装を実際に検証しているかを中身で確認する**（後述「E2Eが実装に対応しているかの確認」）。
5. 品質チェック（`cd app && npm run check`）を実行する。
6. `codex review --uncommitted` を実行し、指摘は `codex exec` でCodex自身に修正させ、指摘ゼロになるまで繰り返す（後述「レビュー・記録」）。
7. ユーザーによる動作確認が必要な場合は、コミット前に結果を確認してもらう。
8. ユーザーからコミット指示を受けたら、コミット後に同じブランチをpushする。
9. PRを作成する（テンプレートを使う・`Closes #<番号>` を記載）。`codex review --base main` を1回実行し、指摘ゼロを確認する。
10. セルフレビューとCI成功を確認してから、ユーザーの明示的な承認に基づいてマージする。
11. マージ後にブランチを削除する。
    - 対象ブランチが別worktreeで使用中、または未コミット変更がある場合は削除せず、状態を報告する。

`main` への直接pushは禁止する。必ず作業ブランチとPRを経由する。

## ブランチ・コミット

ブランチ名は次の形式にする。

```text
<prefix>/#<issue番号>-<英語の概要>
```

| prefix | 用途 |
| --- | --- |
| `feature` | 機能追加 |
| `fix` | 不具合修正 |
| `chore` | リファクタ・設定変更・依存更新 |
| `docs` | ドキュメントのみの変更 |

コミットメッセージは次の形式にする（日本語の要約を使ってよい）。

```text
<種別>: <変更内容の要約>

例: feat: 本の登録機能を追加 / fix: 検索フィルターのバグを修正 / docs: 要件定義書を追加
```

種別は `feat` / `fix` / `chore` / `docs` / `refactor` / `test` を使う。

## 秘密情報・環境分離

- 実値を持つ `.env*`、認証情報、トークン、APIキー、Terraform state・planをGit管理、コミットメッセージ、Issue、PR、チャットへ記載しない。詳細は [`docs/secrets-management.md`](docs/secrets-management.md) に従う。
- 実ファイルは `.gitignore` で除外し、プレースホルダだけの `.env*.example` をコミットする。
- コミットメッセージ・PR・Issue本文に、現在も有効な認証情報の値や、悪用手順を具体化した記述を書かない。
- テストデータは架空のもの（`@example.com`、`testuser_` / `e2euser_` 等の接頭辞、`[E2E_TEST]` 等のタグ）だけを使い、実在の個人情報・実データを使わない。テストはローカルまたはテスト専用DB（`app/.env.test`）にだけ接続する。
- `.claude/` などエージェント固有の内部設定や、個人環境だけに必要な設定はGitへコミットしない。

## 設計・実装の判断

- 技術スタックは `CLAUDE.md` の表で決定済み（Next.js 16 / React 19 / TypeScript / Prisma 6 / MySQL 8.4 / Tailwind CSS v4 / Docker）。明記のない新しい技術・依存パッケージ・構成が必要な場合は、独断で決めずユーザーに確認し、決定後にバージョンと利用可否を検証する。
- 責務分離のルール（`CLAUDE.md`「責務分離のルール」）に従う。
  - `app/` 配下の新規・大規模改修コードから `@/lib/prisma` を直接importしない。
  - Prismaを呼ぶ新規コードは `src/repositories/` に置く。業務ルールは `src/lib/` のService / Queryに置く。
  - Route Handlerでは入力検証（Zod等）と認証・認可を行ってからServiceを呼ぶ。`Request` / `Response` をService・Repositoryへ渡さない。
  - GET画面のレンダリング中にDBへ書き込まない。
- Issueは単独でレビュー・マージできる最小単位にする。依存関係がある変更を1つのIssueへ混在させない。
- ドキュメントと実装が矛盾する、未検証事項に着手する、または設計原則に影響する変更が必要な場合は、実装を進めずユーザーへ判断を求める。
- 部分一致で別のルートを巻き込まない。削除・改名では完全なパスで確認する（例: `/api/follows/recommendations` と `/api/admin/follows/recommendations` は別のルート）。

## E2Eが実装に対応しているかの確認

テストが「通った」ことと、そのテストが「今回の実装を検証している」ことは別である。E2Eスイートが緑でも、実行されたのが既存シナリオだけなら、今回追加・変更した機能は検証されていない。動作確認の工程では毎回次を行う。

- 今回の変更を検証するE2E（`app/e2e/*.spec.ts`）が実在するかを、シナリオ名ではなく中身で確認する（新しい画面の要素、新しいエンドポイントのパスを検索する）。
- 無ければ追加する。追加できない事情がある場合は、その理由と代替の担保を報告する。黙って省略しない。
- 画面がまだ無くAPIだけの場合は、PlaywrightのAPIリクエスト（`request` フィクスチャ）で稼働中のAPIを直接呼ぶE2Eで代替する。
- 後続Issueへ検証の責任を引き継ぐ場合は、対象Issueの本文へ追記する。

## 品質チェックと実行環境

- すべて `app/` ディレクトリで実行する。
  - `npm run check`（typecheck + lint + Jest の単体テスト）
  - `npm run test:integration`（`app/.env.test` を使う結合テスト。ローカルのテスト用DBが必要）
  - `npm run test:e2e`（Playwright。`app/playwright.config.ts` が `next dev` とスタブサーバー `e2e/stub-server.ts` を自動起動する）
  - `npm run build`
- E2Eは `.env.test` の内容を明示的に渡して実行する（`.env.local` の開発DB・実APIに接続しない）。Playwrightの設定を変更するときもこの前提を崩さない。
- 開発用DBは `docker compose up -d`、開発サーバーは `cd app && npm run dev` で起動する。
- ブラウザで画面を確認するときは、`@example.com` の架空ユーザーを使い、更新・登録・削除を伴わない閲覧に留める。認証情報はスクリプト内で `.env.local` から読み込み、チャットや出力に表示しない。
- 一時スクリプトは `app/` 直下に作った場合でも、確認後に必ず削除し、コミットに含めない。

## レビュー・記録

- PR前にセルフレビューを行い、`codex review --uncommitted`（PR作成後は `codex review --base main`）で別モデルによる追加レビューを実施する。
- 指摘があれば、指摘内容と対象ファイルを添えた具体的な指示で `codex exec "<修正指示>"` を実行し、**Codex自身に修正させる**。Claude Codeなどが直接修正するのは、Codexの応答が得られない・失敗する等、Codexによる修正が行えない場合の代替手段とする。修正後は品質チェックで検証し、指摘ゼロになるまで繰り返す。
- `codex review` / `codex exec` の出力が極端に小さい場合は成功と見なさず、`git diff` で実際の結果を確認する。
- 通常の追加レビューは最大5回までとする。5回後も重大ではない指摘が残る場合は一覧化してユーザーへ判断を求める。データ破損・認証バイパス・情報漏えいなどの重大な指摘は、解消するまで繰り返す。
- 計画レビューを重ねた結果、そのIssueが「単独でレビュー・マージできる最小単位」を明らかに超えたと判断した場合は、レビューを続けずにユーザーへ相談する（「厳密にやる / 範囲を縮める / 後回しにする」の選択肢を示す）。
- レビューで有効な指摘や実装中の手直しは、[`docs/lessons-learned.md`](docs/lessons-learned.md) の基準（`lessons-learned` Skill）に従って記録し、マージ前のPRへ含める。
- ユーザーから「覚えておいて」と明示された内容は、秘密情報・一時的指示・既存ルールとの矛盾がなければ記録する。

## 複数Issueを連続して進める場合

次のIssueへ確認なしで進められるのは、直前のPRがマージ済みで、受け入れ基準と動作確認を満たし、次のIssueの依存Issueがすべて完了している場合だけとする。

次の場合は必ず立ち止まり、ユーザーへ判断を求める。

- ユーザーによる動作確認が必要な工程に到達した場合
- ドキュメントと実装の矛盾を見つけた場合
- 依存パッケージの追加など、既存の設計原則に影響する変更が必要な場合
- 要件定義で「要調査」「未検証」とされている項目に着手する場合
- 本番環境（AWS）の変更・削除など、取り消しにくい操作を行う場合

## 参照先

- 要件・受け入れ基準: [`docs/requirements.md`](docs/requirements.md)
- API仕様・テスト計画: [`docs/api-spec.md`](docs/api-spec.md)、[`docs/test-plan.md`](docs/test-plan.md)
- 開発背景・技術構成・責務分離: [`CLAUDE.md`](CLAUDE.md)
- 秘密情報の管理: [`docs/secrets-management.md`](docs/secrets-management.md)
- AWSデプロイ構成・停止/再開手順: [`docs/aws-deploy-guide.md`](docs/aws-deploy-guide.md)
- 学び・過去の手直し: [`docs/lessons-learned.md`](docs/lessons-learned.md)
