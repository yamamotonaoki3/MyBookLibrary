# 旧本番DBから現行スキーマへのデータ変換仕様（Issue #481）

Issue #482の棚卸し結果（`docs/schema-diff-482.md`）を前提に、本番データをAiven Free（新環境）へ移行する際のデータ変換仕様を確定する。

## 1. 移行方式の選択

**「dump restore後に未適用migrationを適用する」方式を採用する。ETL変換投入は不要。**

### 根拠

`docs/schema-diff-482.md`で確認した通り、本番と現行スキーマの差分は**6件のmigrationすべてが追加のみ**で構成されている。各migrationの実際のSQL（`app/prisma/migrations/`）を確認した結果、以下の性質を持つことを確認した。

| migration | 内容 | 既存データへの影響 |
|---|---|---|
| `20260711130000_add_secret_word_to_user` | `users`に`secret_word_hash`（NULL許容）, `secret_word_fail_count`（`DEFAULT 0`）, `secret_word_locked_until`（NULL許容）を追加 | 既存行は自動的に`NULL`/`0`で埋まる。NOT NULL列でデフォルト値のないものはない |
| `20260712211750_add_follow` | `notifications`に`actor_id`（NULL許容）を追加。新規`follows`テーブルを作成 | 既存`notifications`行は`actor_id = NULL`になる。`follows`は新規テーブルで移行元データが存在しない（空で開始） |
| `20260714135800_add_notification_actor_relation` | `notifications.actor_id`への外部キー制約を追加 | `actor_id`は全行NULLのため、FK制約違反は発生しない |
| `20260715120000_add_book_created_by_user_id` | `books`に`created_by_user_id`（NULL許容）と外部キー制約を追加 | `source='rakuten'`等の自動登録本は`created_by_user_id = NULL`のままでよい。`source='manual'`の書籍がある場合は所有者バックフィルが必要（3章参照） |
| `20260726120000_add_favorite_author_author_id_index` | `favorite_authors(author_id)`に単体インデックスを追加 | データ変更なし。パフォーマンス目的のインデックスのみ |
| `20260801064609_add_audit_log` | 新規`audit_logs`テーブルを作成 | 新規テーブルで移行元データが存在しない（空で開始） |

**UNIQUE制約違反の可能性**: 新規に追加されるUNIQUE制約は無い（`follows`テーブルの`(follower_id, following_id)`複合UNIQUEは新規テーブルなので違反しようがない）。既存テーブルへの列追加はすべてNULL許容またはデフォルト値付きのため、`prisma migrate deploy`を本番dumpのリストア後にそのまま実行するだけで、データ損失・制約違反なく完了する。

この結論により、Issue #481で懸念されていた「新スキーマへのETL変換」は不要と判断する。カスタム変換スクリプトを新たに書く必要はなく、既存の`prisma migrate deploy`（本番デプロイで通常使っているコマンドと同一）をAiven上の復元済みDBに対して実行するだけでよい。**ただし、これは無条件の一手順ではない。** 3章で述べる通り、`prisma migrate deploy`実行後に`books.source='manual'`の存在確認を行い、1件以上あれば`backfill-book-owner.ts`によるバックフィル（および未解決分の個別確認）を追加で実施することが、この方式の一部として必須である。

## 2. 旧テーブル／列ごとの移行・変換・補完・退避・破棄

現行スキーマは本番スキーマの**上位互換（スーパーセット）**であるため、全17テーブル・全列がそのまま「移行」対象であり、変換・破棄が必要な列は存在しない。

