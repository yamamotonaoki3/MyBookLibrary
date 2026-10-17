# D1 移行リハーサル手順書（#690）

本番相当のデータ（取得済みの暗号化ダンプ）を匿名化して、リハーサル専用の D1 へ移行し、照合・所要時間・やり直しを確認する手順。方針は [移行計画書 §7-3 / §7-4](archive/cloudflare-d1-migration-plan.md)、ツールの詳細は [移行ツールの README](../app/prisma/scripts/migration/README.md) の「D1 への移行（#689）」。

> **実行するのは所有者本人**です（パスフレーズ・`wrangler login` が必要なため）。パスフレーズ・復号したダンプの中身・接続情報の値は、チャットや Issue・PR に書かない。

## 方針（先に読む）

| 決めたこと | 理由 |
| --- | --- |
| 書き込み先は、**リハーサル専用の D1 `mybooklibrary-rehearsal-db`** を新しく作る | ステージングの D1 は、架空データ専用（計画書 §7-3 の 6）。本番 D1 は最終投入（#691）まで触らない |
| 移行元は、**このリハーサル専用のローカル MySQL（Docker、ポート 3308）**。開発用の DB（3306）・テスト用の DB（3307）は使わない | `restore-to-target.ts` は、実行前に移行先の全テーブルを DROP するため |
| ダンプは、**移行の前に匿名化**する（`anonymize-rehearsal.sql`） | 実データ（氏名・メール・ハッシュ・トークン・本文）を D1 に置かない（個人情報の持ち込み禁止） |
| 実データが原因で失敗する事前確認（メールの重複・JSON の null）は、**匿名化の前に**行う | 匿名化すると、これらを検出できなくなる |
| 機能の確認（ログイン・画面）は、このリハーサルではしない | 匿名化でパスワードが変わるため。機能は架空データのステージングで確認済み（計画書 §7-3 の 6） |

実行するディレクトリは、すべて `app/`（Git Bash）。

## 0. 前提の確認

```bash
cd app
docker info > /dev/null && echo "Docker OK"     # 失敗したら Docker Desktop を起動して、完全に立ち上がるまで待つ
npx wrangler whoami                              # ログイン済みであること（なければ npx wrangler login）
ls prisma/scripts/migration/dumps                # dump_20261011T145445Z.sql.enc と .sha256 があること
```

## 1. リハーサル専用の D1 を作る（初回のみ）

```bash
npx wrangler d1 create mybooklibrary-rehearsal-db
```

対話の質問には、次のように答える。

- 設定ファイルに追記するか → **no**（一時的な設定ファイルを使うため、`wrangler.jsonc` は変更しない）
- ローカル開発でリモートに接続するか → **N**（既定のまま Enter）

**`d1 create` は、同じ名前でも何度でも作れてしまう**（2 回実行すると、同じ名前の D1 が 2 つできる）。1 回だけ実行し、やり直すときは先にダッシュボードで消す。

出力された `database_id`（UUID）を控える（秘密情報ではない）。次に、マイグレーションを適用するための一時的な設定ファイルを作る（`app/.wrangler/` は Git の対象外）。`<ID>` を置き換える。

```bash
mkdir -p .wrangler
cat > .wrangler/rehearsal.jsonc <<'EOF'
{
  "name": "mbl-rehearsal",
  "compatibility_date": "2026-10-01",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "mybooklibrary-rehearsal-db",
      "database_id": "<ID>",
      "migrations_dir": "../prisma/d1/migrations"
    }
  ]
}
EOF
npx wrangler d1 migrations apply DB --remote --config .wrangler/rehearsal.jsonc
```

以降、`<ID>` と書いた箇所は、この D1 の ID。

## 2. ローカルの MySQL を起動する（リハーサル専用）

パスワードはその場で生成し、Git の対象外のファイルにだけ書く（画面には出さない）。

```bash
PW=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
docker run -d --name mbl-rehearsal-mysql \
  -e MYSQL_ROOT_PASSWORD="$PW" -e MYSQL_DATABASE=rehearsal \
  -p 127.0.0.1:3308:3306 \
  mysql:8.4 --sql-require-primary-key=OFF --character-set-server=utf8mb4
printf 'DATABASE_URL="mysql://root:%s@localhost:3308/rehearsal"\nMIGRATION_TARGET_ALLOWED_HOSTS="localhost"\nPRODUCTION_DB_HOST="prod.invalid"\n' "$PW" > .env.migration-target
```

