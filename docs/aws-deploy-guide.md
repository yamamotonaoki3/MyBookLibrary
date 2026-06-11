# AWS デプロイ構成 解説ガイド

> このドキュメントは [aws-deploy-plan.md](./aws-deploy-plan.md) の内容を、
> AWS・Terraform が初めての方向けに詳しく解説したものです。

---

## 目次

1. [Terraform とは何か](#1-terraform-とは何か)
2. [今回使う AWS サービス一覧](#2-今回使う-aws-サービス一覧)
3. [アーキテクチャ図の読み方](#3-アーキテクチャ図の読み方)
4. [各 AWS サービスの詳細解説](#4-各-aws-サービスの詳細解説)
5. [Terraform のファイル構造の解説](#5-terraform-のファイル構造の解説)
6. [デプロイ手順の各ステップ解説](#6-デプロイ手順の各ステップ解説)
7. [Vercel との違い](#7-vercel-との違い)

---

## 1. Terraform とは何か

### 一言で言うと

「AWS 上に作りたいインフラをコードで書いておくと、自動で構築してくれるツール」です。

### 具体的に何をするか

通常、AWS のサービスを使うには AWS のマネジメントコンソール（ブラウザの管理画面）を開いて、
ボタンをクリックしながら一つひとつ設定していきます。

Terraform を使うと、その設定を `.tf` という拡張子のファイルに書いておき、
`terraform apply` という1つのコマンドを実行するだけで、すべてのサービスが自動で作られます。

### なぜ Terraform を使うか

| 手動（コンソール操作） | Terraform |
|---|---|
| 何をどう設定したか記録が残らない | コードがそのまま設計書になる |
| 同じ環境を再現するのが難しい | `terraform apply` で何度でも同じ環境が作れる |
| チームで共有しにくい | GitHub で管理できる |
| 削除するとき何を消せばいいか分からない | `terraform destroy` で全部まとめて削除できる |

### Terraform の基本コマンド

```bash
terraform init    # 初期化（最初に1回だけ実行）
terraform plan    # 「何を作るか」のプレビューを表示（実際には何もしない）
terraform apply   # 実際にAWSにリソースを作成・変更する
terraform destroy # 作ったリソースをすべて削除する
```

---

## 2. 今回使う AWS サービス一覧

| サービス名 | 簡単な説明 | 無料枠 |
|---|---|---|
| **EC2** | 仮想サーバー。Next.js アプリをここで動かす | t2.micro が12ヶ月無料 |
| **RDS** | マネージドデータベース。MySQL をここで動かす | db.t3.micro が12ヶ月無料 |
| **CloudFront** | CDN（コンテンツ配信ネットワーク）。HTTPS の窓口になる | 1TB/月 無料 |
| **VPC** | AWS 上の仮想ネットワーク。サービス同士を繋ぐ「社内LAN」のようなもの | 常時無料 |
| **Security Group** | ファイアウォール。「どこからのアクセスを許可するか」を定義する | 常時無料 |
| **SSM Parameter Store** | 環境変数・パスワードなどのシークレットを安全に保管する場所 | 標準パラメータは常時無料 |
| **Lambda** | サーバーなしで小さなプログラムを実行できるサービス | 月100万回まで常時無料 |
| **EventBridge Scheduler** | 「毎日○時に Lambda を実行する」などのスケジュール管理 | 月100万回まで常時無料 |
| **ECR** | Docker イメージを保存する場所（AWS 版 Docker Hub） | 500MB/月 無料 |
| **IAM** | 「誰が何をできるか」の権限管理 | 常時無料 |
| **Elastic IP** | EC2 に固定の IP アドレスを割り当てる | 使用中は無料 |

---

## 3. アーキテクチャ図の読み方

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
```

### 矢印の意味

```
インターネット → CloudFront
```
ユーザーがブラウザで `https://xxxxx.cloudfront.net` にアクセスすると、
まず CloudFront がリクエストを受け取ります。

```
CloudFront → EC2（HTTP:3000）
```
CloudFront が受け取ったリクエストを、EC2 上で動いている Next.js（ポート3000）に転送します。
この通信は社内ネットワーク内（VPC 内）なので HTTP で OK です。

```
EC2 → RDS（MySQL:3306）
```
Next.js アプリが DB に接続するとき、EC2 から RDS の MySQL（ポート3306）に接続します。
RDS はインターネットから直接アクセスできない「プライベートサブネット」に置かれており、
EC2 からしか繋がりません。

```
Lambda → CloudFront → EC2
```
毎日0時になると EventBridge Scheduler が Lambda を起動し、
Lambda が新刊チェックの API を呼び出します。
この通信は外から見ると「普通のHTTPリクエスト」と同じです。

### 「コメント」の意味

| 図中の記述 | 意味 |
|---|---|
| `HTTP:3000` | ポート番号3000番で HTTP 通信をする |
| `CloudFront prefix list のみ許可` | CloudFront のサーバーからのアクセスしか受け付けない（EC2 に直接アクセスできないようにする） |
| `EC2 SG からのみ許可` | EC2 に割り当てたセキュリティグループからのアクセスしか受け付けない |
| `プライベートサブネット` | インターネットから直接つながらないネットワーク領域 |

---

## 4. 各 AWS サービスの詳細解説

### 4-1. VPC・サブネット・Security Group（ネットワーク基盤）

#### VPC（Virtual Private Cloud）とは

AWS 上に作る「自分専用の仮想ネットワーク」です。
会社の社内ネットワーク（イントラネット）を AWS 上に作るイメージです。

```
VPC: 10.0.0.0/16
 ├── パブリックサブネット: 10.0.1.0/24  ← EC2 を置く（インターネットと繋がる）
 ├── プライベートサブネット A: 10.0.10.0/24  ← RDS を置く（インターネットと繋がらない）
 └── プライベートサブネット C: 10.0.11.0/24  ← RDS の予備（別の建物に冗長化）
```

**`10.0.0.0/16` の意味:**
これは「IP アドレスの範囲」を表します。`10.0.0.1` ～ `10.0.255.254` の範囲内で
自由に IP アドレスを使えます。VPC 内のサーバー同士はこの IP アドレスで通信します。

#### サブネットとは

VPC をさらに小さく区切った「区画」です。

- **パブリックサブネット**: インターネットゲートウェイ（後述）と繋がっており、
  インターネットと通信できます。EC2 はここに置きます。
- **プライベートサブネット**: インターネットと直接繋がっていません。
  DB のように「外から直接触られたくないもの」を置きます。

**なぜプライベートサブネットが2つあるか？**
RDS（マネージドDB）は AWS の仕様上、「2つの異なるアベイラビリティゾーン（AZ）に
サブネットを用意すること」が必須です。AZ とは「東京リージョン内の別々のデータセンター」のことです。

#### Internet Gateway（インターネットゲートウェイ）

VPC とインターネットを繋ぐ「出入り口」です。
これがないとパブリックサブネットのサーバーもインターネットと通信できません。

#### Security Group（セキュリティグループ）とは

各サービスに設定する「ファイアウォール」です。
「どこからのアクセスを、どのポートで許可するか」をルールとして定義します。

**今回の EC2 のセキュリティグループ:**
```
許可するアクセス:
  - ポート 3000: CloudFront のサーバーからのみ（一般ユーザーが EC2 に直接アクセスできない）
  - ポート 22:   自分の IP アドレスからのみ（SSH でサーバーに入るため）

ブロックするもの:
  - それ以外すべて
```

**今回の RDS のセキュリティグループ:**
```
許可するアクセス:
  - ポート 3306: EC2 のセキュリティグループからのみ（EC2 だけが DB に繋げる）

ブロックするもの:
  - それ以外すべて（インターネットから DB に直接アクセス不可）
```

---

### 4-2. EC2（Elastic Compute Cloud）

#### EC2 とは

AWS が提供する「仮想サーバー（クラウドのパソコン）」です。
Vercel では「サーバーの管理を Vercel が全部やってくれる」のに対し、
EC2 では「自分でサーバーの OS を管理する必要があります」。

#### 今回の設定

| 項目 | 設定値 | 理由 |
|---|---|---|
| インスタンスタイプ | `t2.micro` | 無料枠対象。メモリ1GB、vCPU1つ |
| OS | Amazon Linux 2023 | AWS 公式の最新 Linux |
| ストレージ | gp3 20GB | 無料枠は30GBまで |
| 起動するもの | Docker コンテナ（Next.js） | アプリを Docker で動かす |

#### Elastic IP とは

通常の EC2 は起動するたびに IP アドレスが変わります。
**Elastic IP** を使うと固定 IP アドレスを割り当てられるため、
CloudFront の向き先（Origin）として登録できます。

#### IAM Role とは

EC2 が「SSM Parameter Store から環境変数を読み取る」などの操作をするとき、
「この EC2 には○○の権限を与える」と定義するのが IAM Role です。

今回 EC2 には以下の権限を付与します：
- SSM Parameter Store の `/mybooklibrary/` 以下のパラメータを読み取る権限
- SSM Session Manager を使ってブラウザからサーバーに接続する権限（SSH の代替）

#### user_data.sh とは

EC2 が初めて起動したときに自動実行されるシェルスクリプトです。
ここに「Docker のインストール」「起動スクリプトの配置」などを書いておくと、
サーバーが立ち上がった時点で使える状態になります。

---

### 4-3. RDS（Relational Database Service）

#### RDS とは

AWS が提供する「マネージドデータベースサービス」です。
「マネージド」とは、OS のパッチ適用・バックアップ・フェイルオーバーなどを
AWS が自動でやってくれることを意味します。

Docker で MySQL を自分で動かすのに比べて、管理が楽になります。

#### 今回の設定

| 項目 | 設定値 | 理由 |
|---|---|---|
| インスタンスクラス | `db.t3.micro` | 無料枠対象 |
| エンジン | MySQL 8.4 | 現在の開発環境と同じバージョン |
| ストレージ | gp2 20GB | 無料枠は20GBまで |
| Multi-AZ | false（無効） | 有効にするとコスト2倍・無料枠外 |
| パブリックアクセス | false（無効） | セキュリティのためインターネットから直接接続不可 |
| バックアップ | 7日間 | 万が一のデータ復元に備える |

#### `connection_limit=5` について

db.t3.micro は MySQL の接続数の上限が約66件です。
Prisma はデフォルトで接続プールを多く張ろうとするため、制限を設けます。

```
DATABASE_URL="mysql://admin:password@xxxx.rds.amazonaws.com:3306/mybooklibrary?connection_limit=5"
```

---

### 4-4. CloudFront

#### CloudFront とは

AWS が提供する **CDN（Content Delivery Network）** です。
主な役割は以下の2つです：

1. **HTTPS の終端**: ユーザーとの通信を HTTPS（暗号化）にする
2. **キャッシュ**: 静的ファイル（JS・CSS・画像）を世界中のサーバーに配布し、
   ユーザーに近い場所から高速に配信する

#### なぜ CloudFront を使うか

EC2 に直接 HTTPS を設定すると、SSL 証明書の取得・更新を自分で管理する必要があります。
CloudFront を使えば AWS が証明書を管理してくれるため、手間がなくなります。

また、CloudFront を通すことで、EC2 の IP アドレスを直接公開せずに済みます。

#### TTL（Time To Live）とキャッシュの設定

| パスパターン | TTL | 意味 |
|---|---|---|
| すべてのページ（SSR） | 0秒 | キャッシュなし。毎回 EC2 に転送 |
| `_next/static/*` | 86400秒（1日） | Next.js が生成した JS・CSS はキャッシュOK |
| `/images/*` | 86400秒（1日） | 画像ファイルはキャッシュOK |

Next.js の SSR ページ（ログイン状態によって表示が変わるページなど）は
ユーザーごとに内容が違うため、キャッシュしてはいけません（TTL=0）。
一方、ビルド時に生成される JS・CSS ファイルは内容が変わらないためキャッシュできます。

#### CloudFront prefix list とは

CloudFront が EC2 に接続するときに使う「CloudFront のサーバーの IP アドレス一覧」です。
EC2 のセキュリティグループでこの prefix list からのアクセスのみ許可することで、
「CloudFront を経由したアクセスだけが EC2 に届く」という状態を作れます。
一般ユーザーが EC2 の IP アドレスを直接叩いてもアクセスできません。

---

### 4-5. SSM Parameter Store（シークレット管理）

#### SSM Parameter Store とは

環境変数やパスワードなどの「シークレット情報」を安全に保管する AWS のサービスです。

現在の開発環境では `.env.local` ファイルに書いている以下の情報を、
本番環境では SSM Parameter Store に保存します：

```
/mybooklibrary/DATABASE_URL       → DBの接続文字列
/mybooklibrary/AUTH_SECRET        → NextAuth.js の署名キー
/mybooklibrary/AUTH_GOOGLE_ID     → Google OAuth のクライアントID
/mybooklibrary/AUTH_GOOGLE_SECRET → Google OAuth のシークレット
/mybooklibrary/CRON_SECRET        → Cron API の認証トークン
/mybooklibrary/RAKUTEN_APP_ID     → 楽天ブックスAPIのID
/mybooklibrary/RAKUTEN_ACCESS_KEY → 楽天ブックスAPIのキー
/mybooklibrary/NEXTAUTH_URL       → アプリのURL（CloudFrontのドメイン）
```

#### なぜ `.env` ファイルではなく SSM を使うか

- `.env` ファイルは EC2 サーバー上にテキストとして置かれるためセキュリティリスクがある
- SSM の SecureString は KMS（AWS のキー管理サービス）で暗号化されて保存される
- IAM Role で「この EC2 だけが読める」という制御ができる
- GitHub にシークレットをコミットする必要がなくなる

#### EC2 での使い方

EC2 がアプリを起動するとき、以下のコマンドで SSM から環境変数を取得し、`.env` ファイルを生成します：

```bash
aws ssm get-parameters-by-path \
  --path "/mybooklibrary/" \
  --with-decryption \
  --query "Parameters[*].{Name:Name,Value:Value}" | \
  jq -r '.[] | (.Name | split("/") | last) + "=" + .Value' \
  > /opt/app/.env
```

---

### 4-6. Lambda + EventBridge Scheduler（Cron の代替）

#### Vercel Cron との比較

現在の `vercel.json` には以下の設定があります：

```json
{
  "crons": [
    {
      "path": "/api/cron/check-new-books",
      "schedule": "0 0 * * *"
    }
  ]
}
```

これは「毎日0時に `/api/cron/check-new-books` を呼び出す」という設定です。
Vercel 環境ではこれが自動で動きますが、AWS 環境では Vercel Cron が使えないため、
**Lambda + EventBridge Scheduler** で同じことを実現します。

#### Lambda とは

「サーバーを常時起動しておかなくても、必要なときだけプログラムを実行できる」サービスです。
月100万回まで永続的に無料です。今回は「API を HTTP で叩くだけ」という小さなプログラムを
Lambda として登録します。

#### EventBridge Scheduler とは

「○○時に Lambda を実行する」というスケジュール設定をするサービスです。
`cron(0 0 * * ? *)` という cron 記法で「毎日0時（JST）」を指定します。

#### 全体の流れ

```
毎日 JST 00:00
  → EventBridge Scheduler が Lambda を起動
  → Lambda が SSM から CRON_SECRET を取得
  → Lambda が以下のリクエストを送信:
      GET https://<CloudFrontドメイン>/api/cron/check-new-books
      Authorization: Bearer <CRON_SECRET>
  → Next.js の API Route が処理を実行（コード変更不要）
  → お気に入り著者の新刊チェック完了
```

**重要**: `/api/cron/check-new-books/route.ts` のコードは変更不要です。
Lambda がリクエストを送る相手が「Vercel のサーバー」から「CloudFront 経由の EC2」に変わるだけです。

---

### 4-7. ECR（Elastic Container Registry）

#### ECR とは

Docker イメージを保存する AWS 版の「プライベート Docker Hub」です。

#### なぜ ECR を使うか

Next.js アプリを Docker でビルドすると、`イメージ` というファイルが生成されます。
このイメージを EC2 に送るとき、一度 ECR にアップロードしておくと、
EC2 側から `docker pull` で取得できます。

#### デプロイの流れ

```
開発PC
  ↓ docker build（Dockerfileでビルド）
  ↓ docker push（ECRにアップロード）
ECR（イメージ保管）
  ↓ docker pull（EC2がECRからダウンロード）
EC2（docker run でアプリ起動）
```

---

## 5. Terraform のファイル構造の解説

```
terraform/
├── main.tf              # プロバイダー設定（「AWSを使う」「東京リージョン」など）
├── variables.tf         # 変数の定義（型・デフォルト値・説明）
├── outputs.tf           # apply後に表示する値（EC2のIP、CloudFrontのドメインなど）
├── terraform.tfvars     # 変数の実際の値（パスワードなど。.gitignore 必須）
├── terraform.tfvars.example  # tfvars のテンプレート（GitHubに含める）
│
└── modules/             # 機能ごとに分割したファイル群
    ├── networking/      # VPC・サブネット・SG など
    ├── ec2/             # EC2・Elastic IP・IAM
    ├── rds/             # RDS MySQL
    ├── cloudfront/      # CloudFront
    ├── secrets/         # SSM Parameter Store
    └── cron/            # Lambda + EventBridge
```

### main.tf の役割

```hcl
# 「Terraform で AWS を使う」という宣言
provider "aws" {
  region = "ap-northeast-1"  # 東京リージョン
}

# 各モジュールを呼び出す
module "networking" {
  source = "./modules/networking"
  ...
}
module "ec2" {
  source = "./modules/ec2"
  ...
}
```

### variables.tf と terraform.tfvars の違い

- **variables.tf**: 「この変数は string 型で、こんな意味の変数ですよ」という定義だけ書く
- **terraform.tfvars**: 「その変数の実際の値はこれです」を書く

```hcl
# variables.tf（定義）
variable "db_password" {
  type        = string
  description = "RDS MySQL のパスワード"
  sensitive   = true  # ログに表示しない
}

# terraform.tfvars（実際の値 ← Gitに含めない）
db_password = "MyStr0ngP@ssword!"
```

### modules/ に分割する理由

すべてを1つの `main.tf` に書くと何百行にもなって読みにくくなります。
機能ごとに `modules/` に分けることで、「ネットワークのことは networking/ を見ればいい」と
関心を分離できます。

### outputs.tf の役割

`terraform apply` が完了した後、必要な情報を表示します：

```hcl
output "cloudfront_domain" {
  value = module.cloudfront.domain_name
}
output "ec2_elastic_ip" {
  value = module.ec2.elastic_ip
}
output "rds_endpoint" {
  value = module.rds.endpoint
}
```

実行後に以下のように表示されます：
```
cloudfront_domain = "xxxxxxxxxx.cloudfront.net"
ec2_elastic_ip    = "54.xxx.xxx.xxx"
rds_endpoint      = "mybooklibrary-mysql.xxxxxx.ap-northeast-1.rds.amazonaws.com"
```

---

## 6. デプロイ手順の各ステップ解説

```
1. AWS CLI 設定 + EC2 キーペア作成
2. ECR リポジトリ作成
3. next.config.ts に output: "standalone" 追加
4. terraform.tfvars 作成
5. terraform init && terraform apply
6. SSM の DATABASE_URL と NEXTAUTH_URL を更新
7. Google OAuth リダイレクト URI を追加
8. deploy-app.sh 実行
9. prisma migrate deploy 実行
10. 動作確認
```

### ステップ 1: AWS CLI 設定

AWS CLI は「コマンドラインから AWS を操作するツール」です。
Terraform が内部的に AWS CLI を使って AWS のリソースを作成します。

```bash
aws configure
# AWS Access Key ID: （IAMで発行したキーID）
# AWS Secret Access Key: （IAMで発行したシークレット）
# Default region name: ap-northeast-1
# Default output format: json
```

**キーペア** は EC2 に SSH で接続するための「鍵」です。
SSH は「コマンドラインでサーバーに接続する方法」で、
トラブル時にサーバーに直接入って調査するために必要です。

### ステップ 3: `output: "standalone"` の追加

```typescript
// app/next.config.ts
const nextConfig = {
  output: "standalone",  // ← この1行を追加
};
```

これを追加すると、`npm run build` 時に `.next/standalone/` フォルダが生成され、
アプリの起動に必要なファイルだけがまとまります。
Docker イメージのサイズが大幅に小さくなります（数百MB → 数十MB）。

### ステップ 5: terraform apply

```bash
cd terraform/
terraform init    # 初回のみ
terraform plan    # プレビュー確認
terraform apply   # 実際に作成（「yes」と入力して確認）
```

`terraform plan` の出力例：
```
# aws_vpc.main will be created
+ resource "aws_vpc" "main" {
    + cidr_block = "10.0.0.0/16"
    ...
  }

Plan: 23 to add, 0 to change, 0 to destroy.
```

`+` マークがついているものが「新しく作られるリソース」です。

### ステップ 6: SSM の値を更新

`terraform apply` が終わると RDS のエンドポイントと CloudFront のドメインが確定します。
これらを使って SSM の値を更新します：

```bash
# RDS エンドポイントを含む DATABASE_URL を設定
aws ssm put-parameter \
  --name "/mybooklibrary/DATABASE_URL" \
  --value "mysql://admin:パスワード@<RDSエンドポイント>:3306/mybooklibrary?connection_limit=5" \
  --type SecureString \
  --overwrite

# CloudFront ドメインを NEXTAUTH_URL に設定
aws ssm put-parameter \
  --name "/mybooklibrary/NEXTAUTH_URL" \
  --value "https://<CloudFrontドメイン>" \
  --type SecureString \
  --overwrite
```

### ステップ 7: Google OAuth リダイレクト URI

Google でログインするとき、ログイン後に「どの URL に戻るか」を
Google Cloud Console に事前登録しておく必要があります。

AWS 移行後は URL が変わるため、
`https://<CloudFrontドメイン>/api/auth/callback/google` を追加します。

### ステップ 9: prisma migrate deploy

開発環境で作った DB のテーブル定義（マイグレーション）を本番 RDS に適用します：

```bash
# EC2 にSSHして実行
docker run --rm --env-file /opt/app/.env <ECRのイメージ> npx prisma migrate deploy
```

---

## 7. Vercel との違い

### なぜ AWS は構成が複雑になるか

| 項目 | Vercel | AWS（今回の構成） |
|---|---|---|
| HTTPS 設定 | 自動 | CloudFront で設定 |
| サーバー管理 | 不要 | EC2 の OS・Docker を自分で管理 |
| DB | 別途用意が必要（PlanetScale など） | RDS を自分で構築 |
| 環境変数 | Vercel ダッシュボードで設定 | SSM Parameter Store で管理 |
| Cron | vercel.json に書くだけ | Lambda + EventBridge を設定 |
| デプロイ | git push で自動 | deploy-app.sh を実行 |
| コスト（小規模） | 無料〜$20/月 | $0（12ヶ月）→ 約$23/月（13ヶ月以降） |

### Vercel の方が向いているケース

- 個人開発・小規模アプリ
- インフラ管理に時間をかけたくない
- 無料枠が終わってもコストを最小化したい

### AWS の方が向いているケース

- インフラを細かくコントロールしたい
- CI/CD パイプラインや監視を自前で整備したい
- 将来的にスケールアップしたい（EC2 → ECS Fargate、RDS マルチAZ など）
- 企業の要件でクラウドサービスに制約がある

### 今回の構成の制約

- **t2.micro は非力**: メモリ 1GB のため、Next.js SSR + MySQL クライアント接続が同居すると
  メモリが圧迫される可能性があります。本番トラフィックが増えたら `t3.small`（2GB）への
  アップグレードを検討してください。
- **Single AZ**: 今回は `multi_az = false` のため、データセンター障害時に DB が停止します。
  本番運用では `multi_az = true` にすることを推奨します（コストは約2倍）。
- **無料枠は12ヶ月**: AWS 無料枠の EC2・RDS は「アカウント作成から12ヶ月間」です。
  13ヶ月目以降は月約$23かかります。
