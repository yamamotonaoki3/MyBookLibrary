# MyBookLibrary

文学賞の受賞・ノミネート作品の読書進捗管理と、お気に入り著者の管理を行う Web アプリケーションです。

---

## 主な機能

- **読書ステータス管理** — 未読 / 読みたい / 読書中 / 読了 の4段階で記録
- **文学賞トラッキング** — 直木賞・芥川賞・本屋大賞・このミステリーがすごい！の受賞・ノミネート作品を一覧表示、読了率をプログレスバーで確認
- **お気に入り著者管理** — 著者をフォローして著作一覧を管理、新刊通知 ON/OFF
- **感想投稿・いいね** — ネタバレフラグ付きレビューの投稿・閲覧・いいね
- **通知** — お気に入り著者の新刊通知、レビューへのいいね通知
- **認証** — メール+パスワード / Google OAuth、アカウントロック機能
- **管理者機能** — 受賞登録・CSV 一括インポート・通報レビュー管理

---

## 技術スタック

| 役割 | 技術 |
| --- | --- |
| フロントエンド | Next.js 16 (React 19) + TypeScript |
| バックエンド | Next.js API Routes |
| データベース | MySQL 8.4 |
| ORM | Prisma 7 |
| 認証 | NextAuth.js v5 |
| スタイリング | Tailwind CSS v4 + shadcn/ui |
| テスト | Jest + ts-jest |
| コンテナ | Docker |
| 外部 API | 楽天ブックス API / 国立国会図書館 API |
| デプロイ | AWS（EC2 + RDS + CloudFront） |

---

## 起動手順

### 必要環境

- Node.js 20 以上
- Docker Desktop

### 1. リポジトリをクローン

```bash
git clone https://github.com/yamamotonaoki3/MyBookLibrary.git
cd MyBookLibrary
```

### 2. 環境変数を設定

```bash
cp app/.env.example app/.env.local
```

`.env.local` を編集して各値を設定してください（[環境変数一覧](#環境変数)を参照）。

### 3. データベースを起動

```bash
docker compose up -d
```

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

<http://localhost:3000> でアクセスできます。

---

## 環境変数

`app/.env.local` に以下の環境変数を設定してください。

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

# カバレッジ確認
npm run test -- --coverage
```

---

## ディレクトリ構成

```
MyBookLibrary/
├── app/                        # Next.js アプリケーション
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/         # 認証ページ（login, register, forgot-password）
│   │   │   ├── api/            # API ルート（30 エンドポイント）
│   │   │   ├── admin/          # 管理者ページ
│   │   │   ├── awards/         # 受賞作品一覧
│   │   │   ├── books/          # 本一覧・検索・詳細
│   │   │   ├── favorite-authors/ # お気に入り著者
│   │   │   ├── my-reviews/     # マイレビュー
│   │   │   ├── notifications/  # 通知
│   │   │   └── page.tsx        # ダッシュボード
│   │   ├── __tests__/          # Jest テスト
│   │   ├── auth.ts             # NextAuth.js 設定
│   │   ├── lib/                # ユーティリティ（Prisma, 楽天API, NDL API など）
│   │   └── types/              # TypeScript 型定義
│   ├── prisma/
│   │   ├── schema.prisma       # データベーススキーマ
│   │   └── migrations/         # マイグレーションファイル
│   └── package.json
├── docs/                       # ドキュメント
│   ├── requirements.md         # 要件定義書
│   ├── er-diagram.md           # ER 図
│   ├── screen-transition.md    # 画面遷移図
│   ├── wireframes.md           # ワイヤーフレーム
│   ├── aws-deploy-plan.md      # AWS デプロイ構成
│   └── aws-deploy-guide.md     # AWS デプロイガイド
└── docker-compose.yml          # MySQL 8.4 コンテナ定義
```

---

## ドキュメント

| ドキュメント | 説明 |
| --- | --- |
| [要件定義書](docs/requirements.md) | 機能要件・非機能要件・画面一覧・API 一覧 |
| [ER 図](docs/er-diagram.md) | データベーススキーマ図 |
| [画面遷移図](docs/screen-transition.md) | 画面間の遷移フロー |
| [ワイヤーフレーム](docs/wireframes.md) | 各画面のレイアウト設計 |
| [AWS デプロイプラン](docs/aws-deploy-plan.md) | Terraform による AWS 構成設計 |
