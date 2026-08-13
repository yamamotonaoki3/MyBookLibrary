# 本番環境の実態・スキーマ差分棚卸し（Issue #482）

移行前提の確認として、本番AWS環境（EC2 + RDS MySQL）に読み取り専用でアクセスし、実態を現行の開発環境（`app/prisma/schema.prisma` / `app/prisma/migrations/`）と突き合わせた結果をまとめる。

調査はEC2（`176.32.66.52`）を踏み台としたSSH経由で実施し、RDSを一時的にも外部公開していない。書き込み系操作（`ALTER`/`UPDATE`/`DELETE`/`prisma migrate deploy`等）は一切実行していない。認証情報の実値は本ドキュメント・調査ログのいずれにも記載していない。

## 1. 本番デプロイ済みコミット・アプリ状態

- 本番はDockerを使わず、EC2起動時（`terraform apply -replace`実行時）に`user_data.sh`がGitHubのmainブランチをZIPスナップショットで取得する方式のため、`.git`履歴が本番機上に存在しない（`git`コマンド自体も未インストール）。
- 代わりに以下の状況証拠から、デプロイされたコミットを特定した。
  - `mybooklibrary.service`は **2026-07-04 15:10:02 UTC** から稼働開始（`systemctl status`で確認）。
  - 本番配置ファイル（`CLAUDE.md`等）のタイムスタンプは **2026-07-04 14:45:46 UTC**（= 2026-07-04 23:45:46 JST）。
  - この時刻はローカルgit履歴の以下のコミットと完全一致する。
    ```
    0e22f371f7d67d7552b9e367f8189c438875ff55  2026-07-04 23:45:46 +0900  Merge pull request #386 from yamamotonaoki3/fix/#385-ndl-search-missing-monograph
    ```
  - 現在のmain HEAD（`f50782f`）とは **130コミット差**（2026-07-04〜2026-08-13の約40日分）。
- サービス状態: `active (running)`、1ヶ月9日間安定稼働中。クラッシュ・再起動ループなし。
- 直近ログに見られる非致命的なエラー（スキーマ差分とは無関係）:
  - `notifications_user_id_type_book_isbn_key`のユニーク制約違反（重複通知作成の抑止が正常に働いている状態で、アプリ側でハンドリング済みのエラー）
  - 楽天ブックスAPI・NDLサーチAPIのレート制限（429）エラー

## 2. MySQLバージョン・文字コード・照合順序・タイムゾーン

`information_schema`・システム変数を読み取り専用クエリで取得。

| 項目 | 値 |
|---|---|
| バージョン | MySQL 8.4.8 |
| character_set_server | utf8mb4 |
| character_set_database | utf8mb4 |
| collation_server | utf8mb4_0900_ai_ci |
| collation_database | utf8mb4_0900_ai_ci |
| global time_zone | UTC |
| session time_zone | UTC |

現行`app/prisma/schema.prisma`・migrationファイルに文字コード/照合順序の明示指定はなく、MySQL/Prismaのデフォルトに依存している。本番の実値（utf8mb4 / utf8mb4_0900_ai_ci / UTC）はAiven Free（MySQL 8系）でも標準的にサポートされる設定であり、移行時に特別な変換は不要と判断できる。

## 3. `_prisma_migrations` 突合結果

`prisma migrate status`をEC2上の本番アプリ（デプロイ済みコード）から実行した結果：

```
12 migrations found in prisma/migrations
Database schema is up to date!
```

**重要**: この「up to date」は「本番RDSは、EC2にデプロイされている12件のmigrationについては全て適用済みでドリフトなし」という意味であり、**現行リポジトリ全体（18件）が本番に反映されているという意味ではない**。

本番EC2の`/opt/app/app/prisma/migrations/`には以下12件のみが存在（2026-06-29時点のコードのため）：

