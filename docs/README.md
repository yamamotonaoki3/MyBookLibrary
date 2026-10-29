# ドキュメント索引

MyBookLibrary のドキュメント一覧。**現役の文書**と、**停止中の AWS 構成**、**作業が完了した記録（アーカイブ）**に分けている。プロジェクトの概要・起動方法は、リポジトリ直下の [README](../README.md) を参照。

## 要件・設計（現役）

| 文書 | 内容 |
| --- | --- |
| [requirements.md](requirements.md) | 要件定義書（機能・非機能・技術スタック） |
| [architecture.md](architecture.md) | アーキテクチャ概要（構成図・環境・リクエストの流れ・データ・デプロイの流れ） |
| [features/](features/) | 機能別定義書（下の表） |
| [api-spec.md](api-spec.md) | バリデーション・列挙型・エラーレスポンス・CSV フォーマットなどの技術仕様 |
| [er-diagram.md](er-diagram.md) | ER 図 |
| [screen-transition.md](screen-transition.md) | 画面遷移図 |
| [wireframes.md](wireframes.md) | ワイヤーフレーム |

### 機能別定義書（`features/`）

| 文書 | 内容 |
| --- | --- |
| [auth.md](features/auth.md) | 認証・アカウント管理（ログイン・登録・パスワード・セッション） |
| [admin.md](features/admin.md) | 管理者機能（受賞登録・ユーザー管理・監査ログ・メールのマスク） |
| [awards.md](features/awards.md) | 受賞作品の一覧 |
| [book-search.md](features/book-search.md) | 本の検索 |
| [reading-status.md](features/reading-status.md) | 読書ステータス |
| [reviews.md](features/reviews.md) | レビュー |
| [likes-reports.md](features/likes-reports.md) | いいね・通報 |
| [favorite-authors.md](features/favorite-authors.md) | お気に入り著者 |
| [follow.md](features/follow.md) | フォロー |
| [notifications.md](features/notifications.md) | 通知 |
| [library.md](features/library.md) | 近隣図書館の在庫確認 |
| [contact.md](features/contact.md) | お問い合わせ |
| [cron.md](features/cron.md) | 新刊チェック（Cron） |
| [book-enrichment.md](features/book-enrichment.md) | 書籍情報補完 |

## デプロイ・運用（現役）

| 文書 | 内容 |
| --- | --- |
| [operations.md](operations.md) | 運用手順書（日々の確認・障害時の初動・復旧・secret の更新） |
| [cloudflare-deploy.md](cloudflare-deploy.md) | Cloudflare Workers + D1 へのデプロイ（環境・secret・ロールバック・デモ） |
| [d1-cutover-runbook.md](d1-cutover-runbook.md) | 本番切り替え手順書（2026-10-17 に完了。再実行の記録と、公開後の監視） |
| [production-release-plan.md](production-release-plan.md) | 本番反映（main → production）の計画（変更と影響、チェックリスト、手順、ロールバック） |
| [d1-rehearsal-runbook.md](d1-rehearsal-runbook.md) | 匿名化データでの、D1 への移行リハーサル手順書 |
| [demo-environment.md](demo-environment.md) | デモ環境の方針と構成（保護・初期化・公開範囲） |
| [demo-apply-runbook.md](demo-apply-runbook.md) | デモ用 D1 への適用手順書 |
| [secrets-management.md](secrets-management.md) | 環境変数・シークレットの管理 |

## テスト（現役）

| 文書 | 内容 |
| --- | --- |
| [test-plan.md](test-plan.md) | テスト計画表（対象範囲と進捗） |
| [test-dependency-map.md](test-dependency-map.md) | テストの依存関係マップ |

## 記録（現役）

| 文書 | 内容 |
| --- | --- |
| [lessons-learned.md](lessons-learned.md) | 学び・手直しの記録。新しい作業の前に、索引を確認する |

## AWS 構成（停止中）

AWS（EC2 + RDS + CloudFront。Terraform 管理）は、現在すべて停止中。いつでも再開できるよう、定義と手順だけ残している。入口は [aws/README.md](aws/README.md)。

## アーカイブ（作業が完了した記録）

移行などの作業が完了した記録。現状の説明ではないため、**現在の構成・手順は、上の現役の文書を参照する**。入口は [archive/README.md](archive/README.md)。

| 文書 | 内容 |
| --- | --- |
| [archive/cloudflare-d1-migration-plan.md](archive/cloudflare-d1-migration-plan.md) | Cloudflare Workers + D1 への移行計画と、実装メモ（#609）。ソースコードのコメントから参照されている |
| [archive/data-migration-spec-481.md](archive/data-migration-spec-481.md) | 旧本番 DB から現行スキーマへの、データ変換仕様（#481） |
| [archive/schema-diff-482.md](archive/schema-diff-482.md) | 本番環境の実態・スキーマ差分の棚卸し（#482） |
| [archive/production-data-audit.md](archive/production-data-audit.md) | AWS 本番データの読み取り専用照合（AWS 本番 RDS 専用） |
| [archive/unused-api-audit-611.md](archive/unused-api-audit-611.md) | 未使用 API の監査記録（#611） |