| 分類 | 対象 |
|---|---|
| **移行**（そのままコピー） | 本番に存在する全16アプリケーションテーブル・全列（`users`, `accounts`, `sessions`, `verification_tokens`, `authors`, `books`, `awards`, `award_entries`, `favorite_authors`, `reading_statuses`, `reviews`, `likes`, `reports`, `notifications`, `user_libraries`, `contact_inquiries`） |
| **補完**（migrate deployが自動で行う） | `users.secret_word_fail_count`（`0`で補完）。他の新規列（`secret_word_hash`, `secret_word_locked_until`, `notifications.actor_id`, `books.created_by_user_id`）は`NULL`で補完（後述3章） |
| **新規作成**（データなしで開始） | `follows`, `audit_logs`（移行元に対応するデータが存在しないため、空テーブルとして作成） |
| **変換** | 無し（型変更・列名変更を伴うmigrationは6件の中に存在しない） |
| **退避・破棄** | 無し（本番の全データを移行対象とし、意図的に除外するテーブル・列は無い） |

**`_prisma_migrations`テーブルは、本番の12件分のレコードをdumpに含めてそのまま復元すること（必須）。** 空の状態で`prisma migrate deploy`を実行すると、Prismaは「スキーマは12件分すでに存在するが適用履歴が0件」という矛盾した状態を検知できず、`init`から順に適用しようとして`CREATE TABLE`の重複エラー等で失敗する。`_prisma_migrations`を12件分そのまま復元してから`prisma migrate deploy`を実行することで、Prismaは「12件は適用済み・6件が未適用」と正しく認識し、6件のみを適用する。（代替手段として、空の状態から`prisma migrate resolve --applied <migration名>`を12件分実行してベースライン化する方法もあるが、dump復元の方が確実で手数が少ない）

## 3. 新規必須列の補完値と根拠

新規追加列のうちNOT NULL制約を持つのは`users.secret_word_fail_count`のみで、migration自体が`DEFAULT 0`を指定しているため、追加の補完作業は不要。

| 列 | NULL許容 | デフォルト/補完値 | 根拠 |
|---|---|---|---|
| `users.secret_word_hash` | 許容 | `NULL` | 秘密の言葉は新規オプション機能（Issue #487）。既存ユーザーは未設定として扱い、設定を強制しない |
| `users.secret_word_fail_count` | 不可 | `0`（migration既定） | 失敗回数カウンタは0から開始するのが自然 |
| `users.secret_word_locked_until` | 許容 | `NULL` | 未ロック状態として扱う |
| `notifications.actor_id` | 許容 | `NULL` | 既存の通知はフォロー機能導入前に作成されたものであり、「行為者」の概念自体が存在しなかったため、システム通知（actor無し）として扱うのが実態と一致する |
| `books.created_by_user_id` | 条件付き（下記参照） | `NULL`（自動登録の場合）／要バックフィル（手動登録の場合） | 下記参照 |

### `books.created_by_user_id`の補完（手動登録本の扱い）

`created_by_user_id`列は`books.source = 'manual'`（管理者・ユーザーによる手動登録本）の所有者を記録するために追加された。手動登録機能自体は、未反映の6件より前のmigration（`20260620052155_add_book_source`、本番デプロイ済み12件に含まれる）で導入済みのため、**本番稼働中に`source='manual'`の書籍が作成されている可能性がある**。

