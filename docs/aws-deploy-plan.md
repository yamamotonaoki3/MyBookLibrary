# AWS 無料枠 Terraform デプロイ構成プラン

## Context

MyBookLibrary（Next.js 16 フルスタック + MySQL 8.4）を AWS にデプロイするため、  
Terraform で IaC 管理しつつ AWS 無料枠の範囲内に収まる構成を設計する。  
現在は Vercel デプロイ想定（vercel.json あり）だが、AWS への移行を計画中。  
アプリの最終チェック後に実装予定のため、このプランは設計書として保持する。

---

## アーキテクチャ構成

```
インターネット (HTTPS)
     │
     ▼
[CloudFront]  ← HTTPS 終端・静的アセットキャッシュ
     │ HTTP:3000（CloudFront prefix list のみ許可）
     ▼
[EC2 t2.micro]  ← Next.js 16 Docker コンテナ (port 3000)
  Amazon Linux 2023
  IAM Role → SSM Parameter Store 読み取り
     │ MySQL:3306（EC2 SG からのみ許可）
     ▼
[RDS db.t3.micro]  ← MySQL 8.4（プライベートサブネット）

[Lambda + EventBridge Scheduler]
  JST 00:00 毎日 → GET https://<CF>/api/cron/check-new-books
  （Vercel Cron の代替。既存 API Route のコード変更不要）

[SSM Parameter Store]  ← 全シークレット管理（SecureString・無料）
```

**ALB なし**（CloudFront → EC2 直接接続でコスト削減）  
**Fargate なし**（EC2 t2.micro が無料枠対象）

---

## Terraform ファイル構造

```
terraform/          ← プロジェクトルートに新規作成
├── main.tf         # provider (aws, ap-northeast-1), backend 設定
├── variables.tf
├── outputs.tf      # ec2_elastic_ip, cloudfront_domain, rds_endpoint
├── terraform.tfvars          # 実値（.gitignore 対象）
├── terraform.tfvars.example  # テンプレート（リポジトリに含める）
│
├── modules/
│   ├── networking/   # VPC, Subnet x3, IGW, Route Table, SG x2
│   ├── ec2/          # EC2 t2.micro, Elastic IP, IAM Role, user_data.sh
│   ├── rds/          # RDS db.t3.micro MySQL 8.4, DB Subnet Group
│   ├── cloudfront/   # CloudFront Distribution (SSR TTL=0, static TTL=1日)
│   ├── secrets/      # SSM Parameter Store SecureString（8パラメータ）
│   └── cron/         # Lambda (Node.js 22) + EventBridge Scheduler + IAM
│       └── lambda_src/index.mjs
│
└── scripts/
    ├── deploy-app.sh   # Docker ビルド → ECR プッシュ → EC2 デプロイ
    └── init-db.sh      # prisma migrate deploy 実行
```

---

## 主要リソース詳細

### ネットワーク (modules/networking)
- VPC: `10.0.0.0/16`
- パブリックサブネット `10.0.1.0/24`（EC2 用・ap-northeast-1a）
- プライベートサブネット x2（RDS 用・RDS は 2AZ 必須）
- EC2 SG: CloudFront マネージドプレフィックスリストから port 3000 のみ許可
- RDS SG: EC2 SG から port 3306 のみ許可

### EC2 (modules/ec2)
- `t2.micro` / Amazon Linux 2023 最新 AMI
- IAM Role: SSM Parameter Store `/${project}/*` 読み取り + SSM Session Manager
- user_data.sh: Docker インストール、起動スクリプト配置
- gp3 20GB（無料枠 30GB 以内）

### RDS (modules/rds)
- `db.t3.micro` / MySQL 8.4 / gp2 20GB
- `multi_az = false`（無料枠）、`publicly_accessible = false`
- バックアップ 7 日保持

### CloudFront (modules/cloudfront)
- Origin: EC2 の Elastic IP（HTTP:3000）
- デフォルト動作: SSR 用 TTL=0（全リクエストをオリジンへ）
- パスパターン `_next/static/*` と `/images/*`: TTL=86400（キャッシュ有効）
- HTTPS: CloudFront デフォルト証明書（独自ドメインなしで開始）

### シークレット管理 (modules/secrets)
SSM Parameter Store SecureString（標準パラメータ・無料）に保存：
```
/mybooklibrary/DATABASE_URL
/mybooklibrary/AUTH_SECRET
/mybooklibrary/AUTH_GOOGLE_ID
/mybooklibrary/AUTH_GOOGLE_SECRET
/mybooklibrary/CRON_SECRET
/mybooklibrary/RAKUTEN_APP_ID
/mybooklibrary/RAKUTEN_ACCESS_KEY
/mybooklibrary/NEXTAUTH_URL
```
EC2 起動・デプロイ時に `aws ssm get-parameters-by-path` で一括取得 → `.env` に書き出す

### Cron Lambda (modules/cron)
- Node.js 22 / timeout 300秒
- EventBridge Scheduler: `cron(0 0 * * ? *)` Asia/Tokyo（JST 00:00）
- Lambda が SSM から `CRON_SECRET` を取得し `Authorization: Bearer <secret>` ヘッダー付きで API を呼ぶ
- **`/api/cron/check-new-books/route.ts` のコード変更不要**

---

## アプリ側の変更点（最小限）

1. **`app/next.config.ts`**: `output: "standalone"` を追加（Docker イメージ軽量化）
2. **`app/prisma/schema.prisma`**: DATABASE_URL に `?connection_limit=5` を付与（db.t3.micro の接続数上限対策）
3. **`vercel.json`**: AWS 移行後に `crons` キーを削除（任意）
4. **`terraform/scripts/Dockerfile`** を新規作成（本番用マルチステージビルド）

---

## デプロイ手順（初回）

```
1. AWS CLI 設定 + EC2 キーペア作成
2. ECR リポジトリ作成
3. next.config.ts に output: "standalone" 追加
4. terraform.tfvars 作成（シークレット記入）
5. terraform init && terraform apply
6. SSM の DATABASE_URL と NEXTAUTH_URL を RDS エンドポイント・CF ドメインで更新
7. Google Cloud Console で OAuth リダイレクト URI を追加
8. deploy-app.sh 実行（ビルド → ECR プッシュ → EC2 デプロイ）
9. EC2 で prisma migrate deploy 実行
10. https://<cloudfront_domain> で動作確認
```

---

## コスト試算

| リソース | 無料枠 | 月額 |
|---|---|---|
| EC2 t2.micro | 750時間/月（12ヶ月） | $0 |
| RDS db.t3.micro | 750時間/月 + 20GB（12ヶ月） | $0 |
| CloudFront | 1TB + 1000万 req（12ヶ月） | $0 |
| Lambda + EventBridge | 永続無料枠 | $0 |
| SSM Parameter Store | 標準パラメータ無料 | $0 |
| ECR | 500MB/月（12ヶ月） | $0 |
| **合計（12ヶ月）** | | **$0** |
| **13ヶ月以降** | EC2+RDS+EBS | **~$23/月** |

---

## 検証方法

- `terraform plan` でリソース差分を確認
- `terraform apply` 後、`curl https://<cloudfront_domain>` でアプリ疎通確認
- `curl https://<cloudfront_domain>/api/cron/check-new-books -H "Authorization: Bearer <CRON_SECRET>"` で Cron API 動作確認
- Lambda を手動 invoke して EventBridge 代替動作を確認
- `prisma migrate status` で DB マイグレーション済みを確認
