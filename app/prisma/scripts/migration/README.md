# 移行・整合性照合ツール（Issue #478）

本番DB（AWS RDS MySQL）から新しい移行先 DB（MySQL→MySQL 前提）への移行に使う、再実行可能な移行・照合ツール群。

> **注記（#609）**: 本ディレクトリの restore/verify は MySQL → MySQL 用。D1 への移行は、末尾の「D1 への移行（#689）」の `mysql-to-d1.ts` を使う。

前提となる仕様は [`docs/archive/data-migration-spec-481.md`](../../../../docs/archive/data-migration-spec-481.md) を参照。**ETL変換は行わない**。方式は「dump復元 → 未適用migrationを`prisma migrate deploy`で適用」のみ。

## 全体の流れ

```
[1] dump取得        dump-production.sh
[2] チェックサム保存 dump-checksum.ts
[3] restore          restore-to-target.ts --stop-before-migrate
[4] 照合・migration  verify(restored) → migrate deploy → verify(migrated)
[5] （manual本があれば）backfill-book-owner.ts --dry-run → 人手承認 → --apply-from
```

## 準備

```bash
cd app
cp .env.migration-source.example .env.migration-source   # dump取得元の接続情報
cp .env.migration-target.example .env.migration-target   # restore/verify先の接続情報
# それぞれのファイルを実際の値に編集する（コミットしないこと）
```

## 1. dump取得

```bash
cd app
npx dotenv -e .env.migration-source -o --no-expand -- ./prisma/scripts/migration/dump-production.sh ./prisma/scripts/migration/dumps
```

（`set -a; source .env.migration-source; set +a` のようにシェルの`source`で読み込むと、パスワードに`$`やバッククォート等のシェル特殊文字が含まれる場合、値がシェルコードとして展開・実行されてしまう危険がある。上記の`dotenv-cli`経由の読み込みは、値を展開せずそのまま子プロセスの環境変数として渡すため安全。）

`--single-transaction --skip-extended-insert --default-character-set=utf8mb4` を指定して取得する（`--skip-extended-insert`は照合ツールの件数パースに必須）。

## 2. チェックサム保存・read-only化

```bash
npx tsx prisma/scripts/migration/dump-checksum.ts ./prisma/scripts/migration/dumps/dump_xxx.sql
```

## 3. restore

**新しい移行先環境を使う場合、restore（dumpのCREATE TABLE実行）より前に、移行先DBの管理コンソールから `mysql.sql_require_primary_key` を無効化しておくこと。** `verification_tokens`テーブルは本番の12件のmigration時点から主キーを持たない設計（複合UNIQUE制約のみ）であり、この設定が有効なままだと`prisma migrate deploy`だけでなく、dumpの`CREATE TABLE`文をmysqlクライアントで実行する時点（下記コマンド）で既に失敗する（Issue #479の申し送り）。

```bash
# まず --dry-run で実行計画を確認する（DBへの書き込みは一切行わない）
npx dotenv -e .env.migration-target -o --no-expand -- npx tsx prisma/scripts/migration/restore-to-target.ts \
  --dump ./prisma/scripts/migration/dumps/dump_xxx.sql --stop-before-migrate --dry-run

# 内容を確認したら、migrate deploy前で停止するオプションを付けて本実行
npx dotenv -e .env.migration-target -o --no-expand -- npx tsx prisma/scripts/migration/restore-to-target.ts \
  --dump ./prisma/scripts/migration/dumps/dump_xxx.sql --stop-before-migrate
```

- 実行前に移行先DBを全テーブルDROPして初期化する（`_prisma_migrations`・`follows`・`audit_logs`も含む）。`--skip-reset`で初期化をスキップできる（再開用途のみ）。
- 初期化後、`mysql`クライアントでdumpを復元する。`--stop-before-migrate`指定時はここで終了する。
- `--stop-before-migrate`を省略すれば、従来どおり復元後に続けて`prisma migrate deploy`まで実行できる。
- `DATABASE_URL`の`sslaccept`・`sslcert`は、mysqlクライアントのTLSオプションにも反映される。`sslcert`はPrismaの慣例に合わせて`app/prisma/`ディレクトリを基準に解決される（例: `sslcert=../certs/ca.pem` は `app/certs/ca.pem` を指す）。

### 失敗時の切り分け

- `mysql`クライアントの実行が失敗した場合、エラーメッセージに失敗したSQL文（テーブル名を含む）が出力される。
- `prisma migrate deploy`が失敗した場合、restore自体は成功している可能性がある。以下のクエリで`_prisma_migrations`の状態を直接確認できる。

  ```sql
  SELECT migration_name, finished_at, rolled_back_at FROM `_prisma_migrations` ORDER BY started_at;
  ```

## 4. 照合・migrate deploy

