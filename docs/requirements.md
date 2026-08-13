# MyBookLibrary 要件定義書

## 1. アプリ概要

文学賞の受賞・ノミネート作品の読書進捗管理と、お気に入り著者の管理を行う Web アプリケーション。複数のユーザーが利用できる（ユーザー登録・ログイン機能あり）。

---

## 2. 対象文学賞

| 賞名 | 主催 | 備考 |
| --- | --- | --- |
| 直木賞 | 日本文学振興会 | 年2回（上半期・下半期） |
| 芥川賞 | 日本文学振興会 | 年2回（上半期・下半期） |
| 本屋大賞 | 本屋大賞実行委員会 | 年1回 |
| このミステリーがすごい！ | 宝島社 | 年1回 |

---

## 3. 機能要件（実装済み）

### 3.1 認証・アカウント管理

メール＋パスワード・Google OAuth によるログイン、新規登録時の合言葉任意設定、合言葉によるパスワードリセット、ロール管理、アカウント削除を含む認証・アカウント管理機能。

→ 詳細は [認証・アカウント管理 機能定義書](./features/auth.md) を参照。

### 3.2 読書ステータス管理

本ごとに「未読・読みたい・読書中・読了」の4段階で読書状態を記録・変更できる機能。

→ 詳細は [読書ステータス管理 機能定義書](./features/reading-status.md) を参照。

### 3.3 本の一覧・検索

楽天ブックス API 連携の書籍検索・バーコードスキャン登録・手動書籍登録・マイ本一覧の絞り込み表示機能。

→ 詳細は [本の一覧・検索 機能定義書](./features/book-search.md) を参照。

### 3.4 受賞・ノミネート作品一覧・読書進捗管理

直木賞・芥川賞・本屋大賞・このミステリーがすごい！の受賞・ノミネート作品を一覧表示し、読書進捗をプログレスバーで確認できる機能。

→ 詳細は [受賞・ノミネート作品一覧 機能定義書](./features/awards.md) を参照。

### 3.5 お気に入り著者管理

著者登録・書籍一覧の閲覧・読書ステータス管理・新刊通知の ON/OFF 切り替えができる機能。

→ 詳細は [お気に入り著者管理 機能定義書](./features/favorite-authors.md) を参照。

### 3.6 感想投稿・一覧

本ごとに感想（レビュー）を投稿・編集・削除でき、他ユーザーの感想も閲覧できる機能（10〜2000 文字・ネタバレフラグあり・公開／非公開選択あり）。

→ 詳細は [感想投稿・一覧 機能定義書](./features/reviews.md) を参照。

### 3.7 いいね・通報

他ユーザーの感想へのいいね（1人1回）と、不適切な感想の通報（1人1回）ができる機能。

→ 詳細は [いいね・通報 機能定義書](./features/likes-reports.md) を参照。

### 3.8 通知

新刊通知・いいね通知をアプリ内で受け取り、既読管理できる機能。PWA インストール時はアイコンバッジにも反映される。

→ 詳細は [通知 機能定義書](./features/notifications.md) を参照。

### 3.9 管理者機能

受賞登録（賞タブ＋年度フィルター付き一覧）・CSV インポート・手動登録書籍の管理／マージ・受賞データ CSV エクスポート・通報レビュー管理・ユーザー管理・お問い合わせ管理・監査ログ閲覧・統計確認など、管理者専用の操作機能（`admin` ロールのみ）。管理者パネルは「設定・管理・監査ログ」の3タブ構成。

→ 詳細は [管理者機能 機能定義書](./features/admin.md) を参照。

### 3.10 新刊チェック（Cron）

AWS EventBridge Scheduler + Lambda で毎日定期実行し、お気に入り著者の新刊を自動検出してユーザーに通知する機能。

→ 詳細は [新刊チェック（Cron）機能定義書](./features/cron.md) を参照。

### 3.11 お問い合わせ

カテゴリ・件名・本文を入力してお問い合わせを送信できる機能。管理者が管理パネルから確認・ステータス管理できる。

→ 詳細は [お問い合わせ 機能定義書](./features/contact.md) を参照。

---

### 3.12 近隣図書館の在庫確認

ユーザーが近くの図書館を最大5館登録し、カーリル API で貸出状況をリアルタイム確認できる機能。

→ 詳細は [近隣図書館の在庫確認 機能定義書](./features/library.md) を参照。

### 3.13 フォロー機能

ユーザー同士がフォロー・フォロー解除でき、フォロー中ユーザーの一覧を確認できる機能。同じ著者をお気に入り登録している他ユーザーを、共通著者数の多い順におすすめフォロー候補として提示する。

