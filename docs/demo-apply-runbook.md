# デモ用 D1 への適用手順書（#722）

公開するデモ環境（[demo-environment.md](demo-environment.md)）の D1 `mybooklibrary-demo-db` に、**マスターデータ**（賞・著者・本・ISBN・受賞）と、**架空のユーザー・関係**を入れる手順。やり直し（初期化 → 再投入）と、確認も含む。

> **実行するのは所有者本人**です（パスフレーズ・`wrangler login` が必要なため）。パスフレーズ・復号したダンプの中身・secret の値は、チャットや Issue・PR に書かない。

## 方針（先に読む）

| 決めたこと | 理由 |
| --- | --- |
| マスターデータは、**暗号化したダンプ**から、ローカルの MySQL 経由で投入する | リポジトリには入れない（楽天ブックス API 由来の書誌情報の再配布を避ける） |
| 投入するのは **5 表だけ**（`--profile demo`）。本の「登録者」は空にする | ユーザー関連（メール・氏名・読書状況など）を、デモに持ち込まない |
| ダンプを復元したローカルの MySQL には、**実データ（ユーザー関連）が含まれる**。投入が終わったら、**すぐに削除する**（手順 4） | 匿名化せずに復元するため。使うのは、マスターデータの読み出しだけ |
| 架空のユーザーは、**`demo:seed`**（MySQL は不要）で作る | 実データと無関係に作れる |
| 管理者は作らない | デモでは、管理者の操作をすべて拒否するため（#721）。管理者機能は GIF・スクリーンショットで見せる |

実行するディレクトリは、すべて `app/`（Git Bash）。`<デモの D1 の ID>` は `9db6893d-38e3-4795-b24d-1901d6a929ad`（`wrangler.jsonc` の `env.demo`。秘密情報ではない）。

## 0. 前提の確認

```bash
cd app
docker info > /dev/null && echo "Docker OK"     # 失敗したら Docker Desktop を起動して、完全に立ち上がるまで待つ
npx wrangler whoami                              # ログイン済みであること
ls prisma/scripts/migration/dumps                # dump_20261011T145445Z.sql.enc と .sha256 があること
npx wrangler secret list --env demo              # AUTH_SECRET・CRON_SECRET・RAKUTEN_* があること（名前だけが出る）
curl -s https://mybooklibrary-demo.nyproducts.workers.dev/api/version   # #721 のマージ後の、デモのバージョンであること
```

- デモの Worker は、**#721（保護）がデプロイされた後**に行う（`demo` ブランチを `main` に揃えると、Workers Builds が自動でデプロイする。`git push origin origin/main:demo`）。保護が入る前に、公開用のアカウントを作らないため。
- デモ用 D1 が空であること（`users` が 0 件。マスターデータの表も空）。すでにデータがある場合は、先に `npm run migration:d1 -- reset --profile demo --remote --d1-name mybooklibrary-demo-db --d1-id 9db6893d-38e3-4795-b24d-1901d6a929ad --yes`（デモの D1 の**全テーブル**を空にする） で空にする（手順 8 の `demo:seed reset` は、`demo_` のユーザーとそのデータだけを消すため、マスターデータや、デモ以外のデータは残る）。

## 1. ローカルの MySQL を起動する（デモのマスターデータの読み出し専用）

パスワードはその場で生成し、Git の対象外のファイルにだけ書く（画面には出さない）。

```bash
PW=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
docker run -d --name mbl-demo-mysql --restart unless-stopped \
  -e MYSQL_ROOT_PASSWORD="$PW" -e MYSQL_DATABASE=demo_source \
  -p 127.0.0.1:3310:3306 \
  mysql:8.4 --sql-require-primary-key=OFF --character-set-server=utf8mb4
printf 'MIGRATION_SOURCE_DATABASE_URL="mysql://root:%s@localhost:3310/demo_source"\n' "$PW" > .env.demo-source
```

`docker logs mbl-demo-mysql 2>&1 | tail -3` に `ready for connections` が出るまで待つ（10〜20 秒）。

## 2. ダンプを復号して、復元する