```bash
# restore直後（migrate deploy前）の確認
npx dotenv -e .env.migration-target -o --no-expand -- npx tsx prisma/scripts/migration/verify-migration.ts \
  --dump ./prisma/scripts/migration/dumps/dump_xxx.sql --phase restored

# restoredフェーズの照合が全件PASSしたら、未適用migrationを適用
npx dotenv -e .env.migration-target -o --no-expand -- npx prisma migrate deploy

# migrate deploy後の確認
npx dotenv -e .env.migration-target -o --no-expand -- npx tsx prisma/scripts/migration/verify-migration.ts \
  --dump ./prisma/scripts/migration/dumps/dump_xxx.sql --phase migrated
```

- 16のアプリケーションテーブル: dump由来の件数・AUTO_INCREMENT期待値と実測値を比較。
- `_prisma_migrations`: `--phase restored`で12件、`--phase migrated`で18件をアサート。
- `follows`・`audit_logs`: `--phase migrated`のみ、`COUNT(*)=0`をアサート。
- UNIQUE制約の重複、外部キーのorphan（親不在行）も検査する。`--phase restored`では未反映migrationで追加される制約を除外し、`--phase migrated`では全件を検査する。

### 本番切替（#475）時のみ: `--source-live`

書き込み凍結中の移行元DBへの直接照会を三者比較に加える。`.env.migration-source`の`SOURCE_DATABASE_URL`を設定したうえで指定する。リハーサル（#480）では指定しない（書き込みを止めないため、別セッションのCOUNT(*)をdumpと同一スナップショットとして扱えない）。

```bash
npx dotenv -e .env.migration-target -e .env.migration-source -o --no-expand -- npx tsx prisma/scripts/migration/verify-migration.ts \
  --dump ./prisma/scripts/migration/dumps/dump_xxx.sql --phase migrated --source-live
```

## 5. 手動登録本（`books.source='manual'`）の所有者バックフィル

`SELECT source, COUNT(*) FROM books GROUP BY source;` で`manual`が1件以上あれば実施する。0件なら不要。

```bash
# 1. dry-run: 対応表を出力する（DBは更新しない）
npx dotenv -e .env.migration-target -o --no-expand -- npx tsx prisma/scripts/backfill-book-owner.ts \
  --dry-run --out ./candidates.json

# 2. candidates.json を人手で1件ずつ確認する。
#    推定できない(estimatedUserId=null)ものや、不審な推定は承認ファイルに含めない。
#    承認したものだけを次の形式の approved.json にまとめる。
#      [{ "bookId": 12, "userId": 5 }, ...]

# 3. 承認済みファイルの内容だけを本更新する
npx dotenv -e .env.migration-target -o --no-expand -- npx tsx prisma/scripts/backfill-book-owner.ts \
  --apply-from ./approved.json
```

## 再実行・冪等性

`restore-to-target.ts`は、同一dumpに対して繰り返し実行しても同じ結果になる（既定でDB完全初期化から始めるため）。テーブル単位の部分再開が必要な場合のみ`--skip-reset`を使う。

## 安全装置

- `migrationGuard.ts`: 接続先ホストが`MIGRATION_TARGET_ALLOWED_HOSTS`の許可リストに含まれ、かつ`PRODUCTION_DB_HOST`と一致しないことを確認する。`PRODUCTION_DB_HOST`は省略できない（fail-closed。未設定の場合は設定ミスとみなし接続前に例外を投げる）。
- `restore-to-target.ts`は、DB初期化を実行する前に、dumpのテーブル構成が本番（12件のmigration適用済み）の期待値（`_prisma_migrations`＋16アプリケーションテーブル）と過不足なく一致することを検証する。空のdumpや不完全なdumpをそのまま復元してしまう事故を防ぐため。
- `restore-to-target.ts`は、実際にimportする直前に`<dump>.sha256`の記録値とdumpファイルの実測SHA-256が一致することを検証する。`dump-checksum.ts`実行後にdumpが改変されていないことを確認するため。
- dumpファイル・接続情報は全て`.gitignore`対象（`app/.env.migration-*`、`app/prisma/scripts/migration/dumps/`）。コミットされるのは`.env.migration-*.example`のプレースホルダのみ。

## D1 への移行（#689）

Cloudflare D1 への移行は、`mysql-to-d1.ts`（`npm run migration:d1`）で行う。方式は、Prisma で「MySQL から読み → D1 へ書く」ETL（[移行計画書 §7](../../../../docs/archive/cloudflare-d1-migration-plan.md)）。ID・bcrypt ハッシュ・日時（ミリ秒）・日本語をそのまま移し、メールアドレスだけ小文字化・前後の空白除去（`normalizeEmail`）する。投入順は外部キーの親 → 子。

**移行元**は、取得済みのダンプを**ローカルの MySQL（Docker）へ復元したもの**。環境変数 `MIGRATION_SOURCE_DATABASE_URL` に接続文字列を渡す（ホストは localhost / 127.0.0.1 のみ許可。アプリの `DATABASE_URL` は読まない）。復元の手順は上の「3. restore」。復元後は、未適用の MySQL マイグレーションも適用しておく（`follows`・`audit_logs` などの新しいテーブルが必要）。**移行先**は wrangler のログイン（`npx wrangler login`）で接続する。

