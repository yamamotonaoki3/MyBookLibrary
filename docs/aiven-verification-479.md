# Aiven MySQL Free 検証環境の構築結果（Issue #479）

Vercel Hobby + Aiven Freeへの移行（親Issue #473）に向けて、本番データを触る前にAiven MySQL Free上で現行のPrismaスキーマ・接続設定が問題なく動作するかを検証した。本Issueは**空のAiven DBに対する疎通確認**のみを対象とし、本番データの投入は行っていない（データ移行は#481で確定した仕様に基づき#478/#480で実施）。

## 1. Aivenサービスの構成

| 項目 | 内容 |
|---|---|
| プラン | Free（1 CPU / 1GB RAM / 1GB storage） |
| MySQLバージョン | 8.4.8（本番RDS: Issue #482で確認済みの8.4.8と完全一致） |
| バックアップ | 自動有効。トランザクションログと合わせてPoint-in-Time Recoveryに対応。バックアップ先ロケーション: `do-blr1` |
| メンテナンスウィンドウ | 毎週月曜 07:29:39 UTC以降 |
| max_connections | 76（DB上で`SHOW VARIABLES LIKE 'max_connections'`にて実測） |
| ストレージ使用率 | スキーマ構築直後（データはほぼ0件）の時点で**約30%（1GB中約300MB）**を使用。実データがほぼ無い状態でこの使用率であることから、バックアップ・トランザクションログ等の基盤オーバーヘッドが一定量を占めると推測される。Issue #482で確認した本番の実データ量（約768KB）に対し、Aiven Free側の実質的な空き容量は単純な「1GB - 768KB」より少なくなる可能性がある点を、今後の容量計画（#480等）で考慮すること |
| 自動停止（アイドル時停止）条件 | 今回確認したAivenコンソールの画面（Service plan usage / Backups and forking / Maintenance）では明示的な記載を確認できなかった。Free プランでの挙動は今後の作業で改めて確認する |

## 2. 接続設定

- 接続文字列は`app/.env.aiven-staging`（gitignore対象）で管理。フォーマットは`app/.env.aiven-staging.example`を参照。
- TLS: Prisma公式ドキュメント（MySQLコネクタ）で確認した`sslaccept=strict`と`sslcert=<CA証明書のパス>`を使用。AivenからダウンロードしたCA証明書を`app/certs/aiven-ca.pem`に保存（`*.pem`は`.gitignore`で除外済みのため誤コミットの心配はない）。
- 接続プール: `connection_limit=1`・`pool_timeout=10`をクエリパラメータで指定（Prisma 6系ではURLクエリパラメータとして有効。Prisma 7以降はdriver adapter側の設定に移行予定である点に注意、と公式ドキュメントに明記あり）。

## 3. 重要な発見：`sql_require_primary_key`

**Aiven MySQLはデフォルトで、主キーを持たないテーブルの作成を拒否する設定（`mysql.sql_require_primary_key`）が有効になっている。**

現行スキーマの`verification_tokens`テーブル（NextAuth標準テーブル、複合UNIQUE制約のみで主キーを持たない設計）を含むmigration（`20260609153743_add_auth_fields`）が、この設定によりエラー（MySQLエラーコード3750、Prisma側エラーコードP3018）で失敗した。

**対応**: Aivenコンソールの「Advanced configuration」から`mysql.sql_require_primary_key`を無効化することで解決した。Aiven公式ドキュメントでも「外部アプリケーションが主キー無しのテーブルを作成する場合はこの設定を無効化し、作成後に安全のため再度有効化することが推奨される」とされている。

**今後のIssueへの申し送り**: #480（移行リハーサル）・#475（本番切替）で新しくAiven環境を用意する場合も、`prisma migrate deploy`実行前に必ずこの設定を無効化しておくこと。既存の`verification_tokens`テーブルの設計（主キー無し）自体は本番スキーマと変わらないため、アプリケーションコード側の変更は不要。

## 4. 検証結果

### migration適用

`sql_require_primary_key`無効化後、`prisma migrate reset --force --skip-seed`でDBをクリーンな状態にしてから、18件全てのmigrationを最初から適用した（安全確認: 対象はこのIssue専用に新規作成した検証用DBであり、本番・開発データは一切含まれていなかったため、破壊的操作の前にユーザーへ明示確認のうえ実施した）。

```
Database reset successful
（18件のmigration全て Applying migration `...` で成功）
```

`prisma migrate status`で「Database schema is up to date!」・ドリフト無しを確認。テーブル数は19件（アプリケーションテーブル18 + `_prisma_migrations`）で、`app/prisma/schema.prisma`の全モデルと過不足なく一致することを`information_schema.tables`から確認した。

### CRUD・トランザクション検証

`app/prisma/scripts/verify-aiven-connection.ts`（検証専用スクリプト、今後の再検証にも利用可能）を作成し、以下を確認した。

1. CREATE: 著者・書籍レコードの作成
2. READ: 作成したレコードの取得
3. UPDATE: レコードの更新
4. TRANSACTION: `$transaction`内で更新後に例外を発生させ、ロールバックされ更新前の状態に戻ることを確認
5. DELETE: 検証用に作成したデータを全て削除（後始末）

全項目成功。`connection_limit=1`という厳しい接続プール設定でもエラーは発生しなかった（`app/prisma/scripts/check-aiven-status.ts`で確認した実測の同時接続数は1）。

## 5. 接続情報の環境分離

本番・Preview・ローカル・Aiven検証の4種類の接続先を、以下のようにファイル単位で分離して管理する（混同防止）。

| 環境 | ファイル | 用途 |
|---|---|---|
| ローカル開発 | `app/.env.local`（gitignore対象） | `npm run dev`で使う開発用DB（`docker-compose.yml`の`db`サービス） |
| E2E/結合テスト | `app/.env.test`（gitignore対象） | Playwright E2E・Jest結合テスト用（`db-test`サービス） |
| Aiven検証（本Issue） | `app/.env.aiven-staging`（gitignore対象） | 本Issueで構築したAiven MySQL Freeの検証専用DB |
| 本番（Vercel） | Vercelの環境変数（リポジトリ内にファイルなし） | 本番運用時はVercelダッシュボードの環境変数機能で管理する想定（#477で設定） |

## 受け入れ基準チェック

- [x] 空のAiven DBへ全migrationが適用される（`sql_require_primary_key`無効化後、18件全て成功・ドリフト無し）
- [x] ローカルアプリからPrismaで正常に読み書きできる（CRUD・トランザクション検証成功）
- [x] Aivenのメトリクスで接続数・容量を確認できる（コンソールの「Service plan usage」でストレージ使用率、DB側の`SHOW VARIABLES`/`SHOW STATUS`で接続数上限・実接続数を確認済み）
