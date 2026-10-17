# AWS 構成（停止中）

> **AWS（EC2 / RDS MySQL / CloudFront / Lambda + EventBridge / SSM。Terraform 管理）は、現在すべて停止中。** 費用のため `terraform destroy` で**リソースを削除済み**で、残っているのは、RDS の手動スナップショット（2026-10-08）だけ。本番は、2026-10-17 に Cloudflare Workers + D1 へ切り替え済み（[Cloudflare へのデプロイ](../cloudflare-deploy.md)、[切り替え手順書](../d1-cutover-runbook.md)）。再び立ち上げられるよう、Terraform の定義（`terraform/`）と、この 3 つの文書だけ残している。

| 順 | 文書 | 内容 |
| --- | --- | --- |
| 1 | [aws-deploy-plan.md](aws-deploy-plan.md) | 構成プラン（無料枠の範囲に収める設計と、Terraform の方針） |
| 2 | [aws-deploy-guide.md](aws-deploy-guide.md) | 構成の解説ガイド（AWS・Terraform が初めての人向け）。**停止・再開の手順**は、この文書の「停止・再開手順」の節 |
| 3 | [aws-app-deploy-guide.md](aws-app-deploy-guide.md) | EC2 へのアプリのデプロイ手順（Lambda + EventBridge の設定を含む） |

## 再開するとき

1. [aws-deploy-guide.md](aws-deploy-guide.md#8-停止再開手順) の「停止・再開手順」に従って、インフラを再開する。
2. データは、**Cloudflare D1 が最新**。AWS 側に残るのは、2026-10-08 のスナップショットと、2026-10-11 の暗号化ダンプだけで、切り替えの前のデータ。再開する場合は、D1 の最新の状態を MySQL へ戻す手順が必要になる（逆 ETL。計画は [移行計画](../archive/cloudflare-d1-migration-plan.md) の P4-8・P4-9）。
3. アプリは、MySQL 構成（`prisma/schema.prisma`）で動く。D1 用のコード（`prisma/d1`）とは、別の経路。
