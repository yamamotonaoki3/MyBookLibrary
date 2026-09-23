# EC2 アプリデプロイガイド

## このドキュメントについて

Terraform で構築した AWS インフラ（EC2 + RDS）に Next.js アプリをデプロイする手順をまとめたガイドです。

---

## ⚠️ 重要：このアプリは Docker を使っていない

過去のドキュメントに Docker / docker-compose を使ったデプロイ手順が記載されていましたが、**実際の本番環境は Docker を使っていません。**

### 実際の仕組み

EC2 起動時に `terraform/modules/ec2/user_data.sh` が自動実行され、以下をすべて行います：

```
EC2 起動
  └─ user_data.sh が自動実行
      ├─ GitHub からリポジトリをクローン → /opt/app/
      ├─ npm install + npm run build（Next.js ビルド）
      ├─ AWS SSM Parameter Store から環境変数を取得 → start.sh に組み込み
      ├─ prisma migrate deploy（RDS マイグレーション自動実行）
      └─ systemd サービスとして登録・起動
           └─ start.sh が SSM から環境変数を読み込んで node server.js を実行
```

アプリは **systemd サービス（`mybooklibrary.service`）** として管理されており、EC2 再起動時も自動で起動します。

---

## 現在の構成

| 項目 | 内容 |
|---|---|
| EC2 Elastic IP | `176.32.66.52` |
| アプリ配置場所 | `/opt/app/` |
| 起動スクリプト | `/opt/app/start.sh` |
| 環境変数の取得元 | AWS SSM Parameter Store |
| サービス管理 | systemd（`mybooklibrary.service`） |
| データベース | RDS MySQL（プライベートサブネット） |
| 公開URL | CloudFront（`https://d29rpr1gfxxlgj.cloudfront.net`） |

---

## 通常のデプロイ手順（コード変更を本番に反映する場合）

コードを変更して main ブランチにマージした後、EC2 を作り直すことで最新コードを反映します。

### Step 1: EC2 を作り直す

```bash
cd terraform
terraform apply -replace="module.ec2.aws_instance.app"
```

- EC2 が削除・再作成される（約 2〜3 分）
- Elastic IP は同じまま維持される（`176.32.66.52`）
- RDS のデータは消えない（RDS は別リソースのため）
- user_data.sh が自動実行され、最新の GitHub main ブランチのコードがデプロイされる
- Prisma マイグレーションも自動で実行される

### Step 2: 起動確認

EC2 の起動完了後（約 5 分）、サービスの状態を確認：

```bash
ssh -i ~/.ssh/mybooklibrary-key.pem -o StrictHostKeyChecking=no ec2-user@176.32.66.52 \
  "sudo systemctl status mybooklibrary"
```

`Active: active (running)` と表示されれば成功。

### Step 3: ブラウザで確認

```
https://d29rpr1gfxxlgj.cloudfront.net
```

---

## EC2 に SSH で入って操作する場合

```bash
ssh -i ~/.ssh/mybooklibrary-key.pem -o StrictHostKeyChecking=no ec2-user@176.32.66.52
```

### よく使うコマンド

```bash
# サービスの状態確認
sudo systemctl status mybooklibrary

# サービス再起動（環境変数変更後など）
sudo systemctl restart mybooklibrary

# ログをリアルタイムで見る
sudo journalctl -u mybooklibrary -f

# 直近 50 行のログを見る
sudo journalctl -u mybooklibrary -n 50 --no-pager
```

---

## 環境変数の管理（SSM Parameter Store）

環境変数は AWS SSM Parameter Store で管理しており、`start.sh` が起動時に取得します。

### 登録されているパラメータ

| パラメータ名 | 用途 |
|---|---|
| `/mybooklibrary/AUTH_SECRET` | NextAuth シークレット |
| `/mybooklibrary/AUTH_GOOGLE_ID` | Google OAuth クライアント ID |
| `/mybooklibrary/AUTH_GOOGLE_SECRET` | Google OAuth シークレット |
| `/mybooklibrary/DATABASE_URL` | RDS 接続 URL |
| `/mybooklibrary/RAKUTEN_APP_ID` | 楽天ブックス API ID |
| `/mybooklibrary/RAKUTEN_ACCESS_KEY` | 楽天ブックス API キー |
| `/mybooklibrary/CALIL_API_KEY` | カーリル図書館 API キー |
| `/mybooklibrary/CRON_SECRET` | Cron 用シークレット |
| `/mybooklibrary/NEXTAUTH_URL` | NextAuth の公開 URL |
| `/mybooklibrary/SEED_ADMIN_EMAIL` | 管理者メールアドレス |
| `/mybooklibrary/SEED_ADMIN_PASSWORD` | 管理者パスワード |

### 新しい環境変数を追加する場合

1. `terraform/variables.tf` に変数を追加
2. `terraform/modules/ssm/main.tf` の `locals.params` に追加
3. `terraform/main.tf` の ssm モジュール呼び出しに追加
4. `terraform/modules/ec2/user_data.sh` の `start.sh` 生成部分に `export 変数名=$(get_param 変数名)` を追加
5. `terraform/terraform.tfvars` に実際の値を追加
6. `terraform apply` で SSM に反映

---

## EC2 を作り直した後に SSH 接続できない場合

EC2 を作り直すとホスト鍵が変わるため、以下のエラーが出ることがある：

```
WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!
```

以下のコマンドで古い鍵を削除してから再接続する：

```bash
ssh-keygen -R 176.32.66.52
```

---

## トラブルシューティング

### アプリが起動しない

```bash
sudo journalctl -u mybooklibrary -n 100 --no-pager
```

エラー内容を確認する。

### 環境変数が読み込まれていない（`XXX is not set` エラー）

`start.sh` に該当の環境変数の読み込みが追加されているか確認：

```bash
cat /opt/app/start.sh
```

追加されていない場合は `user_data.sh` を修正して EC2 を作り直す（`terraform apply -replace`）。

応急処置として直接 `start.sh` を編集してサービス再起動することも可能：

```bash
sudo sed -i '/export SEED_ADMIN_PASSWORD/a export NEW_KEY=$(get_param NEW_KEY)' /opt/app/start.sh
sudo systemctl restart mybooklibrary
```

ただしこの変更は EC2 作り直し時に消えるため、必ず `user_data.sh` にも反映すること。

### CloudFront でキャッシュが残っている

ブラウザで **Ctrl + Shift + R** で強制リロードする。

---

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `terraform/modules/ec2/user_data.sh` | EC2 起動時の初期化スクリプト（アプリデプロイ・マイグレーション・start.sh 生成） |
| `terraform/modules/ssm/main.tf` | SSM Parameter Store の定義 |
| `scripts/deploy.sh` | （現在は未使用）Docker ベースのデプロイスクリプト |
| `scripts/init-db.sh` | （現在は未使用）手動マイグレーション実行スクリプト |
| `docs/aws-deploy-plan.md` | Terraform インフラ設計書 |
