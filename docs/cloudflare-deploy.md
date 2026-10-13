# Cloudflare Workers へのデプロイ手順

Cloudflare Workers + D1 への移行（#609）で使う環境とデプロイの手順。計画の全体は [cloudflare-d1-migration-plan.md](cloudflare-d1-migration-plan.md)。AWS 側の構成（`terraform/`・`docs/aws-*.md`）は停止中のまま併存させ、この手順では触れない。

## 環境

| 環境 | Worker 名 | 公開 URL | D1 | Cron | デプロイ |
|---|---|---|---|---|---|
| ステージング | `mybooklibrary-staging` | `https://mybooklibrary-staging.nyproducts.workers.dev` | `mybooklibrary-staging-db` | なし（本番との二重通知を防ぐため。手動で確認する） | `wrangler deploy --env staging` |
| 本番 | `mybooklibrary` | `https://mybooklibrary.nyproducts.workers.dev` | `mybooklibrary-db` | 毎日 UTC 00:00（JST 09:00） | `wrangler deploy` |

設定は `app/wrangler.jsonc` が唯一の定義元（トップレベルが本番、`env.staging` がステージング）。wrangler ではバインディング（D1）と vars が環境に継承されないため、環境ごとに書いている。triggers は継承されるため、ステージングでは Cron を空配列で上書きして無効にしている。`main` へのマージでステージングへ、`production` ブランチへの反映で本番へ、Workers Builds が自動デプロイする（下の「自動デプロイ」）。

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

実値は、このリポジトリ・Issue・PR・チャットに書かない。Worker の secret として、**環境ごと**（ステージングと本番）に登録する。Worker ごとに独立した値なので、**ステージングと本番で別々の値を生成する**（`AUTH_SECRET`・`CRON_SECRET` を使い回さない）。

### 登録するもの

| 名前 | 種別 | 必須 | 内容・入手元 |
|---|---|---|---|
| `AUTH_SECRET` | secret | 必須 | NextAuth のセッション署名。ランダム値を生成する |
| `CRON_SECRET` | secret | 必須 | Cron の Bearer トークン（16 文字以上）。ランダム値を生成する |
| `RAKUTEN_APP_ID` / `RAKUTEN_ACCESS_KEY` | secret | 必須 | 楽天ブックス Web Service（https://webservice.rakuten.co.jp/ ）。現行と同じ値でよい |
| `CALIL_API_KEY` | secret | 任意 | カーリル 図書館 API。蔵書検索を使うなら必須 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | secret | 任意 | Google ログイン用。未設定でもメール+パスワードのログインは動く。ステージング・本番の URL ごとにリダイレクト URI を Google Cloud Console に登録する（下記） |
| `ENRICHMENT_TICK_SECRET` | secret | 保留 | 書誌補完ジョブの再開用。Workers 対応の方針は #696 で決める。それまで登録不要 |
| `AUTH_URL` / `AUTH_TRUST_HOST` / `CRON_TARGET_ORIGIN` / `RAKUTEN_ALLOWED_ORIGIN` | vars | 設定済み | secret ではなく `wrangler.jsonc` の `vars` に書いてある。`RAKUTEN_ALLOWED_ORIGIN` は楽天 API に Referer / Origin として送るドメイン（下記） |
| `LOG_LEVEL` | vars | 任意 | 既定は `info` |

`DATABASE_URL` は不要（Workers では D1 のバインディング `DB` を使う）。

### ランダム値の生成と登録

`app/` で実行する。生成した値は画面に出さず、パイプで直接 `wrangler` に渡す（シェルの履歴・チャットに残さない）。

```bash
# 例: ステージングの AUTH_SECRET（ランダムな値を生成して登録する）
openssl rand -base64 32 | npx wrangler secret put AUTH_SECRET --env staging

# 例: 本番の AUTH_SECRET（--env を付けない）
openssl rand -base64 32 | npx wrangler secret put AUTH_SECRET
```

`openssl` が使えない場合は、`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" | npx wrangler secret put AUTH_SECRET --env staging` でもよい。`CRON_SECRET` も同様に、環境ごとに別の値で登録する。

楽天・カーリル・Google の値は、現行の `app/.env.local`（ローカル）や AWS の SSM Parameter Store にあるものを使う。値を画面に出さずに登録するには、`npx wrangler secret put RAKUTEN_APP_ID --env staging` を実行すると入力を求められるので、そこに貼り付ける（入力は画面に表示されない）。

