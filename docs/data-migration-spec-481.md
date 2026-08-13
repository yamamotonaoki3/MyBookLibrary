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
| `20260715120000_add_book_created_by_user_id` | `books`に`created_by_user_id`（NULL許容）と外部キー制約を追加 | 既存`books`行は全て`created_by_user_id = NULL`（＝手動登録ではない）として扱われる。実態と一致（既存書籍は全て楽天API等からの自動登録） |
| `20260726120000_add_favorite_author_author_id_index` | `favorite_authors(author_id)`に単体インデックスを追加 | データ変更なし。パフォーマンス目的のインデックスのみ |
| `20260801064609_add_audit_log` | 新規`audit_logs`テーブルを作成 | 新規テーブルで移行元データが存在しない（空で開始） |

**UNIQUE制約違反の可能性**: 新規に追加されるUNIQUE制約は無い（`follows`テーブルの`(follower_id, following_id)`複合UNIQUEは新規テーブルなので違反しようがない）。既存テーブルへの列追加はすべてNULL許容またはデフォルト値付きのため、`prisma migrate deploy`を本番dumpのリストア後にそのまま実行するだけで、データ損失・制約違反なく完了する。

この結論により、Issue #481で懸念されていた「新スキーマへのETL変換」は不要と判断する。カスタム変換スクリプトを新たに書く必要はなく、既存の`prisma migrate deploy`（本番デプロイで通常使っているコマンドと同一）をAiven上の復元済みDBに対して実行するだけでよい。

## 2. 旧テーブル／列ごとの移行・変換・補完・退避・破棄

現行スキーマは本番スキーマの**上位互換（スーパーセット）**であるため、全17テーブル・全列がそのまま「移行」対象であり、変換・破棄が必要な列は存在しない。

| 分類 | 対象 |
|---|---|
| **移行**（そのままコピー） | 本番に存在する全16アプリケーションテーブル・全列（`users`, `accounts`, `sessions`, `verification_tokens`, `authors`, `books`, `awards`, `award_entries`, `favorite_authors`, `reading_statuses`, `reviews`, `likes`, `reports`, `notifications`, `user_libraries`, `contact_inquiries`） |
| **補完**（migrate deployが自動で行う） | `users.secret_word_fail_count`（`0`で補完）。他の新規列（`secret_word_hash`, `secret_word_locked_until`, `notifications.actor_id`, `books.created_by_user_id`）は`NULL`で補完（後述3章） |
| **新規作成**（データなしで開始） | `follows`, `audit_logs`（移行元に対応するデータが存在しないため、空テーブルとして作成） |
| **変換** | 無し（型変更・列名変更を伴うmigrationは6件の中に存在しない） |
| **退避・破棄** | 無し（本番の全データを移行対象とし、意図的に除外するテーブル・列は無い） |

`_prisma_migrations`テーブル自体は移行先で`prisma migrate deploy`が18件分を新たに記録し直す形になるため、dumpに含める場合でも移行先の実行結果（18件適用済み）が正となる。

## 3. 新規必須列の補完値と根拠

新規追加列のうちNOT NULL制約を持つのは`users.secret_word_fail_count`のみで、migration自体が`DEFAULT 0`を指定しているため、追加の補完作業は不要。

| 列 | NULL許容 | デフォルト/補完値 | 根拠 |
|---|---|---|---|
| `users.secret_word_hash` | 許容 | `NULL` | 秘密の言葉は新規オプション機能（Issue #487）。既存ユーザーは未設定として扱い、設定を強制しない |
| `users.secret_word_fail_count` | 不可 | `0`（migration既定） | 失敗回数カウンタは0から開始するのが自然 |
| `users.secret_word_locked_until` | 許容 | `NULL` | 未ロック状態として扱う |
| `notifications.actor_id` | 許容 | `NULL` | 既存の通知はフォロー機能導入前に作成されたものであり、「行為者」の概念自体が存在しなかったため、システム通知（actor無し）として扱うのが実態と一致する |
| `books.created_by_user_id` | 許容 | `NULL` | 既存の全書籍は楽天ブックスAPI／NDL経由の自動登録であり、手動登録者は存在しない（`books.source`列の実態が`rakuten`等であることと整合） |

## 4. UNIQUE制約違反候補の抽出と解消規則

上記の通り、6件のmigrationは新規UNIQUE制約を既存データが入ったテーブルに追加するものを含まないため、**移行時にUNIQUE制約違反が発生するケースは無い**。

念のため、移行済み12件のmigrationの範囲で既に存在するUNIQUE制約（`users.email`, `books.isbn`, `award_entries(book_id, award_id, year)`, `favorite_authors(user_id, author_id)`, `reading_statuses(user_id, book_id)`, `likes(user_id, review_id)`, `reports(user_id, review_id)`, `notifications(user_id, type, book_isbn)`, `user_libraries(user_id, systemid, libkey)`）は、dump restoreによってデータの複製・変更が一切発生しないため、本番で既に整合しているものはそのまま整合を保つ。**dump restore後の追加検証として、リストア直後に全UNIQUE制約カラムの重複有無をSELECT COUNT/GROUP BYで確認する手順を#480（移行リハーサル）で実施することを推奨する**（本Issueでは仕様の確定のみ）。

