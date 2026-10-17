# MyBookLibrary

文学賞の受賞・ノミネート作品の読書進捗管理と、お気に入り著者の管理を行う Web アプリケーション。

## ライブデモ

**https://mybooklibrary-demo.nyproducts.workers.dev**

誰でも触れるデモ環境です（Cloudflare Workers + D1）。次のデモアカウントでログインできます。

| 項目 | 内容 |
| --- | --- |
| メールアドレス | `demo_sakura@example.com` |
| パスワード | ログイン画面に表示されています |

> **ご利用上の注意**
>
> - ユーザー・読書状況・レビューなどは、すべて**架空のデータ**です（賞・本・著者・受賞は、実在の作品のデータです）。共有のデモ環境のため、投稿やデータは**予告なく初期化されます**（毎日 JST 3:00 に初期化）。
> - **個人情報・実在のメールアドレスを入力しないでください。**
> - デモ用のため、新規登録・パスワード変更・退会・問い合わせの送信・Google ログインなど、一部の機能は制限されています。
> - ログイン状態は、操作がなければ 15 分で切れます。
> - 管理者機能は公開していません。下記の「[デモ](#デモ)」の GIF・スクリーンショットをご覧ください。

構成と保護の方針は [デモ環境の方針と構成](docs/demo-environment.md) を参照してください。

## 主な機能

- **読書ステータス管理** — 未読 / 読みたい / 読書中 / 読了 の4段階で管理
- **文学賞作品一覧** — 直木賞・芥川賞・本屋大賞・このミステリーがすごい！の受賞・ノミネート作品を一覧表示し、読了率をプログレスバーで確認
- **本の検索** — 楽天ブックス API 連携。カメラでバーコードをスキャンして ISBN 検索も可能
- **お気に入り著者管理** — 著者ごとに新刊通知 ON/OFF を設定でき、著者ベースのおすすめも表示
- **レビュー・いいね・通報** — ネタバレフラグ付きで感想を投稿し、他ユーザーのレビューにいいね・通報できる
- **フォロー** — ユーザー同士をフォローし、フォロー一覧・おすすめフォロー候補を確認できる
- **近隣図書館の在庫確認** — 図書館を最大5館登録し、カーリル API で貸出状況をリアルタイム確認
- **通知** — 新刊・いいね・フォロー通知をアプリ内で受け取れる（PWA バッジ表示対応）
- **認証** — メール＋パスワード / Google OAuth。ログイン失敗 10 回で 15 分ロック。新規登録時に任意で合言葉を設定でき、合言葉によるパスワードリセットに対応
- **PWA** — ホーム画面へのインストール・スタンドアロン起動対応
- **お問い合わせ** — カテゴリ（バグ報告・機能要望など）を選択してフォームから問い合わせを送信できる
- **設定** — アカウント情報（名前・メール・ロール）の確認・合言葉設定・アカウント削除
- **管理者機能** — 受賞登録・CSV 一括インポート／エクスポート・手動書籍登録／マージ・通報レビュー削除・ユーザー管理・お問い合わせ管理・監査ログ閲覧・統計ダッシュボード。ほかのユーザーのメールアドレスは既定でマスク表示で、「表示」ボタンで確認したときは監査ログに記録される

## デモ

### ダッシュボード

![ダッシュボード](docs/demos/dashboard-small.gif)

### バーコードスキャンで本を検索

![バーコードスキャンで本を検索](docs/demos/barcode-scan-small.gif)

### 管理者機能

管理者の画面（ユーザー管理 → 手動登録本の管理 → 通報されたレビュー → お問い合わせ → 監査ログ）です。ローカル環境で、架空のデータを使って撮影しました。メールアドレスは既定でマスクされ、「表示」ボタンで全体を確認すると、監査ログに記録されます。

![管理者機能](docs/images/demo/admin-demo.gif)

| ユーザー管理（「表示」でメールを確認） | 監査ログ（表示の記録） |
| --- | --- |
| ![ユーザー管理](docs/images/demo/admin-03-users-revealed.png) | ![監査ログの詳細](docs/images/demo/admin-08-audit-logs-detail.png) |

動画（[mp4](docs/images/demo/admin-demo.mp4)・[webm](docs/images/demo/admin-demo.webm)）と、各画面のスクリーンショット（`docs/images/demo/`）もあります。

## 技術スタック

| 役割 | 技術 |
| --- | --- |
| フロントエンド | Next.js 16 (React 19) + TypeScript |
| バックエンド | Next.js API Routes |
| データベース | Cloudflare D1（SQLite。本番・ステージング・デモ）／ MySQL 8.4（ローカル開発） |
| ORM | Prisma 6 |
| 認証 | Auth.js (NextAuth.js) v5（メール＋パスワード・Google OAuth） |
| バリデーション | Zod v4 |
| スタイリング | Tailwind CSS v4 + shadcn/ui |
| テスト | Jest + ts-jest、Playwright（E2E） |
| コンテナ | Docker（開発時の MySQL 用） |
| 外部 API | 楽天ブックス API・国立国会図書館 API（NDL）・カーリル API |
| PWA | @ducanh2912/next-pwa |
| デプロイ | Cloudflare Workers（OpenNext）+ D1。`main` → ステージング、`production` → 本番、`demo` → デモを、Workers Builds で自動デプロイ（[手順](docs/cloudflare-deploy.md)） |

AWS（EC2 + RDS + CloudFront。Terraform 管理）は、現在すべて停止中です。いつでも再開できるよう、定義と手順だけ残しています（[AWS デプロイガイド](docs/aws/aws-deploy-guide.md)）。

E2E テストには Playwright を使用（詳細は下記「テスト」参照）。

## 開発環境の起動

ローカル開発は、Docker の MySQL を使います。Cloudflare Workers での動作確認（ビルド・プレビュー・D1）は [Cloudflare へのデプロイ](docs/cloudflare-deploy.md) を参照してください。

```bash
# 0. Docker Compose 用の環境変数を設定（初回のみ）
cp .env.example .env
# .env を編集して DB_MYSQL_ROOT_PASSWORD などを設定（推測されにくい値にする）

# 1. MySQL を起動
docker compose up -d

# 2. 依存パッケージをインストール（初回のみ）
cd app
npm install

# 3. 環境変数を設定（初回のみ）
cp .env.local.example .env.local
# .env.local を編集して DATABASE_URL などを設定

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
│   ├── prisma/               # Prisma スキーマ・マイグレーション（MySQL 用と、D1 用の prisma/d1）
│   ├── public/               # 静的ファイル・PWA アイコン
│   ├── wrangler.jsonc        # Cloudflare Workers / D1 の設定
│   └── src/
│       ├── app/              # App Router（ページ・API Routes）
│       │   ├── api/          # API エンドポイント
│       │   ├── _components/  # 共通コンポーネント
│       │   └── (auth)/       # 認証ページ（login・register・forgot-password）
│       ├── lib/              # サーバーサイドのユースケース・ユーティリティ
│       ├── repositories/     # Prisma によるデータアクセス
│       ├── types/            # TypeScript 型定義
│       └── __tests__/        # Jest テスト
├── docs/                     # ドキュメント（要件定義・ER図・手順書など）
├── terraform/                # AWS インフラ定義（Terraform。停止中）
└── docker-compose.yml        # 開発用 MySQL コンテナ
```

## ドキュメント

一覧は [ドキュメント索引](docs/README.md) を参照する（現役の文書・停止中の AWS 構成・作業が完了した記録に分けている）。主なもの:

- [要件定義書](docs/requirements.md)・[機能別定義書](docs/features/)・[API 仕様書](docs/api-spec.md)・[ER 図](docs/er-diagram.md)
- [画面遷移図](docs/screen-transition.md)・[ワイヤーフレーム](docs/wireframes.md)
- [Cloudflare へのデプロイ](docs/cloudflare-deploy.md)・[本番切り替え手順書](docs/d1-cutover-runbook.md)・[デモ環境の方針と構成](docs/demo-environment.md)
- [テスト計画表](docs/test-plan.md)・[テスト依存関係マップ](docs/test-dependency-map.md)
- [学び・手直しの記録](docs/lessons-learned.md)
- [AWS 構成（停止中）](docs/aws/README.md)
- [移行計画（アーカイブ）](docs/archive/cloudflare-d1-migration-plan.md)

## テスト

Jest + ts-jest によるブラックボックス（API結合テスト）・ホワイトボックス（`src/lib` の単体テスト）の両方式でテストしている。対象範囲と進捗は [テスト計画表](docs/test-plan.md) を参照。

```bash
cd app
npm test
```

### 実DB統合テスト

`docker-compose.yml` の `db-test` サービス（開発用DBとは別、ポート3307）に対して実行する。初回のみ `.env.example` / `app/.env.test.example` を参考に `.env` / `app/.env.test` を作成する。

```bash
docker compose up -d db-test
cd app
npm run test:integration
```

### E2E（Playwright）

ローカルでは初回のみブラウザのインストールが必要（CIでは自動インストールされる）。

```bash
cd app
npx playwright install chromium
npm run test:e2e
```

`app/.env.test` の接続情報を使い、DBは自動でリセット・シードされる。外部API（楽天・NDL・カーリル）はローカルのスタブサーバーに向くため、実際の外部通信は発生しない（詳細は [テスト依存関係マップ](docs/test-dependency-map.md) を参照）。

## シークレットの取り扱い

環境変数の実値はリポジトリに置かない。配置先と Gitleaks / pre-commit の導入手順は [環境変数とシークレットの管理](docs/secrets-management.md) を参照する。