- `--sql-require-primary-key=OFF` は、主キーのない `verification_tokens` を復元するために必要（README の「3. restore」の注意）。
- 起動に 10〜20 秒かかる。`docker logs mbl-rehearsal-mysql 2>&1 | tail -3` に `ready for connections` が出るまで待つ。

## 3. ダンプを復号して、ローカルの MySQL に復元する

```bash
cd prisma/scripts/migration/dumps
# パスフレーズを、画面に出さずに環境変数へ入れる（このシェルの中だけ）
read -rs MBL_BACKUP_PP; export MBL_BACKUP_PP
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000   -in dump_20261011T145445Z.sql.enc -out dump_20261011T145445Z.decrypted.sql -pass env:MBL_BACKUP_PP
unset MBL_BACKUP_PP
cd ../../../..
```

復号した内容が、取得時の記録と一致することを確認する（2 つの出力が同じであること）。

```bash
cat prisma/scripts/migration/dumps/dump_20261011T145445Z.sql.sha256
sha256sum prisma/scripts/migration/dumps/dump_20261011T145445Z.decrypted.sql
```

- 平文の `dump_20261011T145445Z.sql` がすでに残っている場合は、復号せず、それを使ってもよい（上の `sha256sum` を、その平文に対して実行して比べる）。
- **`restore-to-target.ts` は使わない。** このダンプは、取得時点のすべてのマイグレーション（24 件、22 テーブル）が適用済みで、`restore-to-target.ts` が期待する旧構成（12 件）と一致せず、`--dry-run` の時点で拒否される。空の新しいコンテナに、`mysql` で直接流し込む。

復元して、残りの MySQL マイグレーション（メールの小文字化）を適用する。**所要時間を `time` で記録**する。

```bash
CID=$(docker ps -q -f name=mbl-rehearsal-mysql)
time docker exec -i "$CID" sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 rehearsal'   < prisma/scripts/migration/dumps/dump_20261011T145445Z.decrypted.sql
npx dotenv -e .env.migration-target -o --no-expand -- npx prisma migrate deploy
```

`migrate deploy` で、`20261012000000_lowercase_user_emails` だけが適用されること。これがメールの重複で失敗したら、それは**実データの問題**。メールの値は書かずに、件数だけを控えて相談する。

## 4. 事前確認（匿名化の前）

```bash
export MIGRATION_SOURCE_DATABASE_URL="$(grep '^DATABASE_URL=' .env.migration-target | sed -e 's/^DATABASE_URL=//' -e 's/"//g')"
npm run migration:d1 -- migrate --dry-run
```

メールの重複（小文字化後）と、JSON の `null` が、ないことを確認する（どちらかがあれば、エラーで止まる）。件数の一覧は、次の手順の照合と見比べるために控える。

## 5. 匿名化する

```bash
CID=$(docker ps -q -f name=mbl-rehearsal-mysql)
docker exec -i "$CID" sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 rehearsal' < prisma/scripts/migration/anonymize-rehearsal.sql
```

最後に出る一覧（`users_email_left` など）が**すべて 0** であること。0 でなければ置き換え漏れなので、先へ進まない。

## 6. リモートの D1 へ移行する（1 回目）

```bash
time npm run migration:d1 -- migrate --remote --d1-name mybooklibrary-rehearsal-db --d1-id <ID> --yes
```

- 最後に「照合: すべて成功しました」が出て、終了コードが 0 であること。
- 表ごとの進み具合と、全体の所要時間を記録する。
- 失敗した場合は、出力の表名・エラーコードだけを控える（値は出ない設計）。

## 7. 照合だけをもう一度（読み取りのみ）

```bash
time npm run migration:d1 -- verify --remote --d1-name mybooklibrary-rehearsal-db --d1-id <ID>
```

さらに、採番と代表データを、件数だけで確認する（値は見ない）。

```bash
npx wrangler d1 execute DB --remote --config .wrangler/rehearsal.jsonc --command \
  "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM users WHERE role='admin') AS admins, (SELECT COUNT(*) FROM accounts) AS oauth_accounts, (SELECT COUNT(*) FROM books WHERE source='manual') AS manual_books, (SELECT COUNT(*) FROM reviews) AS reviews, (SELECT COUNT(*) FROM follows) AS follows"
```

計画書 §7-3 の 5（代表データの確認）は、**管理者・OAuth ユーザー・手動登録本・レビュー・フォローが、それぞれ 1 件以上ある**ことで代える（匿名化後のため、ログインはしない）。0 件のものがあれば、記録に残す。

## 8. やり直しを確認する（2 回目）