→ 詳細は [フォロー機能 機能定義書](./features/follow.md) を参照。

### 3.14 監査ログ

管理者操作・合言葉更新などの重要イベントを記録し、管理者パネルの監査ログタブから閲覧できる機能。

→ 詳細は [管理者機能 機能定義書](./features/admin.md) を参照。

---

## 4. 非機能要件

### パフォーマンス

- ページ表示：3秒以内
- API 応答：1秒以内

### セキュリティ

- パスワードのハッシュ化（bcryptjs、salt: 12）
- HTTPS 通信（AWS CloudFront が対応）
- SQL インジェクション対策（Prisma ORM が対応）
- 不正ログイン対策（10回失敗で 15 分ロック）
- Cron エンドポイントを Bearer トークンで保護

### ユーザビリティ

- スマホ・PC 両対応（レスポンシブデザイン）
- 日本語のみ対応
- PWA 対応（ホーム画面へのインストール、スタンドアロン起動）

### 保守性

- Zod によるリクエストバリデーション
- Jest によるユニットテスト（バリデーション・ユーティリティ・API ルート）
- 楽天ブックス API の 429 エラー時にリトライ処理を実装

### 監視

- AWS CloudWatch でエラーアラート・アクセス数・パフォーマンスを監視する

---

## 5. 技術スタック

| 役割 | 技術 |
| --- | --- |
| フロントエンド | Next.js 16 (React 19) + TypeScript |
| バックエンド | Next.js API Routes（同一プロジェクト内） |
| データベース | MySQL 8.4 |
| ORM | Prisma 6 |
| 認証 | NextAuth.js v5（メール＋パスワード・Google OAuth） |
| バリデーション | Zod v4 |
| スタイリング | Tailwind CSS v4 + shadcn/ui |
| テスト | Jest + ts-jest |
| コンテナ | Docker（開発時の MySQL 用） |
| 外部 API | 楽天ブックス API・国立国会図書館 SRU API（NDL）・カーリル API |
| PWA | @ducanh2912/next-pwa（Service Worker 自動生成） |
| デプロイ | AWS（EC2 + RDS + CloudFront） |

---

## 6. 書籍データ取得方針

| データ | 取得方法 |
| --- | --- |
| 書影・タイトル・著者名・出版年 | 楽天ブックス API（自動） |
| 著者検索（フォールバック） | 国立国会図書館 SRU API（楽天で0件時） |
| ISBN 検索（フォールバック） | 国立国会図書館 SRU API（楽天で0件時） |
| 絶版・旧版 ISBN 検索（管理者） | 国立国会図書館 SRU API（管理者画面の NDL モード） |
| 図書館在庫・貸出状況 | カーリル API（ISBN 指定、登録図書館分をリアルタイム取得） |
| 受賞・ノミネート情報 | 管理者画面から半自動登録 |
| 過去の受賞・ノミネートデータ | CSV 一括インポート |
| 新刊情報 | 楽天ブックス API で著者名検索して自動取得（Cron） |

---

## 7. 画面一覧

### 認証画面

| パス | 画面名 | 説明 |
| --- | --- | --- |
| `/login` | ログイン画面 | メール+パスワード・Google OAuth でログイン |
| `/register` | ユーザー登録画面 | 新規アカウント作成（合言葉の任意設定を含む） |
| `/forgot-password` | パスワードリセット画面 | メールアドレス確認→合言葉照合→パスワード再設定（3ステップ） |

### メイン画面

| パス | 画面名 | 説明 |
| --- | --- | --- |
| `/` | ダッシュボード | 統計カード・文学賞進捗・お気に入り著者進捗・最近の読書記録 |
| `/books` | マイ本一覧 | ステータス別・著者別フィルター付き |
| `/books/search` | 本の検索 | 楽天ブックス API 連携で書籍を検索・追加（バーコードスキャン対応） |
| `/books/[id]` | 本の詳細 | 読書ステータス変更・全ユーザーのレビュー一覧 |
| `/books/[id]/reviews/new` | レビュー作成 | 感想投稿フォーム（ネタバレフラグあり） |
| `/books/isbn/[isbn]` | ISBN 書籍詳細 | ISBN 指定で直接書籍詳細へ遷移 |
| `/awards` | 受賞作品一覧 | 賞タブ・年度フィルター・読了率プログレスバー |
| `/favorite-authors` | お気に入り著者一覧 | 著者一覧・新刊通知 ON/OFF・著者検索追加 |
| `/favorite-authors/[authorId]` | 著者別書籍一覧 | 著者の全書籍・読書ステータス変更 |
| `/my-reviews` | マイレビュー | 自分の投稿一覧・編集・削除 |
| `/notifications` | 通知 | 新刊・いいね通知一覧・既読管理 |
| `/settings` | 設定 | アカウント情報の確認（モーダル）・近隣図書館の登録・フォロー一覧へのリンク・アカウント削除（一般ユーザーのみ） |
| `/settings/follows` | フォロー一覧 | フォロー中・フォロワーの一覧確認、おすすめフォロー候補の表示 |
| `/users/[id]` | ユーザー詳細 | 他ユーザーのプロフィール・投稿レビュー確認・フォロー／フォロー解除 |
| `/contact` | お問い合わせ | カテゴリ・件名・本文の入力フォーム・送信 |