## 5. 外部キーを考慮した投入順

ETL変換を行わずdump restoreをそのまま使うため、独自の投入順設計は不要。`mysqldump`（または同等ツール）による論理dumpは、デフォルトで以下を保証する。

- テーブル作成順・データ投入順は、dumpファイル内の記述順（通常はスキーマ定義順）に従う
- `mysqldump`は既定で外部キーチェックを一時的に無効化してデータを投入する（`SET FOREIGN_KEY_CHECKS=0`をdumpファイルに含める、または`--disable-keys`相当のオプションを使う）ため、投入順によるFK違反は発生しない
- 全データ投入後に`prisma migrate deploy`で新規FK制約（`follows`, `audit_logs`, `notifications.actor_id`, `books.created_by_user_id`）を追加するため、この時点で違反があれば`migrate deploy`自体が失敗し検知できる（ただし3章の分析の通り、新規FK列は全て既存行でNULLになるため違反は発生しない）

## 6. 既存IDの維持・関連レコードの保持

`mysqldump`によるフルdump（`--single-transaction`使用、スキーマ+データ）を用いることで、以下が自動的に保証される。

- 全テーブルの主キー値（`id`）はそのまま維持される（AUTO_INCREMENTの次値も`dump`に含まれるため、移行後の新規INSERTでID衝突は起きない）
- 外部キーで参照される関連レコード（`books.author_id → authors.id`等）は、ID値がそのまま維持されるため、リレーションが失われることはない
- Issue #482で確認した各テーブルの`AUTO_INCREMENT`次値（例: `users`は17、`books`は376）を移行後に照合し、期待通りの値になっていることを#480のリハーサルで確認する

## 7. `users` / `accounts` / `sessions` / bcryptハッシュ / Google OAuth情報の扱い

これらは**スキーマ変更が一切ない**テーブル（本番の12件のmigration時点で完成しており、未反映6件の対象外）であるため、dump restoreでそのまま移行する。

| 対象 | 扱い |
|---|---|
| `users.password`（bcryptハッシュ） | そのままコピー。ハッシュの再計算・移行時のパスワードリセットは不要（bcryptハッシュはアルゴリズム・ソルトを含む自己完結形式のため、DB移行の影響を受けない） |
| `accounts`（NextAuth、Google OAuthのトークン情報） | そのままコピー。`access_token`/`refresh_token`等は`@db.Text`のまま。Google側のクライアントID・シークレット自体はDBに保存されないため（SSM/環境変数側で管理）、移行後もVercel側で同じGoogle OAuthアプリの認証情報を設定すれば動作する（別途Issue #477 Vercel Preview環境構築で設定） |
| `sessions` | そのままコピー。ただし本番の`sessions`件数は現時点で0件（Issue #482調査結果）のため、実質的に移行対象データはない。JWTベースでないDBセッション運用の場合、移行タイミングで既存セッションは失効する可能性があるが、影響を受けるアクティブセッションは無い |
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

`_prisma_migrations`テーブルは移行先で`prisma migrate deploy`実行時に作り直されるため、dumpに含めるかどうかは移行手順（#478）側の判断に委ねるが、含めても実害はない（`migrate deploy`は適用済みmigrationをスキップするのみ）。

## 受け入れ基準チェック

- [x] 全旧テーブル／列の扱いに未決定項目がない（2〜8章で全17テーブルを網羅）
- [x] 意図的に破棄・補完されるデータを説明できる（破棄なし。補完は3章の新規列のみで、いずれもNULL/デフォルト値による自然な補完）
- [x] ID、認証、外部キーを保持する設計になっている（6〜7章）

## 次のIssueへの申し送り

- **#479（Aiven検証DB構築）**: 作成するAiven MySQLインスタンスは、タイムゾーンUTC・文字コードutf8mb4をサーバーデフォルトとして設定すること。テーブル単位の照合順序（`utf8mb4_unicode_ci`）はdumpの`CREATE TABLE`文で指定されるため、サーバーデフォルトが異なっていても個々のテーブルには影響しない
- **#478（移行・照合ツール）**: 本仕様書の結論（ETL不要、dump restore + `prisma migrate deploy`のみ）を前提にツールを設計してよい。照合ツールでは、本仕様書6章のAUTO_INCREMENT次値・テーブル別件数（`docs/schema-diff-482.md`記載）を期待値として使う
- **#480（移行リハーサル）**: 4章で触れたUNIQUE制約の重複有無の確認、6章のAUTO_INCREMENT次値の確認をリハーサル手順に含める