```bash
cd app
# 1. 移行元の件数と、メールの重複（小文字化後）だけを確認する（書き込まない）
npm run migration:d1 -- migrate --dry-run

# 2. ローカルの D1 へ移行して練習する（マイグレーションも自動で適用。保存先は既定で app/.wrangler/migration-rehearsal）
npm run migration:d1 -- migrate --local --yes

# 3. リモートの D1（リハーサル用）へ移行する。名前と ID の両方を指定する
npm run migration:d1 -- migrate --remote --d1-name <D1 の名前> --d1-id <D1 の ID> --yes

# 照合だけを実行する（読み取りのみ）／ 移行先を空にしてやり直す
npm run migration:d1 -- verify --remote --d1-name <名前> --d1-id <ID>
npm run migration:d1 -- reset  --remote --d1-name <名前> --d1-id <ID> --yes
```

- `migrate` は、移行先の全テーブルが空でなければ、何も書かずに中断する（既存のデータへの上書き・重複投入を防ぐ）。やり直しは `reset` で空にしてから行う。リモートの D1 には、あらかじめマイグレーション（`wrangler d1 migrations apply`）を適用しておく。
- `migrate` は、書き込みのあと、続けて照合する。照合は、表ごとの**件数・キーの集合（欠落・余剰）・列ごとの SHA-256**、外部キー違反（`PRAGMA foreign_key_check`）、採番（`sqlite_sequence`）が最大 ID 以上であること。変換する列（`users.email`）は、移行元を変換した値と比較する。1 つでも失敗すれば終了コード 1。
- **移行元が空（`users` と `books` が 0 件。デモ用の `--profile demo` は `books` だけ）のときは、`migrate` は何も書かずに中断する**。ダンプの復元に失敗すると、移行元は、表だけあり、中身が空になる。空を空へ移しても、照合は「成功」と表示されるため、気づけない（本番の切り替えで起きた。#691・#755）。`--dry-run` も、空のときは警告を出し、終了コードを 1 にする。意図して空を移すときだけ、`--allow-empty-source` を付ける。
- 出力は、表名・列名・件数・PASS/FAIL だけ。**値（メールアドレス・本文など）は出さない。**
- 本番の D1 は、**名前（`mybooklibrary-db`）でも ID（`wrangler.jsonc` のトップレベルの `database_id`）でも**、`--confirm-production mybooklibrary-db` を付けない限り拒否する。最終投入の手順は #691。
- 移行前に、移行元の確認を自動で行う: メールの小文字化後の重複、Json 列（`audit_logs.detail`、`book_enrichment_items.result_detail`）の **JSON の `null`**（SQL の NULL とは別の値。Prisma は区別できず、移行すると SQL の NULL になるため）。どちらかがあれば、何も書かずに中断する。
- 書き込みに失敗したときのエラーは、Prisma のメッセージに含まれる値（メールアドレス・本文など）を出さず、表名・エラーの種類・コードだけを表示する。
- 実データを扱うため、リハーサル用の D1 には、匿名化したデータだけを入れる（手順は [docs/d1-rehearsal-runbook.md](../../../../docs/d1-rehearsal-runbook.md)、#690）。移行元のダンプ・復元先の MySQL は、作業後に削除する。

### デモ用 D1 へのマスターデータの投入（#719）

公開するデモ環境（[docs/demo-environment.md](../../../../docs/demo-environment.md)）の D1 へは、`--profile demo` で、マスターデータ（賞・著者・本・ISBN・受賞）だけを投入する。ユーザー・レビュー・読書状況などは移さない。本の「登録者」（`created_by_user_id`）は空にする。

```bash
npm run migration:d1 -- migrate --profile demo --dry-run
npm run migration:d1 -- migrate --profile demo --remote --d1-name mybooklibrary-demo-db --d1-id <デモの D1 の ID> --yes
npm run migration:d1 -- verify  --profile demo --remote --d1-name mybooklibrary-demo-db --d1-id <デモの D1 の ID>
```

- `--profile demo` の移行先は、名前と ID の**両方**がデモの D1 と一致するリモート、またはローカルだけ。本番・ステージングなどの D1 は拒否する。
- `--profile` を付けずにデモの D1 へ移行しようとすると拒否する（実データのユーザーなどを、公開するデモへ入れないため）。
- 移行元は、これまでと同じく、ダンプを復元したローカルの MySQL。手順と後始末は [docs/d1-rehearsal-runbook.md](../../../../docs/d1-rehearsal-runbook.md) と同じ（実データを扱うため、匿名化は不要だが、作業後にダンプと MySQL を削除する）。
- `reset` は、デモの D1 の全テーブルを空にする（マスターデータを入れ直すとき用）。