### 管理者画面

| パス | 画面名 | 説明 |
| --- | --- | --- |
| `/admin` | 管理者パネル | 「設定」「管理」「監査ログ」の3タブ構成：書籍登録（楽天/NDL）・手動登録書籍の管理／マージ・近隣図書館の登録・受賞管理・CSV インポート／エクスポート・通報レビュー削除・ユーザー管理・お問い合わせ管理・統計・監査ログ閲覧 |
| `/admin/audit-logs` | 監査ログ | 管理者操作・合言葉更新などの監査ログ一覧（`/admin` の監査ログタブと同内容を単独ページとしても提供） |

---

## 8. 認証フロー

### Credentials 認証

1. メールアドレス＋パスワードで認証
2. ログイン失敗時：`loginFailCount` をインクリメント
3. 10 回失敗で `lockedUntil` を現在時刻 + 15 分に設定
4. ロック中はログイン不可（残り試行回数を `/api/auth/remaining-attempts` で取得可能）
5. パスワードリセット成功時に `loginFailCount` と `lockedUntil` をリセット

### パスワードリセット（合言葉方式）

1. メールアドレスを確認する（`step: "check"`）。合言葉が未設定の場合はエラーとし、設定を促す通知を送る
2. 合言葉を照合する（`step: "verifySecretWord"`）。10 回失敗で `secretWordLockedUntil` を現在時刻 + 15 分に設定
3. 合言葉を再検証したうえでパスワードを更新する（`step: "reset"`）
4. リセット成功時に `loginFailCount`・`lockedUntil`・`secretWordFailCount`・`secretWordLockedUntil` をすべてリセット

### Google OAuth

1. Google アカウントでログイン → `Account` テーブルに OAuth 情報を保存
2. Google アカウントユーザーはパスワードリセット不可（`GOOGLE_ACCOUNT` エラーを返す）

### セッション

- JWT ストラテジー（`strategy: "jwt"`）
- トークンにユーザー ID（String 型）とロールを含める
- `/admin` パスへのアクセスは `role === "admin"` チェック

---

## 9. API エンドポイント一覧

### 認証

| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/api/auth/register` | ユーザー登録（合言葉は任意） |
| POST | `/api/auth/reset-password` | パスワードリセット（step: check/verifySecretWord/reset） |
| GET | `/api/auth/remaining-attempts` | ログイン試行残回数確認 |

### ユーザー

| メソッド | パス | 説明 |
| --- | --- | --- |
| DELETE | `/api/user/delete` | 自分のアカウント削除（管理者は不可） |
| POST | `/api/user/secret-word` | 合言葉の設定・変更（パスワードリセットの代替本人確認手段） |

### 書籍・読書ステータス

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/books/search` | 楽天 API で書籍検索 |
| GET | `/api/books/isbn` | ISBN で書籍情報を取得 |
| GET | `/api/books/reading` | 読書中・読了の本一覧 |
| GET | `/api/books/[id]` | 本の詳細取得 |
| PATCH | `/api/books/[id]` | 本の編集（手動登録のみ） |
| DELETE | `/api/books/[id]` | 本の削除（手動登録のみ） |
| POST | `/api/reading-status` | 読書ステータス登録・更新 |

