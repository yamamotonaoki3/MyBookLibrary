# EC2 + RDS アプリデプロイガイド

## このドキュメントについて

Terraform で構築した AWS インフラ（EC2 + RDS）に Next.js アプリをデプロイする手順をまとめたガイドです。
インフラ構築（Terraform）とアプリデプロイは別の作業であり、それぞれ異なるツールと手順が必要です。

---

## Terraform のインフラ構築との違い

| 項目 | Terraform（インフラ構築） | アプリデプロイ |
|---|---|---|
| 目的 | サーバー・DB・ネットワークを作る | サーバー上でアプリを動かす |
| 例え | 家を建てる | 家具を運び込んで住める状態にする |
| 使うツール | `terraform apply` | Docker、SSH、SCP |
| 自動化の度合い | コード1つで全自動 | 手順が複数あり、手動部分もある |

Terraform が完了しても、アプリはまだ動いていません。この後の作業が必要です。

---

## 全体の流れ

```
① インフラ構築（Terraform） ← 完了済み
  └─ EC2・RDS・VPC・セキュリティグループを作成

② アプリのパッケージ化（Docker）
  └─ Next.js アプリを Docker イメージとしてまとめる

③ EC2 の準備
  └─ docker-compose インストール
  └─ 環境変数ファイル（.env.production）を配置

④ アプリを EC2 に転送・起動
  └─ Docker イメージを EC2 に送って起動

⑤ データベースの初期化
  └─ RDS に対して prisma migrate deploy を実行

⑥ ブラウザで確認
  └─ http://52.69.24.11:3000 にアクセス
```

---

## ① インフラ構築（完了済み）

`terraform apply` で以下のリソースを作成済み。

| リソース | 詳細 |
|---|---|
| EC2 | t2.micro / Amazon Linux 2023 / Elastic IP: 52.69.24.11 |
| RDS | db.t3.micro / MySQL 8.4 / プライベートサブネット |
| VPC | 10.0.0.0/16 / パブリック+プライベートサブネット |
| セキュリティグループ | EC2: ポート3000公開 / RDS: EC2からのみ3306許可 |

EC2 には Docker がインストール済み（user_data.sh で自動実行）。
ただし **docker-compose は含まれていなかった**（後述）。

---

## ② Dockerfile（Next.js のパッケージ化）

**ファイル:** `app/Dockerfile`

Next.js アプリを Docker イメージとしてまとめるためのファイル。
マルチステージビルドにより、ビルド用の環境と実行用の環境を分離し、イメージを軽量に保つ。

```
[Build Stage]  node:22-alpine
  └─ npm ci（依存パッケージインストール）
  └─ npm run build（Next.js ビルド → .next/standalone に出力）

[Runtime Stage]  node:22-alpine
  └─ standalone の出力物だけをコピー
  └─ node server.js で起動
```

**ポイント:** `next.config.ts` に `output: "standalone"` が設定されているため、
Node.js と必要なファイルだけが含まれた軽量イメージが生成される。
EC2 に Node.js や npm を別途インストールする必要はない（Docker の中に全て含まれているため）。

---

## ③ EC2 の準備

### 3-1. docker-compose のインストール

**なぜ必要か:** EC2 の初期化スクリプト（`user_data.sh`）に docker-compose のインストールが含まれていなかった。
Docker 本体はインストール済みだが、複数コンテナを管理する `docker-compose` は別途インストールが必要。

EC2 に SSH 接続して以下を実行：

```bash
# SSH 接続
ssh -i ~/.ssh/mybooklibrary-key.pem ec2-user@52.69.24.11

# docker-compose をインストール
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 確認
docker-compose --version
```

### 3-2. 環境変数ファイルの配置

**なぜ手動か:** DB パスワードや認証キーなどの機密情報はスクリプトに含めず、手動で EC2 上に配置する。

```bash
# /opt/app ディレクトリ作成
mkdir -p /opt/app

# .env.production を作成（nano エディタで編集）
nano /opt/app/.env.production
```

以下の内容を入力して保存（`Ctrl+O` → `Enter` → `Ctrl+X`）：

```
DATABASE_URL=mysql://admin:<db_password>@<rds_endpoint>:3306/mybooklibrary
AUTH_SECRET=<auth_secret>
RAKUTEN_APP_ID=<rakuten_app_id>
RAKUTEN_ACCESS_KEY=<rakuten_access_key>
CRON_SECRET=<cron_secret>
NEXTAUTH_URL=http://52.69.24.11:3000
```