登録の確認（名前だけが表示され、値は表示されない）:

```bash
npx wrangler secret list --env staging
npx wrangler secret list
```

注意: Worker がまだ存在しない状態で `secret put` すると、先に空の Worker を作るかどうかを聞かれる。上の「初回の手順」で Worker を作成してから登録する。

### 楽天ブックス API のアプリ登録（許可された Web サイト）

楽天 Web Service のアプリ登録で、次を入力する。アプリタイプは「Web アプリケーション」（「API バックエンドサービス」は許可 IP の登録で、Workers の送信元 IP は固定できないため使わない）。

| 項目 | 入力 |
|---|---|
| アプリケーション URL | `https://mybooklibrary.nyproducts.workers.dev` |
| 許可された Web サイト（1 行に 1 ドメイン） | `mybooklibrary.nyproducts.workers.dev` と `mybooklibrary-staging.nyproducts.workers.dev` |

楽天 API は、許可された Web サイト以外のリクエストを **403 Forbidden** で拒否し、**サーバーからの呼び出しにも Referer / Origin を求める**。このため、`RAKUTEN_ALLOWED_ORIGIN`（環境ごとの公開 URL）がある環境では、アプリが Referer と Origin を付けて呼び出す（ヘッダーなしだと 403 になることを、ステージングで A/B 確認した）。ローカル開発・AWS は、従来のアプリ ID / アクセスキー（Cloudflare 用とは別の登録）を使い続ける限り、`RAKUTEN_ALLOWED_ORIGIN` を未設定のままにする（従来どおり何も付けない）。**Cloudflare 用に新しく登録したアプリ ID / アクセスキーを、ローカル・AWS でも使う場合は、そのアプリの「許可された Web サイト」にそれぞれのドメイン（ローカルなら `localhost`）を足し、`RAKUTEN_ALLOWED_ORIGIN` に対応する URL を設定する**（設定しないと 403 になる）。

注意: 楽天が 403 のとき、アプリは国立国会図書館（NDL）の検索結果へ切り替わるため、**画面や API に結果が出ていても、楽天が通っているとは限らない**。`npm run smoke:remote` は、楽天由来の結果（`size` または書影がある）があることで確認する。Worker のログ（`wrangler tail --env staging`）に「楽天API エラー」が出ていないかも見る。

### Google ログインのリダイレクト URI

Google Cloud Console の OAuth クライアントの「承認済みのリダイレクト URI」に、環境ごとに次を追加する（既存の AWS 用の URI は残す）。

- ステージング: `https://mybooklibrary-staging.nyproducts.workers.dev/api/auth/callback/google`
- 本番: `https://mybooklibrary.nyproducts.workers.dev/api/auth/callback/google`

ステージングの確認には、本番と別の OAuth クライアントを作ると、本番の認証情報を検証に使わずに済む（推奨）。

## ステージングの疎通確認（`npm run smoke:remote`）

デプロイ済みのステージングに HTTP で接続して、画面・未認証のリダイレクト・Google のコールバック URL・Credentials ログイン・保護ページ・本の検索（楽天ブックス）・Cron API（Bearer なしの拒否と、Bearer 付きの手動実行）を確認する。`app/` で実行する。

```bash
npm run smoke:remote
```

- 接続先は `STAGING_URL`（既定はステージングの URL）。認証情報を送るため、https で、既定の origin と完全一致する URL にしか接続しない（誤って本番へ接続しないため）。別の URL は `SMOKE_ALLOW_NON_DEFAULT=1` で明示的に許可する。ユーザー情報・クエリ・フラグメント付きの URL は、値がログに出ないよう拒否する。
- ログインには、ステージング専用のテストユーザー（架空のデータ。メールは `@example.com`）を使う。認証情報は、リポジトリの外のファイル（既定は `~/.mbl-staging-smoke.env`。`STAGING_SMOKE_ENV_FILE` で変更可）か、環境変数 `STAGING_SMOKE_EMAIL` / `STAGING_SMOKE_PASSWORD` / `STAGING_CRON_SECRET` で渡す。値は出力に出さない。
- テストユーザーは、ステージングの D1 に、`bcryptjs` でハッシュ化したパスワードを `users` へ挿入して作る（`wrangler d1 execute DB --remote --env staging --command ...`。`--file` での実行は認証エラーになることがあるため `--command` を使う）。
- 誤ったパスワードでのログインは、失敗が重なるとテストユーザーがロックされるため、確認しない。
- ステージングの Cron Trigger は無効のため、Cron は HTTP 呼び出しで手動実行して確認する（`STAGING_CRON_SECRET` に、ステージングの `CRON_SECRET` と同じ値を設定する）。