### レビュー

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/reviews` | 自分のレビュー一覧 |
| POST | `/api/reviews` | レビュー作成 |
| PATCH | `/api/reviews/[id]` | レビュー編集 |
| DELETE | `/api/reviews/[id]` | レビュー削除 |
| POST | `/api/reviews/[id]/likes` | いいね追加 |
| DELETE | `/api/reviews/[id]/likes` | いいね解除 |
| POST | `/api/reviews/[id]/report` | レビュー通報 |
| DELETE | `/api/reviews/[id]/report` | 通報取り消し |
| GET | `/api/reviews/stats` | レビュー統計 |

### 著者・お気に入り著者

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/authors` | 著者一覧 |
| GET | `/api/authors/search` | 著者検索 |
| GET | `/api/favorite-authors` | お気に入り著者一覧 |
| POST | `/api/favorite-authors` | 著者をお気に入り登録 |
| PATCH | `/api/favorite-authors/[authorId]` | 新刊通知 ON/OFF 切り替え |
| DELETE | `/api/favorite-authors/[authorId]` | お気に入りから削除 |
| GET | `/api/favorite-authors/[authorId]/books` | 著者の書籍一覧 |
| GET | `/api/favorite-authors/recommendations` | 著者ベースのおすすめ著者候補 |

### フォロー

| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/api/follows` | ユーザーをフォロー |
| DELETE | `/api/follows` | フォロー解除 |
| GET | `/api/follows/recommendations` | おすすめフォロー候補の取得 |

### 文学賞

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/awards` | 文学賞一覧 |
| GET | `/api/awards/[id]/books` | 賞の受賞作一覧 |
| GET | `/api/awards/progress` | 読書進捗 |

### 通知

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/notifications` | 通知一覧 |
| PATCH | `/api/notifications/[id]/read` | 通知を既読化 |
| PATCH | `/api/notifications/read-all` | 全通知を既読化 |

### 図書館

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/user-libraries` | 登録図書館一覧取得 |
| POST | `/api/user-libraries` | 図書館を登録（最大 5 件） |
| DELETE | `/api/user-libraries` | 図書館の登録解除 |
| GET | `/api/calil/libraries` | カーリル API で図書館を検索（地域・座標から候補を取得） |
| GET | `/api/calil/check` | カーリル API で図書館在庫確認（`isbn` / `libraries` クエリ） |

### 管理者

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/admin/stats` | 統計情報 |
| GET | `/api/admin/award-entries` | 受賞登録一覧 |
| POST | `/api/admin/award-entries` | 受賞登録作成 |
| PATCH | `/api/admin/award-entries/[id]` | 受賞登録編集 |
| DELETE | `/api/admin/award-entries/[id]` | 受賞登録削除 |
| POST | `/api/admin/import-csv` | CSV 一括インポート |
| GET | `/api/admin/reported-reviews` | 通報レビュー一覧 |
| DELETE | `/api/admin/reviews/[id]` | 通報レビュー削除 |
| GET | `/api/admin/users` | ユーザー一覧 |
| DELETE | `/api/admin/users/[id]` | ユーザー削除 |
| GET | `/api/admin/inquiries` | お問い合わせ一覧 |
| PATCH | `/api/admin/inquiries/[id]` | お問い合わせ更新（ステータス変更） |
| DELETE | `/api/admin/inquiries/[id]` | お問い合わせ削除 |
| GET | `/api/admin/ndl-search` | 国立国会図書館 SRU API で書籍検索（`q` クエリ） |
| GET | `/api/admin/award-entries/export` | 受賞データ CSV エクスポート |
| GET | `/api/admin/manual-books` | 手動登録書籍の一覧（手動登録は `POST /api/reading-status` で行う） |
| PATCH | `/api/admin/manual-books/[id]` | 手動登録書籍の編集 |
| DELETE | `/api/admin/manual-books/[id]` | 手動登録書籍の削除 |
| POST | `/api/admin/manual-books/merge` | 重複書籍のマージ |
| GET | `/api/admin/audit-logs` | 監査ログ一覧 |

### お問い合わせ

| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/api/contact` | お問い合わせ送信 |

### Cron

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/cron/check-new-books` | 新刊チェック（Bearer 認証必須） |

各エンドポイントの詳細なバリデーションルール・エラーコード・リクエスト/レスポンス形式は [API仕様書](./api-spec.md) を参照。

---

## 10. 関連ドキュメント

| ドキュメント | 内容 |
| --- | --- |
| [API仕様書](./api-spec.md) | バリデーションルール・エラーコード・列挙型・CSV仕様・リクエスト/レスポンス形式 |
| [ER図](./er-diagram.md) | データベーステーブル構成とリレーション |
| [ワイヤーフレーム](./wireframes.md) | 全画面のレイアウト（PC・モバイル） |
| [画面遷移図](./screen-transition.md) | 画面間の遷移フローとルーティング一覧 |
| [テスト計画表](./test-plan.md) | 単体テスト・結合テストの対象範囲と進捗 |
| [テスト依存関係マップ](./test-dependency-map.md) | 単体テストしにくい箇所とその理由・代替手段、外部APIへの配慮 |