- **本Issue（#481）作成時点でのAudit結果**: 本番`books`テーブルを`source`列でGROUP BYしたところ、374件全てが`source='rakuten'`であり、`manual`の書籍は0件だった（2026-08-13時点）。
- **ただし、この結果は移行実施時点で再確認が必須**。#482監査以降も本番は稼働を続けており、手動登録本が新たに作成される可能性がある。
- 移行実施時（dump取得と同じスナップショットのタイミング）に`SELECT source, COUNT(*) FROM books GROUP BY source;`を再実行し、`manual`の件数を確認する。**0件であれば以下のバックフィルは不要。1件以上あれば以下を実施する。**
- `manual`の書籍が1件以上存在する場合、`created_by_user_id`をNULLのまま放置してはならない。既存の`app/prisma/scripts/backfill-book-owner.ts`（「その本への最古の`ReadingStatus`のユーザーを登録者とみなす」ヒューリスティックで補完する、この課題向けに用意されたスクリプト）を移行後・`prisma migrate deploy`実行後に対象DBに対して実行し、所有者を補完する。これを怠ると、`app/src/app/api/books/[id]/route.ts`のPATCH/DELETE権限チェック（`createdByUserId`と一致するユーザーのみ許可）により、本来の登録者が自分の手動登録本を編集・削除できなくなる。
  - **既知の限界（未補完のケース）**: このスクリプトは対象書籍に`ReadingStatus`が1件も無い場合（`if (!earliestStatus) continue`）は何もせず、`created_by_user_id`はNULLのまま残る。これは、本アプリの仕様上「読書ステータスを`未読`に戻すと当該`ReadingStatus`行が削除される」ため、登録直後に未読へ戻された手動登録本などで起こりうる。スクリプト実行後、`SELECT id, title FROM books WHERE source = 'manual' AND created_by_user_id IS NULL;`で未補完件数を確認し、1件でも残っていれば、当該書籍を作成した管理者・ユーザーに個別確認のうえ`created_by_user_id`を手動で設定するか、所有者不明本として運用上扱う方針を#480実施前に決めておくこと。
  - **既知の限界（誤った所有者を推定するリスク）**: このスクリプトは「その本への最古の`ReadingStatus`のユーザー」を登録者とみなすヒューリスティックであり、**実際の登録者と一致する保証はない**。例えば、登録者自身が一度ステータスを`未読`に戻して`ReadingStatus`行が削除された後、別のユーザーがその本にステータスを付けていた場合、スクリプトはその別ユーザーを登録者と誤認する。この誤認識のまま`created_by_user_id`が設定されると、`app/src/app/api/books/[id]/route.ts`のPATCH/DELETE権限チェックにより、**本来の登録者ではない第三者に編集・削除権限を誤って付与してしまう**。したがって、スクリプト実行は機械的な一括処理として済ませず、**実行結果（対象書籍と推定された`userId`の対応表）を人手で確認し、明らかに不自然な推定（本の内容と無関係なユーザーへの割当等）がないかをレビューしてから確定させること**。件数が少ない場合（本番は現時点で対象0件）は、全件を目視確認できる規模である。

## 4. UNIQUE制約違反候補の抽出と解消規則

上記の通り、6件のmigrationは新規UNIQUE制約を既存データが入ったテーブルに追加するものを含まないため、**移行時にUNIQUE制約違反が発生するケースは無い**。

念のため、移行済み12件のmigrationの範囲で既に存在するUNIQUE制約（`users.email`, `books.isbn`, `awards.name`, `award_entries(book_id, award_id, year)`, `favorite_authors(user_id, author_id)`, `reading_statuses(user_id, book_id)`, `likes(user_id, review_id)`, `reports(user_id, review_id)`, `notifications(user_id, type, book_isbn)`, `user_libraries(user_id, systemid, libkey)`, `accounts(provider, provider_account_id)`, `sessions.session_token`, `verification_tokens.token`, `verification_tokens(identifier, token)`）は、dump restoreによってデータの複製・変更が一切発生しないため、本番で既に整合しているものはそのまま整合を保つ。**dump restore後の追加検証として、リストア直後に全UNIQUE制約カラムの重複有無をSELECT COUNT/GROUP BYで確認する手順を#480（移行リハーサル）で実施することを推奨する**（本Issueでは仕様の確定のみ）。

**注意（NULLを含む列のUNIQUE制約）**: `books.isbn`・`notifications.book_isbn`はNULL許容列を含む制約であり、MySQLのUNIQUE制約は「制約を構成する列のいずれかがNULLの行同士」を重複とはみなさない（NULL同士は「異なる値」として扱われる）。そのため、単純に`GROUP BY <列> HAVING COUNT(*) > 1`で重複検査を行うと、ISBN未設定の手動登録本が複数あるだけで誤って重複と判定してしまう。#480での検証クエリは、該当列に`WHERE isbn IS NOT NULL`のようなフィルタを必ず入れること。

## 5. 外部キーを考慮した投入順