ブラウザ操作を伴う既存の E2E（Playwright）は、テスト用 DB に直接接続してデータを準備・削除する作りのため、そのままではデプロイ済みの環境に対して実行できない。必要になったら別 Issue で扱う。

## 運用（ロールバック・ログ・請求）

### ロールバック

直前の不具合を、コードを直さずに、以前のバージョンへ戻したいとき。Worker のバージョンを切り替えるだけで、数秒で終わる。`app/` で実行する（ステージングは `--env staging`、本番は付けない）。

```bash
# 1. バージョンの履歴を見る（一番下が最新。Version(s) の ID を控える）
npx wrangler deployments list --env staging

# 2. 戻したいバージョンへ切り替える（100% のトラフィックをそのバージョンに向ける）
npx wrangler rollback <version-id> --env staging -m "理由"

# 3. 現在のバージョンを確認する
npx wrangler deployments status --env staging
```

- **D1 のデータとマイグレーションは戻らない**。戻るのは Worker のバージョン（コード、静的アセット、バインディング・互換性などの設定）で、D1 の中身は現在のまま。戻す先のバージョンの設定（D1 の接続先など）が今も正しいかを、戻す前に確認する。マイグレーションでテーブルの構造を変えた変更を戻すときは、コードを戻す前に、古いコードが新しい構造で動くかを確認する（列の追加は、古いコードでも動くことが多い。列の削除や名前変更は動かない）。
- **ロールバックしたあとも、`main`（または `production`）に次のコミットがマージされれば、自動デプロイで最新に戻る**。不具合を直す前に、マージを止めておく。
- 恒久的に戻すときは、ダッシュボードで戻すのではなく、Git で該当の変更を `git revert` して、通常のデプロイの流れに乗せる。
- ステージングで、1 つ前のバージョンへ戻して `npm run smoke:remote` が通ること、元のバージョンへ戻して通ることを確認した（#687）。本番も同じ手順（`--env staging` なし）。
- **D1 のデータを戻したいとき**（誤更新・破損）は、Worker のロールバックではなく、D1 の Time Travel（時点復元）を使う。AWS は停止中のため、旧環境へ戻す前提はない。データの不整合への対応は、移行計画書（[cloudflare-d1-migration-plan.md](cloudflare-d1-migration-plan.md)）の §9-3 に従う。

### ログの確認

Worker は `observability` を有効にしている（`wrangler.jsonc`）。

```bash
# リアルタイムでログを見る（Ctrl+C で止める。ステージングは --env staging）
npx wrangler tail --env staging
```

- ダッシュボードの「Workers & Pages」→ Worker →「Observability」（ログ）でも、過去のログを検索できる。
- ログに、リクエストの URL やエラーのメッセージが出る。**秘密の値（キー・トークン）がログに出ていないかを、出力を共有する前に確認する。**
- `wrangler tail` は自分が起動したものだけを止める（他のプロセスを名前のパターンで一括停止しない）。

### 請求・使用量の確認

- ダッシュボードの「アカウント」→「請求（Billing）」で、現在の請求額と、Workers Paid の使用量（リクエスト数・CPU 時間）を確認する。
- D1 は「Workers & Pages」→「D1」→ 各データベースで、読み取り・書き込みの行数とストレージを確認する。
- 同じアカウントを他のプロジェクトと共有している場合、クォータと請求は合算される。
- 請求アラート（通知）の設定は、ダッシュボードの「請求」→「請求アラート」（#682）。

## 確認

```bash
# 設定が解決できるか（Worker 名・D1・vars）と、サイズの確認。事前に npm run build:worker が必要。
npx wrangler deploy --dry-run --env staging
npx wrangler deploy --dry-run
```

CI（`worker` ジョブ）でも、本番・ステージングの両方の設定を `--dry-run` で確認している。