```bash
time npm run migration:d1 -- reset --remote --d1-name mybooklibrary-rehearsal-db --d1-id <ID> --yes
time npm run migration:d1 -- migrate --remote --d1-name mybooklibrary-rehearsal-db --d1-id <ID> --yes
```

`reset` で全テーブルが空になり、2 回目の `migrate` も、照合がすべて成功すること。計画書 §9 のとおり、**リハーサルは最低 2 回**、2 回目が全項目を通るまで繰り返す。

## 9. 後始末（必ず行う）

```bash
docker rm -fv mbl-rehearsal-mysql                      # 復元先の MySQL（匿名化前のデータを含む）を、ボリュームごと削除
rm -f .env.migration-target .wrangler/rehearsal.jsonc
rm -f prisma/scripts/migration/dumps/*.decrypted.sql   # 復号した平文
unset MIGRATION_SOURCE_DATABASE_URL
```

- 平文の `dump_20261011T145445Z.sql` は、リハーサルが終われば削除する（暗号化した `.enc` と `.sha256` は残す。本番投入の #691 で、もう一度復号する）。
- リハーサル用 D1 `mybooklibrary-rehearsal-db` は、#691 の最終リハーサルが終わるまで残す（匿名化済みで、本番の個人情報は含まない）。不要になったら `npx wrangler d1 delete mybooklibrary-rehearsal-db`。

## 10. 結果の記録（Issue #690 に書く内容）

値（メール・本文など）は書かない。件数・時間・PASS/FAIL だけ。

| 項目 | 1 回目 | 2 回目（やり直し後） |
| --- | --- | --- |
| 復元（restore + migrate deploy）の所要時間 | | — |
| 移行（migrate）の所要時間 | | |
| 照合（verify）の所要時間 | | |
| 照合の結果（失敗項目数） | | |
| 総件数（全 21 テーブルの合計） | | |
| 代表データ（管理者・OAuth・手動登録本・レビュー・フォロー）が 1 件以上 | | — |

受け入れ基準: 匿名化ダンプで移行・検証が成功した／所要時間を記録した／やり直し手順を確認した。

## 実施結果（2026-10-13）

| 項目 | 1 回目 | 2 回目（やり直し後） |
| --- | --- | --- |
| 移行 + 続けての照合 | 2 分 56 秒 | 4 分 40 秒 |
| 空にする（`reset`） | — | 11 秒 |
| 照合のみ（`verify`） | 1 分 57 秒 | — |
| 照合の結果 | 173 項目すべて成功 | 173 項目すべて成功 |
| 件数 | 21 テーブル、14,793 件 | 同じ |

実データに 0 件のテーブル: `accounts`、`sessions`、`verification_tokens`、`follows`、`reviews`、`likes`、`reports`、`contact_inquiries`（OAuth・レビュー・フォロー・手動登録本は、実データでは確認できない。架空データでの検証は、結合テストで済み）。最終投入（#691）の所要時間は、5 分前後を見込む。

## つまずいたとき

| 症状 | 原因と対処 |
| --- | --- |
| `docker run` の直後に接続できない | MySQL の起動待ち。`docker logs` に `ready for connections` が出るまで待つ |
| 復元が `sql_require_primary_key` で失敗 | `--sql-require-primary-key=OFF` を付けずに起動した。コンテナを削除して手順 2 からやり直す |
| `migrate` が「書き込み先が空ではありません」で中断 | 前回の投入が残っている。`reset` で空にしてからやり直す |
| `migrate` が「メールの重複」「JSON の null」で中断 | 実データの問題。手順 4 で見つかるはず。件数を控えて相談する |
| 「リモートの D1 の名前と ID の両方が必要」 | `--d1-name` と `--d1-id` の両方を指定する |
| 本番 D1 のエラー（`--confirm-production`） | 名前か ID が本番のものになっている。`<ID>` がリハーサル用 D1 のものか確認する |
| 認証エラー | `npx wrangler login` をやり直す |
| `PrismaClientInitializationError`（照合・移行） | 移行元のローカル MySQL に繋がらない。Docker が止まって、コンテナも落ちていることが多い。`docker start mbl-rehearsal-mysql` で再開し、`ready for connections` を待ってから再実行する（データはコンテナに残る）。手順 2 の `docker run` に `--restart unless-stopped` を付けておくと、Docker の再起動で自動的に戻る |
| 匿名化 SQL が照合順序（collation）のエラー | 変数とテーブルの列の比較で起きる。比較には `BINARY` を使う（修正済み） |