ETL変換を行わずdump restoreをそのまま使うため、独自の投入順設計は不要。`mysqldump`（または同等ツール）による論理dumpは、デフォルトで以下を保証する。

- テーブル作成順・データ投入順は、dumpファイル内の記述順（通常はスキーマ定義順）に従う
- `mysqldump`は既定でdumpファイルの先頭に`SET FOREIGN_KEY_CHECKS=0`を出力し、外部キー制約チェックを一時的に無効化した状態でデータを投入する。**`--disable-keys`は非ユニークインデックスの再構築を遅延させるだけのオプションであり、InnoDBの外部キー制約チェックとは無関係のため、これをFK対策の代替として扱わないこと。** `accounts`が親テーブル`users`より先に投入される場合など、テーブル間の投入順が定義順と食い違うケースがあっても、`FOREIGN_KEY_CHECKS=0`が効いている限りFK違反エラーは発生しない
- 全データ投入後に`prisma migrate deploy`で新規FK制約（`follows`, `audit_logs`, `notifications.actor_id`, `books.created_by_user_id`）を追加するため、この時点で違反があれば`migrate deploy`自体が失敗し検知できる（ただし3章の分析の通り、新規FK列は全て既存行でNULLになるため違反は発生しない）

## 6. 既存IDの維持・関連レコードの保持

`mysqldump`によるフルdump（`--single-transaction`使用、スキーマ+データ）を用いることで、以下が自動的に保証される。

- 全テーブルの主キー値（`id`）はそのまま維持される（AUTO_INCREMENTの次値も`dump`に含まれるため、移行後の新規INSERTでID衝突は起きない）
- 外部キーで参照される関連レコード（`books.author_id → authors.id`等）は、ID値がそのまま維持されるため、リレーションが失われることはない
- **本番の件数・`AUTO_INCREMENT`次値は、実際の移行（dump取得）時点で改めて取得し、その値を期待値として照合すること。** Issue #482調査時点の値（例: `users`は17、`books`は376）はあくまで2026-08-13時点のスナップショットであり、移行実施日までの間に本番データは変化しうる（ユーザー登録・レビュー投稿等は本番運用中も続く）。古い値をハードコードした期待値と照合すると、正当な移行を誤って不合格にしたり、逆に移行後に増えたはずのレコードの欠落を見逃したりする。
- **件数の取得には`information_schema.tables.TABLE_ROWS`ではなく、`COUNT(*)`による実測値を使うこと**（`docs/schema-diff-482.md`で述べた通り`TABLE_ROWS`はInnoDBの推定値であり、照合の基準にするには不正確）。
- **件数取得は、dump取得と同じスナップショット（同一トランザクション、または短時間のメンテナンス停止中）で行うこと。** dumpとは別タイミング・別トランザクションで`COUNT(*)`を取得すると、その間に発生した書き込みの分だけ値がずれ、正しいdumpを誤って不合格判定する可能性がある。`mysqldump --single-transaction`を使う場合は、同じトランザクション開始時刻に整合する形で件数を記録する（例: dumpコマンドと同一セッション内、またはメンテナンス時間中でアプリを停止した状態での取得）。
- **本番切替（#475）時の最終dumpは、必ず書き込みを凍結した状態（メンテナンスモードでアプリを停止する等）で取得すること。** `mysqldump --single-transaction`は取得したデータの一貫性（読み取りスナップショット）を保証するだけで、dump取得後に発生した新規書き込みを後から拾い上げる仕組み（CDCや差分再生）は本仕様には含まれていない。そのため、書き込みを止めないままdumpを取得すると、dump完了後から実際のトラフィック切替までの間に本番へ書き込まれたデータは新環境に反映されず消失する。#480のリハーサル（本番相当データを使うがトラフィックは実本番ではない）ではメンテナンス停止は必須ではないが、#475の本番切替では「dump取得開始 → 新環境への投入・検証 → トラフィック切替」の全期間、本番への書き込みを止めることを必須条件とする。
- **件数・AUTO_INCREMENT期待値は、別クライアントから`COUNT(*)`を打つのではなく、dumpファイル自体から導出すること。** `mysqldump --single-transaction`は専用のコネクション・トランザクション上でスナップショットを取得するため、別セッションから同時に`COUNT(*)`を実行しても、MVCCの都合上まったく同じスナップショットを参照できる保証はない（また`AUTO_INCREMENT`の値自体はトランザクション管理下にないメタデータであり、なおさら一致を保証できない）。本番切替（#475、書き込み凍結あり）では両者が一致するため実務上は問題にならないが、#480のリハーサル等で書き込みを止めずに実施する場合は、dumpファイル中の`INSERT INTO`文の行数や、dumpファイルの`CREATE TABLE ... AUTO_INCREMENT=<値>`定義から期待値を導出し、別クエリの実測値と比較しないこと。

