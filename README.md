# MyBookLibrary

文学賞の受賞・ノミネート作品の読書進捗管理と、お気に入り著者の管理を行う Web アプリケーション。

## 主な機能

- **読書ステータス管理** — 未読 / 読みたい / 読書中 / 読了 の4段階で管理
- **文学賞作品一覧** — 直木賞・芥川賞・本屋大賞・このミステリーがすごい！の受賞・ノミネート作品を一覧表示し、読了率をプログレスバーで確認
- **本の検索** — 楽天ブックス API 連携。カメラでバーコードをスキャンして ISBN 検索も可能
- **お気に入り著者管理** — 著者ごとに新刊通知 ON/OFF を設定できる
- **レビュー・いいね・通報** — ネタバレフラグ付きで感想を投稿し、他ユーザーのレビューにいいね・通報できる
- **通知** — 新刊・いいね通知をアプリ内で受け取れる（PWA バッジ表示対応）
- **認証** — メール＋パスワード / Google OAuth。ログイン失敗 10 回で 15 分ロック
- **PWA** — ホーム画面へのインストール・スタンドアロン起動対応
- **お問い合わせ** — カテゴリ（バグ報告・機能要望など）を選択してフォームから問い合わせを送信できる
- **設定** — アカウント情報（名前・メール・ロール）の確認・アカウント削除
- **管理者機能** — 受賞登録・CSV 一括インポート・通報レビュー削除・ユーザー管理・お問い合わせ管理・統計ダッシュボード

## デモ

### ダッシュボード

![ダッシュボード](docs/demos/dashboard-small.gif)

### バーコードスキャンで本を検索

![バーコードスキャンで本を検索](docs/demos/barcode-scan-small.gif)

## 技術スタック

| 役割 | 技術 |
| --- | --- |
| フロントエンド | Next.js 16 (React 19) + TypeScript |
| バックエンド | Next.js API Routes |
| データベース | MySQL 8.4 |
| ORM | Prisma 6 |
| 認証 | NextAuth.js v5（メール＋パスワード・Google OAuth） |
| バリデーション | Zod v4 |
| スタイリング | Tailwind CSS v4 + shadcn/ui |
| テスト | Jest + ts-jest |
| コンテナ | Docker（開発時の MySQL 用） |
| 外部 API | 楽天ブックス API・国立国会図書館 API（NDL） |
| PWA | @ducanh2912/next-pwa |
| デプロイ | AWS（EC2 + RDS + CloudFront） |

## 開発環境の起動

```bash
# 1. MySQL を起動
docker compose up -d

# 2. 依存パッケージをインストール（初回のみ）
cd app
npm install

# 3. 環境変数を設定（初回のみ）
cp .env.example .env
# .env を編集して DATABASE_URL などを設定

# 4. データベースのマイグレーション（初回のみ）
npx prisma migrate dev

# 5. 開発サーバーを起動
npm run dev
```

ブラウザで http://localhost:3000 を開く。

## ディレクトリ構成

```
MyBookLibrary/
├── app/                      # Next.js アプリケーション本体
│   ├── prisma/               # Prisma スキーマ・マイグレーション
│   ├── public/               # 静的ファイル・PWA アイコン
│   └── src/
│       ├── app/              # App Router（ページ・API Routes）
│       │   ├── api/          # API エンドポイント
│       │   └── (auth)/       # 認証ページ（login・register・forgot-password）
│       ├── lib/              # サーバーサイドユーティリティ
│       ├── types/            # TypeScript 型定義
│       └── __tests__/        # Jest テスト
├── docs/                     # ドキュメント（要件定義・ER図・画面遷移図など）
├── terraform/                # AWS インフラ定義（Terraform）
└── docker-compose.yml        # 開発用 MySQL コンテナ
```

## ドキュメント

- [要件定義書](docs/requirements.md)
- [ER 図](docs/er-diagram.md)
- [画面遷移図](docs/screen-transition.md)
- [ワイヤーフレーム](docs/wireframes.md)
- [AWS デプロイガイド](docs/aws-deploy-guide.md)

## テスト

```bash
cd app
npm test
```