```bash
cd prisma/scripts/migration/dumps
read -rs MBL_BACKUP_PP; export MBL_BACKUP_PP     # パスフレーズを、画面に出さずに入れる（このシェルの中だけ）
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000   -in dump_20261011T145445Z.sql.enc -out dump_20261011T145445Z.decrypted.sql -pass env:MBL_BACKUP_PP
unset MBL_BACKUP_PP
cd ../../../..
cat prisma/scripts/migration/dumps/dump_20261011T145445Z.sql.sha256     # 取得時の記録
sha256sum prisma/scripts/migration/dumps/dump_20261011T145445Z.decrypted.sql   # ↑と同じであること
CID=$(docker ps -q -f name=mbl-demo-mysql)
docker exec -i "$CID" sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 demo_source' < prisma/scripts/migration/dumps/dump_20261011T145445Z.decrypted.sql
```

- `restore-to-target.ts` は使わない（このダンプの構成を、想定外として拒否するため）。[リハーサルの手順書](d1-rehearsal-runbook.md)と同じ。
- マスターデータだけを読むため、`prisma migrate deploy`（メールの小文字化）は不要。

## 3. 事前確認（書き込まない）

```bash
export MIGRATION_SOURCE_DATABASE_URL="$(grep '^MIGRATION_SOURCE_DATABASE_URL=' .env.demo-source | sed -e 's/^MIGRATION_SOURCE_DATABASE_URL=//' -e 's/"//g')"
npm run migration:d1 -- migrate --profile demo --dry-run
```

次の 5 表の件数が出ること（取得したダンプの時点。賞 4、受賞 3,035、著者 1,393、本 3,014、ISBN 1,699）。

## 4. デモ用 D1 へ、マスターデータを投入する

```bash
npm run migration:d1 -- migrate --profile demo --remote --d1-name mybooklibrary-demo-db --d1-id 9db6893d-38e3-4795-b24d-1901d6a929ad --yes
```

最後に、**照合がすべて成功**したことが出ること（件数・キー・列ごとのハッシュ・外部キー・採番）。失敗したら、`npm run migration:d1 -- reset --profile demo --remote --d1-name mybooklibrary-demo-db --d1-id 9db6893d-38e3-4795-b24d-1901d6a929ad --yes`（デモの D1 の**全テーブル**を空にする） で空にして、原因を確かめてから、やり直す。**失敗・中断したときも、手順 5 の削除を必ず行う。**

## 5. 実データを、すぐに削除する（必ず行う。手順 2〜4 が失敗・中断したときも）

投入が終わったら（または、手順 2〜4 のどこかで止まったら）、**手順 6 に進む前に**削除する（復元した MySQL とダンプには、実データ（ユーザー関連）が含まれる）。

```bash
docker rm -fv mbl-demo-mysql                           # 復元先の MySQL を、ボリュームごと削除
rm -f .env.demo-source
rm -f prisma/scripts/migration/dumps/*.sql             # 復号した平文（dump_*.decrypted.sql と、以前に残っている dump_*.sql）
unset MIGRATION_SOURCE_DATABASE_URL
ls prisma/scripts/migration/dumps                      # .enc と .sha256 だけが残っていること
```

## 6. 架空のユーザーと関係を作る

```bash
npm run demo:seed -- seed --remote --d1-name mybooklibrary-demo-db --d1-id 9db6893d-38e3-4795-b24d-1901d6a929ad --yes
```

- 管理者は作らない（`DEMO_ADMIN_PASSWORD` を設定しない）。
- 最後に、各件数が出る。ユーザーは 8 名。

## 7. 実データが入っていないことを、件数で確認する

手順 6（`demo:seed`）の**あと**に実行する（手順 6 の前に実行すると、`users` は 0 になる）。**SQL は、改行を入れずに 1 行で実行する**（Windows では、`npx` が `cmd.exe` を経由し、引数の途中の改行で SQL が打ち切られて、`incomplete input: SQLITE_ERROR` になる）。長い 1 行が折り返されて表示されても、貼り付けるときにスペースが抜けないよう、そのままコピーする。