## 7. `users` / `accounts` / `sessions` / bcryptハッシュ / Google OAuth情報の扱い

これらは**スキーマ変更が一切ない**テーブル（本番の12件のmigration時点で完成しており、未反映6件の対象外）であるため、dump restoreでそのまま移行する。

| 対象 | 扱い |
|---|---|
| `users.password`（bcryptハッシュ） | そのままコピー。ハッシュの再計算・移行時のパスワードリセットは不要（bcryptハッシュはアルゴリズム・ソルトを含む自己完結形式のため、DB移行の影響を受けない） |
| `accounts`（NextAuth、Google OAuthのトークン情報） | そのままコピー。`access_token`/`refresh_token`等は`@db.Text`のまま。ただし**Google OAuthクライアントID・シークレットをVercel側の環境変数へ同じ値で設定するだけでは不十分**。Googleは認可リクエストごとに完全一致するコールバックURI（`https://<Vercelのホスト名>/api/auth/callback/google`）が許可リストに登録されていることを要求するため、**Google Cloud ConsoleのOAuthクライアント設定に、新しいVercelホスト名のコールバックURIを追加登録することを移行の必須手順とする**（未実施の場合、Googleログインが`redirect_uri_mismatch`エラーで失敗する）。この設定変更自体はGoogle Cloud Console側の作業であり、DBデータには影響しないが、#477（Vercel Preview環境構築）または#475（本番切替）の手順として明記すること |
| `sessions` | そのままコピー（テーブル自体は空でよい）。**ただし`sessions`テーブルが0件なのは、アクティブなログインが無いことを意味しない**。`app/src/auth.config.ts:10`・`app/src/auth.ts:93`で`session: { strategy: "jwt" }`が指定されており、本アプリはDBセッションではなくブラウザ側のJWT Cookieでセッションを管理する（`sessions`テーブルはNextAuthのAdapter要件として存在するのみで実質未使用）。**公開ホスト名がCloudFrontのドメインからVercelのドメインへ変わる本移行では、`AUTH_SECRET`を維持するかどうかに関わらず、ブラウザはホストが変わった時点で旧ドメイン用のCookieを新ドメインへ送信しない（Cookieはホストスコープのため）。したがって、切替後は全ユーザーが再ログイン必須になることを前提とする。** `AUTH_SECRET`の引き継ぎは「ホスト名を変えない場合にセッション継続に必要」という条件付きの話であり、本移行のようにホスト自体が変わるケースではセッション継続の代替手段にはならない。この前提は#475（本番切替）の手順・利用者への告知に反映すること |
| `verification_tokens` | そのままコピー（現時点で0件） |

## 8. 日付・Boolean・JSON・日本語・絵文字・改行の変換規則

移行元・移行先ともに**MySQL 8系（本番: 8.4.8 / Aiven Free: MySQL 8系）**であり、異種DBMS間の変換（例: MySQL→PostgreSQL）を伴わない。dumpファイルの文字コード指定を正しく行えば、バイト単位での変換は発生しない。

