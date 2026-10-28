# 本番切り替え手順書（#691）

取得済みの暗号化ダンプ（実データ）を、本番の D1（`mybooklibrary-db`）へ移し、本番 Worker を公開できる状態にする手順。方針は [移行計画書 §9](archive/cloudflare-d1-migration-plan.md)、ツールは [移行ツールの README](../app/prisma/scripts/migration/README.md)、リハーサルは [リハーサル手順書](d1-rehearsal-runbook.md)（#690、匿名化データで 2 回成功済み）。

> **本番の実データを扱います。** 実行するのは所有者本人です。パスフレーズ・接続情報・メール・パスワードなどの値は、チャット・Issue・PR・コミットに書かない。リハーサルと違い、**匿名化はしません**（本番にそのまま入れるため）。作業後は、復元した MySQL と平文のダンプを必ず消す。

## 現在の状態（2026-10-17: 切り替え完了）

本番の切り替えは、2026-10-17 に完了した（結果は #691 のコメント）。この手順書は、**再実行や、同じ作業をやり直すときの記録**として残す。

| 項目 | 状態 |
| --- | --- |
| 本番 D1（`mybooklibrary-db`）| 移行済み（14,793 件。照合は 173 項目すべて成功）|
| 本番 Worker | `main` の最新（`production` ブランチ）で稼働。利用者へ周知済み |
| ダンプ | `app/prisma/scripts/migration/dumps/dump_20261011T145445Z.sql.enc`（暗号化。2026-10-11 時点）。保管して残す。復号した平文と、復元した MySQL は削除済み |
| 公開後の監視 | 最初の 1 週間（下記）|

> 以降の「現在の状態」を前提にした記述（本番 D1 が空であること、`production` ブランチが古いこと）は、**移行前の状態**を指す。再実行するときは、手順 0 で、現状を必ず確認する。

## 方針

| 決めたこと | 理由 |
| --- | --- |
| **データ → コードの順**。先に本番 D1 へ移し、そのあとで `production` ブランチを更新して Worker を最新にする | 本番 Worker は公開前（URL を周知していない）。D1 が空のまま新しいコードを公開するより、データが入ってから公開するほうが安全 |
| 移行の直前に、**D1 Time Travel のブックマーク**を控える | 移行に失敗したとき、空の状態へ戻せる（公開前なので、巻き戻しで失うデータはない）|
| **E2E など書き込みを伴う自動テストは、本番に接続しない** | 計画書 §7-3 の 6 とグローバルルール。機能は、架空データのステージングで確認済み。本番は、所有者本人の手動確認 |
| 公開（URL の周知）は、**手動確認のあと** | 問題があれば、周知の前に直せる |
| **移行は、Cron の時刻（毎日 UTC 00:00 = JST 09:00）の前後 30 分を避けて行う**。所要は 5 分前後 | 本番 Worker の Cron は、移行中のデータを読み書きしうる。URL は未周知だが、Worker 自体は稼働しているため、移行中に第三者が書き込む可能性はゼロではない。そうなった場合は、`migrate` の途中の失敗か、照合の失敗で検出できる（検出したら、ロールバックで空に戻してやり直す）|

実行するディレクトリは `app/`（Git Bash）。

## 0. 事前の確認

```bash
cd app
docker info > /dev/null && echo "Docker OK"
npx wrangler whoami
npx wrangler d1 execute DB --remote --command "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM books) AS books"   # 本番。どちらも 0 であること
```

- 本番 D1 が空でなければ、**先へ進まない**（移行ツールも中断する）。原因を確認する。
- Docker Desktop は、よく止まる。コンテナに `--restart unless-stopped` を付ける（手順 2）。

## 1. 巻き戻し地点を控える

```bash
npx wrangler d1 time-travel info DB
```

出力の `current bookmark`（`00000005-...` の形）を、メモ帳などに控える（秘密情報ではない）。移行に失敗して空に戻したいときに使う（「ロールバック」参照）。

## 2. ローカルの MySQL を起動する

```bash
PW=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
docker run -d --name mbl-cutover-mysql \
  -e MYSQL_ROOT_PASSWORD="$PW" -e MYSQL_DATABASE=cutover \
  -p 127.0.0.1:3309:3306 --restart unless-stopped \
  mysql:8.4 --sql-require-primary-key=OFF --character-set-server=utf8mb4
printf 'DATABASE_URL="mysql://root:%s@localhost:3309/cutover"\n' "$PW" > .env.migration-target
docker logs mbl-cutover-mysql 2>&1 | tail -2    # ready for connections が出るまで待つ
```