```
20260602144024_init
20260607084326_add_report
20260609153743_add_auth_fields
20260610212255_add_image_and_email_verified_to_user
20260612132201_add_like_cascade_delete
20260612143824_add_notification_book_title
20260616000000_add_unique_notification
20260620052155_add_book_source
20260620060130_add_contact_inquiry
20260621051838_add_user_library
20260621060000_add_libkey_to_user_library
20260629000000_add_is_public_to_reviews
```

現行リポジトリの18件のうち、以下**6件が本番未適用**：

```
20260711130000_add_secret_word_to_user
20260712211750_add_follow
20260714135800_add_notification_actor_relation
20260715120000_add_book_created_by_user_id
20260726120000_add_favorite_author_author_id_index
20260801064609_add_audit_log
```

RDS自体のスキーマがデプロイ済み12件から先に進んでいる形跡（ドリフト）はない。つまり「本番アプリのコードが古いまま止まっている」ことが根本原因であり、DBだけが個別に変更された形跡はない。

## 4. 実スキーマ突合（`prisma db pull`によるintrospection）

本番RDSに対し`prisma db pull`を実行し、実スキーマを取得（一時ファイルへのみ出力、調査後に削除済み）。結果は上記の「6件のマイグレーション未適用」という結論と完全に一致した。

### テーブル一覧の差分

| 分類 | 内容 |
|---|---|
| 本番に存在しないテーブル | `follows`（Follow）、`audit_logs`（AuditLog） |
| 本番に存在するテーブル数 | 16モデル + `_prisma_migrations` = 17テーブル |
| 現行スキーマのモデル数 | 18モデル |

### 列・制約単位の差分

| 対象テーブル | 分類 | 内容 |
|---|---|---|
| `users` | 列追加（未反映） | `secret_word_hash`, `secret_word_fail_count`, `secret_word_locked_until` が本番に存在しない（migration #13） |
| `notifications` | 列追加（未反映） | `actor_id`（Userへの自己参照FK、`onDelete: SetNull`）が本番に存在しない（migration #15） |
| `books` | 列追加（未反映） | `created_by_user_id`（Userへの手動登録者FK、`onDelete: SetNull`）が本番に存在しない（migration #16） |
| `favorite_authors` | インデックス追加（未反映） | `favorite_authors_author_id_idx`（`author_id`単体インデックス、おすすめ機能のGROUP BY高速化用）が本番に存在しない。FKの自動インデックス（`favorite_authors_author_id_fkey`）のみ存在（migration #17） |
| （新規テーブル）`follows` | テーブル追加（未反映） | `follower_id` / `following_id` の複合ユニーク制約、Userへの2方向自己参照FK（`onDelete: Cascade`）を持つフォロー機能テーブルが本番に存在しない（migration #14） |
| （新規テーブル）`audit_logs` | テーブル追加（未反映） | `event_type` / `actor_user_id` / `detail`（JSON型）等を持つ監査ログテーブルが本番に存在しない。`(event_type, created_at)` `(actor_user_id)` `(created_at)` の3インデックスも含め未反映（migration #18） |

上記以外（NOT NULL変更・型変更・UNIQUE変更・名称変更）は検出されなかった。**本番未反映の6件のマイグレーションは、いずれも「追加」のみで構成されており、既存列の型変更・削除・破壊的変更は含まれていない。**

## 5. テーブル別件数・容量・採番状況

`information_schema.tables`から取得（読み取り専用）。

| テーブル | 件数 | データ容量 | インデックス容量 | AUTO_INCREMENT次値 |
|---|---:|---:|---:|---:|
| _prisma_migrations | 12 | 16KB | 0KB | - |
| accounts | 0 | 16KB | 32KB | - |
| authors | 250 | 16KB | 0KB | 251 |
| award_entries | 334 | 16KB | 32KB | 361 |
| awards | 4 | 16KB | 16KB | 5 |
| books | 374 | 96KB | 32KB | 376 |
| contact_inquiries | 1 | 16KB | 16KB | 2 |
| favorite_authors | 7 | 16KB | 32KB | 23 |
| likes | 0 | 16KB | 32KB | 23 |
| notifications | 33 | 16KB | 16KB | 60 |
| reading_statuses | 79 | 16KB | 32KB | 127 |
| reports | 1 | 16KB | 32KB | 7 |
| reviews | 3 | 16KB | 32KB | 18 |
| sessions | 0 | 16KB | 32KB | - |
| user_libraries | 1 | 16KB | 16KB | 2 |
| users | 7 | 16KB | 16KB | 17 |
| verification_tokens | 0 | 16KB | 16KB | - |

