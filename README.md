# MyBookLibrary

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma)
![MySQL](https://img.shields.io/badge/MySQL-8.4-4479A1?logo=mysql&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 概要

**MyBookLibrary** は、文学賞の受賞・ノミネート作品を軸にした読書管理 Web アプリです。

直木賞・芥川賞・本屋大賞・このミステリーがすごい！の受賞作品を一覧で確認しながら、自分の読書進捗をトラッキングできます。「あの賞の作品、どれくらい読んだっけ？」という疑問にすぐ答えてくれるダッシュボードと、お気に入り著者の新刊通知機能が特徴です。

バーコードスキャンで本を素早く登録したり、他のユーザーの感想にいいねしたりと、読書をもっと楽しくする機能が揃っています。スマートフォンへのインストール（PWA）にも対応しているので、本棚のそばでもさっと使えます。

---

## 主な機能

### 読書ステータス管理
本ごとに「未読 / 読みたい / 読書中 / 読了」の4段階でステータスを記録できます。楽天ブックス API との連携で書籍情報を自動取得。カメラでバーコードをスキャンしての登録にも対応しています。

### 文学賞トラッキング
直木賞・芥川賞・本屋大賞・このミステリーがすごい！の受賞・ノミネート作品を一覧表示。年度フィルターで絞り込み、賞ごとの読了率をプログレスバーで確認できます。

### お気に入り著者管理
著者をフォローして著作一覧を管理できます。新刊通知 ON/OFF を著者ごとに設定でき、お気に入り著者が新刊を出したときに通知が届きます。

### 感想・レビュー
本ごとに感想（10〜2000文字）を投稿できます。ネタバレフラグ付きで投稿でき、他のユーザーの感想にいいねや通報もできます。

### 通知
お気に入り著者の新刊通知・レビューへのいいね通知を受け取れます。未読件数はサイドバーのベルアイコンでいつでも確認できます。

### 管理者機能
受賞作品の登録（楽天 API から自動取得 / CSV 一括インポート）、通報されたレビューの管理、ユーザー数・レビュー数などの統計ダッシュボードを提供します。

---

## 技術スタック

| 役割 | 技術 |
| --- | --- |
| フロントエンド | Next.js 16 (React 19) + TypeScript |
| バックエンド | Next.js API Routes（同一プロジェクト内） |
| データベース | MySQL 8.4 |
| ORM | Prisma 7 |
| 認証 | NextAuth.js v5（メール+パスワード / Google OAuth） |
| スタイリング | Tailwind CSS v4 + shadcn/ui |
| PWA | @ducanh2912/next-pwa（Service Worker 自動生成） |
| テスト | Jest + ts-jest |
| コンテナ | Docker（開発時の MySQL 用） |
| 外部 API | 楽天ブックス API / 国立国会図書館 API（NDL） |
| デプロイ | AWS（EC2 + RDS + CloudFront） |

---

## 起動手順

### 必要環境

| ツール | バージョン |
| --- | --- |
| Node.js | 20 以上 |
| Docker Desktop | 最新安定版 |

### 1. リポジトリをクローン

```bash
git clone https://github.com/yamamotonaoki3/MyBookLibrary.git
cd MyBookLibrary
```

### 2. 環境変数を設定

```bash
cp app/.env.example app/.env.local
```

`app/.env.local` を開いて各値を設定してください（[環境変数一覧](#環境変数一覧)を参照）。

> **最低限必要な設定**: `DATABASE_URL`・`RAKUTEN_APP_ID`・`AUTH_SECRET` の3つを設定すれば開発環境は動作します。

### 3. データベースを起動

```bash
docker compose up -d
```

MySQL 8.4 コンテナが起動します。初回は数秒かかる場合があります。

### 4. 依存パッケージをインストール＆マイグレーション

```bash
cd app
npm install
npx prisma migrate deploy
```

### 5. 開発サーバーを起動

```bash
npm run dev
```

ブラウザで <http://localhost:3000> を開くとアプリにアクセスできます。

---

## 環境変数一覧

`app/.env.local` に以下の環境変数を設定してください。

| 変数名 | 必須 | 説明 |
| --- | --- | --- |
| `DATABASE_URL` | 必須 | MySQL の接続文字列 |
| `RAKUTEN_APP_ID` | 必須 | 楽天アプリ ID（[楽天デベロッパー](https://webservice.rakuten.co.jp/)で取得） |
| `RAKUTEN_ACCESS_KEY` | 任意 | 楽天アクセスキー |
| `AUTH_SECRET` | 必須 | NextAuth.js のシークレット（`openssl rand -base64 32` で生成） |
| `AUTH_GOOGLE_ID` | 任意 | Google OAuth クライアント ID |
| `AUTH_GOOGLE_SECRET` | 任意 | Google OAuth クライアントシークレット |
| `CRON_SECRET` | 任意 | 新刊チェック Cron の Bearer トークン |

```env
# データベース
DATABASE_URL="mysql://mysql:mysql@localhost:3306/mybooklibrary"

# 楽天ブックス API
RAKUTEN_APP_ID=""
RAKUTEN_ACCESS_KEY=""

# NextAuth.js
AUTH_SECRET=""

# Google OAuth（オプション）
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""

# Cron 認証トークン（AWS Lambda から呼び出す際に使用）
CRON_SECRET=""
```

---

## テスト

```bash
cd app

# 全テスト実行
npm run test

# 特定ファイルのみ実行
npx jest --testPathPatterns="validations"
npx jest --testPathPatterns="api/auth"

# カバレッジレポートを確認
npm run test -- --coverage
```

---

## ディレクトリ構成

```
MyBookLibrary/
├── app/                          # Next.js アプリケーション
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/           # 認証ページ（login / register / forgot-password）
│   │   │   ├── api/              # API ルート（31 エンドポイント）
│   │   │   ├── admin/            # 管理者ページ
│   │   │   ├── awards/           # 受賞作品一覧
│   │   │   ├── books/            # 本一覧・検索・詳細
│   │   │   ├── favorite-authors/ # お気に入り著者
│   │   │   ├── my-reviews/       # マイレビュー
│   │   │   ├── notifications/    # 通知
│   │   │   └── page.tsx          # ダッシュボード
│   │   ├── __tests__/            # Jest テスト
│   │   ├── auth.ts               # NextAuth.js 設定
│   │   ├── lib/                  # ユーティリティ（Prisma / 楽天 API / NDL API など）
│   │   └── types/                # TypeScript 型定義
│   ├── prisma/
│   │   ├── schema.prisma         # データベーススキーマ
│   │   └── migrations/           # マイグレーションファイル
│   ├── public/
│   │   ├── icons/                # PWA 用アイコン
│   │   └── manifest.json         # PWA マニフェスト
│   └── package.json
├── docs/                         # ドキュメント
│   ├── requirements.md           # 要件定義書
│   ├── er-diagram.md             # ER 図
│   ├── screen-transition.md      # 画面遷移図
│   ├── wireframes.md             # ワイヤーフレーム
│   ├── aws-deploy-plan.md        # AWS デプロイ構成
│   └── aws-deploy-guide.md       # AWS デプロイガイド
└── docker-compose.yml            # MySQL 8.4 コンテナ定義
```

---

## ドキュメント

より詳しい仕様は `docs/` フォルダのドキュメントを参照してください。

| ドキュメント | 説明 |
| --- | --- |
| [要件定義書](docs/requirements.md) | 機能要件・非機能要件・画面一覧・API 一覧 |
| [ER 図](docs/er-diagram.md) | データベーススキーマ図 |
| [画面遷移図](docs/screen-transition.md) | 画面間の遷移フロー |
| [ワイヤーフレーム](docs/wireframes.md) | 各画面のレイアウト設計 |
| [AWS デプロイプラン](docs/aws-deploy-plan.md) | Terraform による AWS 構成設計 |
| [AWS デプロイガイド](docs/aws-deploy-guide.md) | デプロイ手順 |

---

## トラブルシューティング

**`DATABASE_URL` に関するエラーが出る**
Docker が起動していない可能性があります。`docker compose up -d` を実行してから再試行してください。

**`AUTH_SECRET` が未設定でエラーになる**
ターミナルで `openssl rand -base64 32` を実行して生成した値を `.env.local` に設定してください。

**楽天 API のレート制限（429 エラー）**
楽天ブックス API は短時間に多数リクエストを送ると制限されます。アプリ側で自動リトライ処理を実装済みですが、しばらく待ってから再試行してください。

---

## ライセンス

[MIT](LICENSE)