## 3. ダンプを復号して復元する

**4 つのブロックに分け、ブロックごとに実行する。まとめて貼り付けない。** `read -rs` は、次に入力された 1 行をパスフレーズとして読む。他の行と一緒に貼ると、次の行がパスフレーズになり、復号に失敗する（切り替えの当日に起きた）。また、失敗しても次の行が実行され、壊れたデータを復元しようとする。**各ブロックの期待する出力を確認してから、次へ進む。**

**A. パスフレーズを入力する**（この 2 行だけを貼る。画面には何も出ない。そのまま、パスフレーズを入力して Enter）

```bash
cd prisma/scripts/migration/dumps
read -rs MBL_BACKUP_PP; export MBL_BACKUP_PP
```

**B. 復号する**（失敗したら、壊れたファイルを消す）

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in dump_20261011T145445Z.sql.enc -out dump_20261011T145445Z.decrypted.sql -pass env:MBL_BACKUP_PP && echo "復号OK" || { echo "復号失敗"; rm -f dump_20261011T145445Z.decrypted.sql; }
unset MBL_BACKUP_PP
cd ../../../..
```

`復号OK` が出ること。`復号失敗`（`bad decrypt`）なら、A からやり直す。

**C. ハッシュを照合する**

```bash
E=$(cut -d' ' -f1 prisma/scripts/migration/dumps/dump_20261011T145445Z.sql.sha256); A=$(sha256sum prisma/scripts/migration/dumps/dump_20261011T145445Z.decrypted.sql | cut -d' ' -f1); [ "$E" = "$A" ] && echo "一致: 続行してよい" || echo "不一致: 中止（先へ進まない）"
```

`一致: 続行してよい` が出たときだけ、D へ進む。

**D. MySQL に復元して、マイグレーションを適用する**

```bash
CID=$(docker ps -q -f name=mbl-cutover-mysql)
time docker exec -i "$CID" sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 cutover'   < prisma/scripts/migration/dumps/dump_20261011T145445Z.decrypted.sql   && npx dotenv -e .env.migration-target -o --no-expand -- npx prisma migrate deploy      # 20261012000000_lowercase_user_emails だけが適用される
```

復元が失敗したときは、`&&` で、マイグレーションは実行されない。エラーなく終わり、上のマイグレーションだけが適用されること。

## 4. 事前確認（書き込まない）

```bash
export MIGRATION_SOURCE_DATABASE_URL="$(grep '^DATABASE_URL=' .env.migration-target | sed -e 's/^DATABASE_URL=//' -e 's/"//g')"
npm run migration:d1 -- migrate --dry-run
```

メールの重複・JSON の `null` がないこと、件数が、**そのダンプで行ったリハーサルと同じ**であること（2026-10-11 のダンプでは、**合計 14,793 件**）。違えば、先へ進まない。

> 14,793 件（と、照合の 173 項目）は、**2026-10-11 のダンプと、そのリハーサルの値**。別のダンプでは変わる。照合の判定は、移行元と移行先の突き合わせで、決まった数値との比較ではない（項目数も、データがある表の数で変わる）。この件数は、復元の失敗や取り違えに、人が気づくための目印として使う。

**`users` などが 0 件のときは、移行元が空（復元の失敗）。手順 5 に進まない**（空を移しても、照合は「成功」と表示されるため、気づけない）。手順 3 へ戻る。

移行ツールは、**`users` と `books` の両方が 0 件のとき**だけ、自動で止まる（`--dry-run` は警告を出して終了コード 1、`migrate` は移行先を開く前に中断。#755。意図して空を移すときだけ `--allow-empty-source`）。`users` だけが 0 件など、一部だけ欠けている場合は、ツールは止まらない。上の件数の確認（合計 14,793 件との一致）は、必ず目で行う。

## 5. 本番 D1 へ移行する

**本番への書き込みです。** 本番 D1 の名前と ID の両方に加えて、`--confirm-production` が必要（移行ツールのガード）。ID は `app/wrangler.jsonc` のトップレベルの `database_id`（秘密情報ではない）。

```bash
time npm run migration:d1 -- migrate --remote \
  --d1-name mybooklibrary-db --d1-id dd2f0ed7-5d12-4d7d-8722-97765ff4089b \
  --confirm-production mybooklibrary-db --yes
