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

## Secrets の登録

`AUTH_SECRET`・`CRON_SECRET`・Google OAuth などの secret は、このリポジトリ・チャットに書かず、環境ごとに登録する。手順と一覧は #685 で整備する。公開 URL に関わる `AUTH_URL`・`CRON_TARGET_ORIGIN` は secret ではなく、`wrangler.jsonc` の `vars` に書いてある。

## 確認

```bash
# 設定が解決できるか（Worker 名・D1・vars）と、サイズの確認。事前に npm run build:worker が必要。
npx wrangler deploy --dry-run --env staging
npx wrangler deploy --dry-run
```

CI（`worker` ジョブ）でも、本番・ステージングの両方の設定を `--dry-run` で確認している。
