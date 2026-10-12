# Cloudflare Workers へのデプロイ手順

Cloudflare Workers + D1 への移行（#609）で使う環境とデプロイの手順。計画の全体は [cloudflare-d1-migration-plan.md](cloudflare-d1-migration-plan.md)。AWS 側の構成（`terraform/`・`docs/aws-*.md`）は停止中のまま併存させ、この手順では触れない。

## 環境

| 環境 | Worker 名 | 公開 URL | D1 | Cron | デプロイ |
|---|---|---|---|---|---|
| ステージング | `mybooklibrary-staging` | `https://mybooklibrary-staging.nyproducts.workers.dev` | `mybooklibrary-staging-db` | なし（本番との二重通知を防ぐため。手動で確認する） | `wrangler deploy --env staging` |
| 本番 | `mybooklibrary` | `https://mybooklibrary.nyproducts.workers.dev` | `mybooklibrary-db` | 毎日 UTC 00:00（JST 09:00） | `wrangler deploy` |

設定は `app/wrangler.jsonc` が唯一の定義元（トップレベルが本番、`env.staging` がステージング）。wrangler ではバインディング（D1）と vars が環境に継承されないため、環境ごとに書いている。triggers は継承されるため、ステージングでは Cron を空配列で上書きして無効にしている。`main` へのマージによる自動デプロイ（Workers Builds）は #684 で設定する。

## 初回準備（Cloudflare アカウントでの操作）

次のコマンドは `app/` ディレクトリで実行する。

### 1. ログイン

```bash
npx wrangler login
```

ブラウザが開くので、Cloudflare アカウントで許可する。`npx wrangler whoami` でアカウントが表示されれば成功。

### 2. D1 データベースの作成

```bash
npx wrangler d1 create mybooklibrary-staging-db
npx wrangler d1 create mybooklibrary-db
```

作成後に「設定ファイルへ追加しますか（Would you like Wrangler to add it on your behalf?）」と聞かれたら、**No（追加しない）** を選ぶ。Yes にすると、`wrangler.jsonc` が整形し直され、コメントが消え、バインディング名が `DB` ではない余計な D1 の項目が追加される（このアプリのコードはバインディング名 `DB` を前提にしている）。聞かれた場合は `git checkout app/wrangler.jsonc` で戻す。

それぞれの出力に `database_id`（UUID）が表示される。**`database_id` は秘密情報ではない**ため、`app/wrangler.jsonc` に書いてコミットしてよい。`wrangler.jsonc` の本番（トップレベル）とステージング（`env.staging`）の `database_id` に、それぞれ書く（反映済み）。

### 3. マイグレーションの適用（リモートの D1）

`database_id` を反映したあとに実行する。

```bash
npm run d1:migrate:staging
npm run d1:migrate:production
```

`d1_migrations` テーブルで適用済みのものは再適用されないため、繰り返し実行しても安全。デプロイ時のマイグレーション適用は #684 で自動化する。

## 自動デプロイ（Workers Builds）

Cloudflare 公式の CI/CD（Workers Builds）で、GitHub のリポジトリと各 Worker を連携する。テストは従来どおり GitHub Actions（PR のマージ条件）で行い、Workers Builds はマージ後のビルドとデプロイを担当する。

| Worker | 本番ブランチ（自動デプロイされるブランチ） | デプロイコマンド |
|---|---|---|
| `mybooklibrary-staging` | `main` | `npm run deploy:staging` |
| `mybooklibrary` | `production` | `npm run deploy:production` |

流れは「PR を `main` にマージ → ステージングへ自動デプロイ → ステージングで確認 → `main` を `production` ブランチへ反映 → 本番へ自動デプロイ」。`production` ブランチの更新は、GitHub で `main` から `production` への PR を作ってマージするか、`git push origin main:production`（早送り）で行う。

どちらの Worker も、設定は共通。

| 項目 | 値 |
|---|---|
| ルートディレクトリ | `app` |
| ビルドコマンド | `npm run build:worker`（依存関係のインストールは Workers Builds が自動で行う） |
| ビルド変数 | `NODE_VERSION` = `22`（`app/.node-version` でも指定している） |
| デプロイコマンド | 上の表（リモート D1 にマイグレーションを適用してから `wrangler deploy`） |
| プレビュー（`main` 以外のブランチ）のビルド | 無効のままにする（プレビューは本番・ステージングと同じ D1 を使うため。PR のビルド確認は GitHub Actions が行う） |

Workers Builds が連携時に自動発行する API トークンの権限は、Workers Scripts・Workers KV・Workers R2 の編集などで、**D1 は含まれない**（公式ドキュメントで確認）。デプロイコマンドが D1 のマイグレーションを適用するため、連携後に必ずトークンへ **D1 の編集権限**を足す（下の「初回の手順」の 4）。足さないと、マイグレーションが失敗し、後続のデプロイも実行されない。ビルドの上限は 1 回 20 分、Paid の無料枠は月 6,000 分。

### 初回の手順（Cloudflare アカウントでの操作）

Workers Builds に連携するには、先に Worker が存在している必要があるため、初回だけ手元からデプロイする。**この操作は Workers Paid への加入（#682）が済んでいることが前提**（Worker が圧縮後 3 MiB を超え、Free では拒否される）。`app/` で実行する。

```bash
npm run build:worker
npx wrangler deploy --env staging
npx wrangler deploy
```

1. **`production` ブランチを作る**（本番 Worker の連携時に選択するため、先に必要）。`git push origin origin/main:refs/heads/production`
2. Cloudflare ダッシュボードの「Workers & Pages」で `mybooklibrary-staging` を開き、「Settings」→「Builds」→「Connect」で GitHub のリポジトリ（`MyBookLibrary`）を連携して、上の表のとおり設定する（本番ブランチは `main`）。連携時に GitHub App（Cloudflare Workers and Pages）のインストールの許可を求められる。
3. `mybooklibrary` も同様に連携する（本番ブランチは `production`）。
4. **API トークンに D1 の編集権限を足す**: ダッシュボード右上のプロフィール → 「My Profile」→「API Tokens」で、Workers Builds が発行したトークン（名前に Workers Builds を含むもの）を開き、「Edit」→ 権限に「Account」「D1」「Edit」を追加して保存する。2 つの Worker で同じトークンを使う設定にしておくと、1 回で済む。
5. 動作確認: `main` に小さな変更をマージし、ステージングの Worker の「Deployments」にビルドが走り、成功することを確認する。

## Secrets の登録

`AUTH_SECRET`・`CRON_SECRET`・Google OAuth などの secret は、このリポジトリ・チャットに書かず、環境ごとに登録する。手順と一覧は #685 で整備する。公開 URL に関わる `AUTH_URL`・`CRON_TARGET_ORIGIN` は secret ではなく、`wrangler.jsonc` の `vars` に書いてある。

## 確認

```bash
# 設定が解決できるか（Worker 名・D1・vars）と、サイズの確認。事前に npm run build:worker が必要。
npx wrangler deploy --dry-run --env staging
npx wrangler deploy --dry-run
```

CI（`worker` ジョブ）でも、本番・ステージングの両方の設定を `--dry-run` で確認している。