```bash
npx wrangler d1 execute DB --remote --env demo --command "SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM users WHERE substr(name,1,5) <> 'demo_') AS users_not_demo, (SELECT count(*) FROM users WHERE email NOT LIKE '%@example.com') AS users_real_domain, (SELECT count(*) FROM books WHERE created_by_user_id IS NOT NULL) AS books_with_owner, (SELECT count(*) FROM accounts) + (SELECT count(*) FROM sessions) + (SELECT count(*) FROM verification_tokens) AS auth_rows, (SELECT count(*) FROM audit_logs) + (SELECT count(*) FROM contact_inquiries) + (SELECT count(*) FROM book_enrichment_jobs) + (SELECT count(*) FROM book_enrichment_items) AS other_rows"
```

`users` が 8、**それ以外がすべて 0** であること。0 でなければ、実データが入った可能性があるため、先へ進まず、`npm run migration:d1 -- reset --profile demo --remote --d1-name mybooklibrary-demo-db --d1-id 9db6893d-38e3-4795-b24d-1901d6a929ad --yes`（デモの D1 の**全テーブル**を空にする） で空にして、手順 4 からやり直す。

## 8. 初期化 → 再投入で、元の状態に戻ることを確認する

```bash
npm run demo:seed -- status --remote --d1-name mybooklibrary-demo-db --d1-id 9db6893d-38e3-4795-b24d-1901d6a929ad   # 件数を控える
npm run demo:seed -- reset  --remote --d1-name mybooklibrary-demo-db --d1-id 9db6893d-38e3-4795-b24d-1901d6a929ad --yes   # すべて 0 になる
npm run demo:seed -- seed   --remote --d1-name mybooklibrary-demo-db --d1-id 9db6893d-38e3-4795-b24d-1901d6a929ad --yes
npm run demo:seed -- status --remote --d1-name mybooklibrary-demo-db --d1-id 9db6893d-38e3-4795-b24d-1901d6a929ad   # 最初の件数と同じであること
```

- `reset` は、`demo_` のユーザーとそのデータだけを消す。マスターデータは残る（本・著者などの件数が変わらないこと）。
- マスターデータも入れ直す場合は、`migration:d1 -- reset --profile demo --remote ... --yes`（デモの D1 の全テーブルを空にする）の後、手順 1〜5 をやり直す。

## 9. 動作を確認する

### 9-1. 楽天 API（コマンド）

```bash
npm run smoke:demo-rakuten
```

`OK` が 2 行（ログイン、楽天ブックスの結果）出ること。楽天の許可ドメインの登録、`RAKUTEN_*` の secret を確認できる。NDL の結果は数えない。

### 9-2. 目視（ブラウザ）

`https://mybooklibrary-demo.nyproducts.workers.dev/login` で、**デモアカウント**（`demo_sakura@example.com`、パスワードはログイン画面に表示される公開用の値）で確認する。

| 項目 | 期待する結果 |
| --- | --- |
| ログイン画面 | 注意書きとデモアカウントの案内が出る。Google ログイン・新規登録・パスワード再設定の導線がない |
| ログイン | できる。ダッシュボードが表示される |
| 本の検索 | 楽天の結果が出る。賞の本（受賞作）が一覧に出る |
| 賞別一覧（`/awards`） | 作品リストが表示される（賞のタブ・年度・「すべて」）。「This page couldn't load」にならない（#730） |
| 読書状況 | 変更できる（読了・読書中・読みたい）。変更のあとにスクロールしても、エラー画面が出ない |
| レビュー | 投稿・表示できる。ネタバレありのレビューも出る |
| フォロー | フォロー・フォロワーの一覧が出る。フォロー・解除ができる |
| 通知 | 通知が出る。既読にできる |
| お気に入り著者・図書館 | 出る |
| 保護 | 設定に、合言葉・アカウント削除がない。パスワード変更は案内だけ。`/admin` は開けない。新規登録は案内だけ |
| 楽天 API の回数制限 | ホームとお気に入り著者の一覧を表示しても、Worker のログ（`npx wrangler tail mybooklibrary-demo`）に、`/favorite-authors/N?_rsc` の呼び出しと `楽天API 429` が出ない（#732） |