```

- 最後に「照合: すべて成功しました（○ 項目）」が出て、終了コードが 0 であること（2026-10-11 のダンプでは 173 項目。項目数はデータで変わるため、**「すべて成功」と終了コード 0 で判断し**、項目数はリハーサルと比べる目印にする）。
- 失敗したら、**やり直す前に**、出力の表名とエラーコードだけを控える（値は出ない）。途中まで書き込まれている可能性があるため、「ロールバック」の手順で空に戻してから再実行する。

続けて、照合だけをもう一度（読み取りのみ）:

```bash
time npm run migration:d1 -- verify --remote \
  --d1-name mybooklibrary-db --d1-id dd2f0ed7-5d12-4d7d-8722-97765ff4089b \
  --confirm-production mybooklibrary-db
```

## 6. 本番 Worker を最新にする

`main` を `production` ブランチへ反映する（早送り。デプロイコマンドが、D1 のマイグレーションの適用 → デプロイまで行う）。

```bash
git fetch origin
git push origin origin/main:production
```

Cloudflare ダッシュボードの Workers & Pages → `mybooklibrary` → Deployments（または Builds）で、ビルドが成功するのを待つ。そのあと、バージョンを確認する。

```bash
curl https://mybooklibrary.nyproducts.workers.dev/api/version      # PowerShell では、curl.exe と書く（curl は Invoke-WebRequest の別名）
```

`name` が `0.0.0`、`tag` が `0.0.0-<main の先頭 7 文字>` であること（`git rev-parse --short origin/main` と比べる）。`production` ブランチの更新が拒否されたら（早送りでない）、強制はせずに相談する。

## 7. Google ログインのリダイレクト URI を登録する

Google Cloud Console → 本番で使っている OAuth クライアント → 承認済みのリダイレクト URI に追加する。

```
https://mybooklibrary.nyproducts.workers.dev/api/auth/callback/google
```

反映に数分かかることがある。

## 8. 公開前の手動確認（所有者本人）

本番の URL（`https://mybooklibrary.nyproducts.workers.dev`）で、**自分のアカウントで**確認する。データを変更しない操作を中心にする。

| 確認 | 期待 |
| --- | --- |
| トップ・ログイン画面 | 表示される |
| 自分のメールアドレスとパスワードでログイン | できる（パスワードのハッシュを移しているため、以前のパスワードのまま）。再ログインは必要 |
| 本棚・読書状況の一覧 | 移行したデータ（読書状況 65 件など）が見える |
| 本の検索（楽天ブックス）| 結果が出る（初めての本番での確認。**出なければ、`RAKUTEN_ALLOWED_ORIGIN` と楽天のアプリ登録の「許可された Web サイト」を確認**）|
| 管理者の機能（管理者のアカウントで）| 管理者としてログインでき、管理者向けの画面が使える |
| Google ログイン | 本番の `accounts` は 0 件のため、**まだ登録されていない Google アカウント**で新規登録できることを確認する（**既存のメールと同じメールの Google アカウントは、`OAuthAccountNotLinked` になる**。アプリは現在アカウントの自動連携を行わない。AWS のときと同じ挙動）。確認で作ったユーザーは、退会（アカウント削除）で消す |
| 賞別一覧（`/awards`。直木賞・全賞 `awardId=all`） | 作品リストが表示される（件数が多くても、「This page couldn’t load」にならない。#730） |
| ホーム・お気に入り著者の画面を開く | 画面にエラーが出ない。楽天ブックスの 429（アクセス過多）が、ログに出ていない |
| 読書状況を変えたあと、一覧をスクロールする | エラー画面にならない（#734 で直した、Workers のリクエストをまたぐ処理の問題の再発確認）|
| 管理者の画面（ユーザー・問い合わせなど）| メールアドレスがマスクされ、「表示」を押したときだけ全体が出る。監査ログに「管理者: メールアドレスを表示」が残る（#739）|
| `/api/version` | 手順 6 のとおり |