**合計データ容量+インデックス容量 ≈ 768KB**（InnoDBの1テーブルあたり最小割当16KBが大半を占め、実データはごく小規模）。

## 6. Aiven Free収容可否の判断

- 現在の本番データ量（約768KB）は、Aiven Free（MySQL、ディスク1GB）に対して**十分すぎるほど余裕がある**（使用率0.1%未満）。
- 6件の未反映マイグレーションを適用した場合に追加されるデータ量（`follows`・`audit_logs`の新規テーブル、`users`/`notifications`/`books`への列追加）も、現在の利用規模（ユーザー7件、書籍374件）を踏まえれば無視できるレベルであり、容量面でAiven Freeへの移行を妨げる要因はない。
- **結論: 容量面ではAiven Free（1GB）へ収容可能。**

## 7. 本番データ読み取り専用取得手順（確定版）

移行検討・以降の調査で再現可能な形で、確立した安全な読み取り手順を記録する。

1. `ssh -i ~/.ssh/mybooklibrary-key.pem ec2-user@176.32.66.52` でEC2へ接続する（RDSはプライベートサブネットのためEC2が唯一の到達経路。RDSを公開しない）。
2. EC2上でSSM Parameter StoreからDATABASE_URLを取得し、シェル変数として直接コマンドへ注入する（値をログ・標準出力に残さない）。
   ```bash
   export DATABASE_URL=$(aws ssm get-parameter --name /mybooklibrary/DATABASE_URL \
     --with-decryption --query Parameter.Value --output text --region ap-northeast-1)
   ```
3. 読み取り専用の確認には`/opt/app/app`にビルド済みの`prisma`CLI・`@prisma/client`を利用する。
   - マイグレーション状況: `npx prisma migrate status`
   - 実スキーマ取得: `npx prisma db pull --schema=/tmp/<一時ファイル>.prisma`（**必ず`/opt/app`配下やローカルリポジトリの`schema.prisma`ではなく`/tmp`配下の一時ファイルを指定する**）
   - 任意のSELECT実行: 生成済み`@prisma/client`をimportする小さなNode.jsスクリプトを`/tmp`に作成し、`$queryRawUnsafe`で実行する（`prisma db execute`はSELECT結果を返さないため不向き）
4. 調査完了後、`/tmp`に作成した一時ファイルは`rm -f`で必ず削除する。

この手順により、RDSを一切公開せず、書き込み権限も必要とせず、本番の実態を安全に確認できることを確認した。

## 受け入れ基準チェック

- [x] #483が完了している（PR #492でマージ済み、E2E全件PASS）
- [x] 本番と現行開発スキーマの差分を列・制約単位で説明できる（本ドキュメント4章）
- [x] 本番データを読み取り専用で取得する手順が確定している（本ドキュメント7章）
- [x] Aiven Freeへ収容可能か判断できている（本ドキュメント6章、容量面で問題なし）

## 移行時の注意点（今後の検討材料）

- 本番は現行mainより130コミット・6マイグレーション遅れている。移行時にどちらの内容を正とするか（①現行mainの最新コードとスキーマで新規に移行する／②本番の現状をまず最新化してから移行する）は、本Issueの範囲外の意思決定として別途検討が必要。
- 6件の未反映マイグレーションはいずれも追加のみ（列追加・テーブル追加・インデックス追加）で、破壊的変更は含まれない。そのため「移行と同時に最新mainへ追従する」を選んだ場合も、既存データの欠落・型不整合のリスクは低いと考えられる。