### 9-3. 定期的な初期化（Cron）の動作確認

#721 がデプロイされていること（手順 0）。`/api/cron/reset-demo` と、デモの Cron（毎日 JST 03:00）は、#721 で入る。

**方法 A（すぐに確認）**: デモの `CRON_SECRET` を、値を知っているものに、いったん登録し直して、API を呼ぶ（値は画面に出さない。確認後も、そのままでよい）。**値は、16 文字以上の、デモ用に新しく作ったもの**にする（短いと `Cron secret is not configured` になる。AWS で使っていた本番用の値は使わない）。例: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`

```bash
read -rs CRON; export CRON
printf '%s' "$CRON" | npx wrangler secret put CRON_SECRET --env demo
curl -s -H "Authorization: Bearer $CRON" https://mybooklibrary-demo.nyproducts.workers.dev/api/cron/reset-demo
unset CRON
```

`{"ok":true,"users":8,"counts":{...}}` が返ること。確認用に、事前に、デモのレビューを 1 件投稿しておくと、初期化で消えることも見られる。

**方法 B（翌日に確認）**: 毎日 JST 03:00 に、Cron が実行される。ダッシュボードの `mybooklibrary-demo` → 「Observability」のログに、`cron finished` と `status: 200` が出ること。

## 10. 結果の記録（Issue #722 に書く内容）

実施日、各手順の所要時間、件数（マスター 5 表、ユーザー、関係）、手順 7 の確認結果、手順 8 の再投入の結果、手順 9 の確認結果（表）、つまずいた点を書く。**値（メール・本文・secret）は書かない。**

## つまずいたとき

| 症状 | 原因と対処 |
| --- | --- |
| `--profile demo の移行先は、デモの D1 だけです` | `--d1-name` と `--d1-id` が、デモの D1（`mybooklibrary-demo-db`、上の ID）と一致していない |
| `デモの D1 には、全テーブルの移行はできません` | `--profile demo` を付け忘れた |
| `書き込み先が空ではありません` | すでにマスターデータが入っている。必要なら `migration:d1 -- reset --profile demo ...` で空にする |
| `賞のある本が 8 冊以上必要です` | 手順 4（マスターデータの投入）が済んでいない |
| `デモ以外のユーザーがいます` | デモのユーザーと同じメールの、デモ以外のユーザーがいる。内容を確認して、先に取り除く |
| `PrismaClientInitializationError`（手順 3・4） | ローカルの MySQL に繋がらない。Docker が止まっていることが多い。`docker start mbl-demo-mysql` で再開し、`ready for connections` を待つ |
| `smoke:demo-rakuten` の 2 つ目が `NG` | 楽天の許可ドメインにデモのドメインがない、`RAKUTEN_*` の誤り、`RAKUTEN_ALLOWED_ORIGIN` の誤り。Worker のログ（`npx wrangler tail --env demo`）に「楽天API エラー」が出ていないか見る |
| `smoke:demo-rakuten` の 1 つ目が `NG` | 手順 6 が済んでいない。または、デモの D1 のマイグレーションが未適用 |
| `incomplete input: SQLITE_ERROR`（`wrangler d1 execute`） | `--command` の SQL に改行が入っている（Windows）。1 行にして実行する |
| `/api/cron/reset-demo` が、404 の HTML ページを返す | デモに #721 がデプロイされていない。`demo` ブランチを `main` に揃え（`git push origin origin/main:demo`）、`/api/version` の `tag` が `main` の先頭と一致してから、もう一度行う |
| `/api/cron/reset-demo` が `Cron secret is not configured` を返す | `CRON_SECRET` が空か、16 文字未満。16 文字以上の値で登録し直す |
| 賞別一覧が「This page couldn't load」になる | `demo` ブランチに #730 の修正が入っていない。ログに `too many SQL variables` が出ていれば、これ |
| 認証エラー | `npx wrangler login` をやり直す |