| 種別 | 規則 |
|---|---|
| 日付・時刻（`DATETIME(3)`, `DATE`） | タイムゾーンは本番・現行とも`UTC`固定（Issue #482で確認済み）。dump/restoreともに変換せずそのままコピーする。Aiven Free側のグローバルタイムゾーンもUTCに設定することを#479（Aiven検証DB構築）で確認する |
| Boolean（`TINYINT(1)`） | MySQL内での型変更を伴わないためそのまま保持 |
| JSON（`audit_logs.detail`） | 新規テーブルのため移行対象データなし。Aiven Free側もMySQL JSON型をサポートするため、移行後の運用に影響なし |
| 日本語・絵文字（`utf8mb4`） | `mysqldump`実行時に`--default-character-set=utf8mb4`を明示指定する。テーブル照合順序は`utf8mb4_unicode_ci`（Issue #482で確認済み）のため、dumpの`CREATE TABLE`文にこの指定が含まれることを確認し、Aiven Free側のテーブルも同じ照合順序で作成されるようにする（サーバーデフォルトの`utf8mb4_0900_ai_ci`に任せない） |
| 改行（`\n`, `\r\n`） | `TEXT`/`VARCHAR`カラム内のバイト列としてそのまま保持され、`utf8mb4`変換の対象外 |

## 9. 移行対象外データ

現時点で、意図的に除外するテーブル・列・データは無い。本番の全データ（ユーザー・書籍・レビュー・通知・お気に入り著者・図書館登録・問い合わせ等）を移行対象とする。

`_prisma_migrations`テーブルは、2章で述べた通り**dumpに必ず含め、12件のレコードをそのまま復元すること**。これを省略すると`prisma migrate deploy`が失敗する（詳細は2章）。移行手順（#478）側で「dumpに含めるかどうかを選べる」余地はない。

## 受け入れ基準チェック

- [x] 全旧テーブル／列の扱いに未決定項目がない（2〜8章で全17テーブルを網羅）
- [x] 意図的に破棄・補完されるデータを説明できる（破棄なし。補完は3章の新規列のみで、いずれもNULL/デフォルト値による自然な補完）
- [x] ID、認証、外部キーを保持する設計になっている（6〜7章）

## 次のIssueへの申し送り

- **#479（Aiven検証DB構築）**: 作成するAiven MySQLインスタンスは、タイムゾーンUTC・文字コードutf8mb4をサーバーデフォルトとして設定すること。テーブル単位の照合順序（`utf8mb4_unicode_ci`）はdumpの`CREATE TABLE`文で指定されるため、サーバーデフォルトが異なっていても個々のテーブルには影響しない
- **#478（移行・照合ツール）**: 本仕様書の結論（ETL不要、dump restore + `prisma migrate deploy`のみ）を前提にツールを設計してよい。**照合ツールの期待値には`docs/schema-diff-482.md`記載の値（2026-08-13時点のスナップショット）を使ってはならない。** 6章で述べた通り、照合は必ずdump取得と同一スナップショットで`COUNT(*)`・`AUTO_INCREMENT`を都度取得し、その値を期待値として使うこと。**ただし、`_prisma_migrations`・`follows`・`audit_logs`の3テーブルは単純な「移行元件数＝移行先件数」の比較対象から除外すること。** `_prisma_migrations`は`prisma migrate deploy`実行により移行元の12件から移行先では18件に増える（差分の6件は新たに適用されたmigration履歴であり、データ欠落ではない）。`follows`・`audit_logs`は移行元に対応するデータが存在しない新規テーブルのため、移行元件数という概念自体が無い（移行先で0件のまま、または移行後の新規運用で増えていくのが正しい状態）。この3テーブルについては、他の14テーブルとは別の期待値定義（`_prisma_migrations`は18件固定、`follows`/`audit_logs`は「存在すればよく、件数比較は不要」）を#478の実装に反映すること
- **#480（移行リハーサル）**: 4章で触れたUNIQUE制約の重複有無の確認、6章のAUTO_INCREMENT次値の確認をリハーサル手順に含める