**注意:**
- `DATABASE_URL` はローカル開発用（localhost）とは異なり、RDS のエンドポイントを指定する
- `NEXTAUTH_URL` はシークレットではなく単なる URL 設定のため平文で問題ない
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` は HTTPS 導入後に追加する（HTTP では Google OAuth は動作しない）

配置確認：

```bash
# 行数で確認（パスワードを画面に表示しない場合）
cat /opt/app/.env.production | wc -l
# → 6 と表示されれば OK
```

---

## ④ アプリを EC2 に転送・起動

### 4-1. Docker イメージのビルドと転送

**ファイル:** `scripts/deploy.sh`

ローカルの Git Bash から実行する。PowerShell では `bash` コマンドが使えないため注意。

```bash
# Git Bash で実行
cd /c/web_application_files/MyBookLibrary
bash scripts/deploy.sh
```

スクリプトの内容と流れ：

```
[1/4] ローカルで Docker イメージをビルド
  └─ app/ ディレクトリで docker build を実行
  └─ イメージ名: mybooklibrary-app:latest（約 138MB）

[2/4] イメージを tar ファイルに圧縮して保存
  └─ /tmp/mybooklibrary-app.tar.gz として保存

[3/4] EC2 にファイルを転送（SCP）
  └─ tar ファイルを EC2 の /tmp/ に転送
  └─ docker-compose.prod.yml を EC2 の /opt/app/ に転送

[4/4] EC2 でイメージをロードしてコンテナを起動
  └─ docker load でイメージをインポート
  └─ docker-compose up -d でバックグラウンド起動
```

### 4-2. docker-compose.prod.yml

**ファイル:** `docker-compose.prod.yml`（プロジェクトルート）

EC2 上でコンテナを起動するための設定ファイル。

```yaml
services:
  app:
    image: mybooklibrary-app:latest
    container_name: mybooklibrary-app
    ports:
      - "3000:3000"        # EC2 の 3000 番ポートをコンテナの 3000 番に接続
    env_file:
      - .env.production    # 環境変数ファイルを読み込み
    restart: unless-stopped  # EC2 再起動時に自動で起動
```

---

## ⑤ データベースの初期化（RDS マイグレーション）

**ファイル:** `scripts/init-db.sh`

Prisma のマイグレーションを RDS に対して実行する。
コンテナの中から RDS に接続して `prisma migrate deploy` を実行する。

```bash
# Git Bash で実行
bash scripts/init-db.sh
```

内部では以下を実行：

```bash
docker exec mybooklibrary-app npx prisma migrate deploy
```

**なぜコンテナの中から実行するか:**
- RDS はプライベートサブネットにあり、EC2 経由でしかアクセスできない
- ローカル PC から直接 RDS には接続できない
- コンテナ内の `DATABASE_URL` 環境変数が RDS エンドポイントを指しているため、コンテナ経由で実行する

---

## ⑥ 動作確認

ブラウザで以下にアクセス：

```
http://52.69.24.11:3000
```

**確認項目:**
- トップページが表示される
- メール+パスワードでログインできる（Google OAuth はこの段階では未対応）
- 書籍一覧が表示される

**ログ確認（エラーが出た場合）:**

```bash
# SSH 接続後
docker logs mybooklibrary-app

# リアルタイムでログを監視
docker logs -f mybooklibrary-app
```

---

## トラブルシューティング

### `docker-compose: command not found`

docker-compose が未インストール。[③ 3-1](#3-1-docker-composeのインストール) を参照。

### `bash: command not found`（ローカルで）

PowerShell では `bash` が使えない。Git Bash を開いて実行する。
VS Code のターミナル右上の `∨` から「Git Bash」を選択。

### `scp: stat local "...": No such file or directory`

スクリプト内のパス解決エラー。該当ファイルを SCP で個別転送する：

```bash
scp -i ~/.ssh/mybooklibrary-key.pem docker-compose.prod.yml ec2-user@52.69.24.11:/opt/app/
```

---

## 今後の改善予定

| 項目 | 概要 |
|---|---|
| `user_data.sh` に docker-compose を追加 | EC2 再構築時に自動でインストールされるようにする |
| GitHub Actions で自動デプロイ | `git push` するだけで EC2 に自動デプロイされるようにする |
| CloudFront + HTTPS 導入 | SSL 化後に Google OAuth を有効化する |
| SSM Parameter Store で環境変数管理 | `.env.production` の手動配置を自動化する |

---

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `terraform/modules/ec2/user_data.sh` | EC2 起動時の初期化スクリプト |
| `app/Dockerfile` | Next.js のマルチステージビルド定義 |
| `docker-compose.prod.yml` | EC2 上のコンテナ起動設定 |
| `scripts/deploy.sh` | ビルド + 転送 + 起動の自動化スクリプト |
| `scripts/init-db.sh` | RDS マイグレーション実行スクリプト |
| `docs/aws-deploy-plan.md` | Terraform インフラ設計書 |