Cron（`check-new-books`、毎日 UTC 00:00）は、公開直後の翌朝（JST 9:00）の自動実行のログで確認する（ダッシュボードの Workers → `mybooklibrary` → Logs）。手動実行はしない。

## 9. 周知

- 公開 URL が `https://mybooklibrary.nyproducts.workers.dev` に変わったこと、**再ログインが必要**なこと（URL＝Cookie のオリジンが変わるため。パスワード・Google 連携は保持される）を、利用者（ユーザー 3 名）とポートフォリオの掲載先に伝える。
- README の「ライブデモ」を更新する（停止中の表記を外し、URL を書く）。これは #626 の範囲。

## 10. 後始末（成功しても、失敗・中止しても、必ず行う）

途中で作業をやめた場合も、このまま実行する。コンテナは `--restart unless-stopped` なので、実データの入った MySQL が、Docker の再起動のたびに戻ってくる。

```bash
docker rm -fv mbl-cutover-mysql
rm -f .env.migration-target
rm -f prisma/scripts/migration/dumps/*.decrypted.sql
unset MIGRATION_SOURCE_DATABASE_URL
ls prisma/scripts/migration/dumps      # .enc と .sha256 だけが残っていること
```

- 暗号化したダンプ（`.enc`）は、**消さずに保管する**（この PC と USB の 2 か所）。移行後の不整合の調査や、AWS 再開（逆 ETL の検証）に使う。
- RDS の手動スナップショット（`mybooklibrary-final-before-destroy-20261008`）は、**削除しない**。AWS 構成の再開が、このスナップショットからの復元を前提にしているため、削除すると再開できない（[停止・再開手順](aws/aws-deploy-guide.md#8-停止再開手順)。#692）。リハーサル用 D1（`mybooklibrary-rehearsal-db`）は、匿名化済み。不要なら `npx wrangler d1 delete mybooklibrary-rehearsal-db`（ID を確認してから）。

## 11. 結果の記録（Issue #691 に書く内容）

値（メール・本文など）は書かない。

| 項目 | 記録 |
| --- | --- |
| 事前確認（重複・JSON の null）| |
| 移行 + 照合の所要時間と結果 | |
| 照合のみの結果 | |
| 本番 Worker のバージョン（`tag`）| |
| 手動確認の結果（上の表）| |
| Google のリダイレクト URI の登録 | |
| 周知した先・日付 | |

## ロールバック

| 状況 | 対応 |
| --- | --- |
| **移行に失敗した（公開前）** | 手順 1 で控えたブックマークへ戻す: `npx wrangler d1 time-travel restore DB --bookmark=<控えた値>`（本番 D1 が、移行前の空の状態に戻る）。または移行ツールの `reset`（`--confirm-production` が必要）で空にする。そのあと、原因を直して手順 5 からやり直す |
| 本番 Worker の不具合（公開後）| `npx wrangler rollback <version-id> -m "<理由>" -y`（[運用](cloudflare-deploy.md)）。D1 のデータは戻らない |
| 移行データの不整合（**公開後**に判明）| **再 ETL による全置換はしない**（公開後の登録が失われる）。計画書 §9-3 の、前進修正の手順に従う |
| D1 のデータ破損・誤更新（**公開前**）| D1 Time Travel で時点復元（保持期間: 有料プランは 30 日）|
| D1 のデータ破損・誤更新（**公開後**）| 時点復元だけでは、公開後の正当な登録・更新も失われる。書き込みを止め、現状をエクスポートして保全し、計画書 §9-3 の「前進修正」「行単位の差分再適用」の手順に従う |

**公開判断の中止条件**: 照合の不合格、ログイン不可、エラー率の恒常的な上昇、楽天 API の失敗が直らない。その場合は、周知をせずに原因を調べる。

## 公開後の監視（最初の 1 週間）

毎日、Cloudflare ダッシュボードで、Workers のエラー率・CPU 時間、D1 の使用量（読み書きの行数、容量）を確認する。

あわせて、**リクエストをまたぐ Promise の例外**（Workers のログに `hung` や、別のリクエストの I/O を使ったという内容の例外・警告が出る問題。#734）が出ていないかを見る。ステージングのデモでは、対策（リクエストごとの Prisma クライアント）の後、15 回の連続アクセスで 0 件だったが、**原因となった Promise は特定できていない**。本番で出た場合は、日時と URL（個人情報を含めない）を #734 に記録して相談する。
