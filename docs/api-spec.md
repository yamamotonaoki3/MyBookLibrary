# API 仕様書

`docs/requirements.md` に収まらなかった技術的な詳細仕様をまとめる。

---

## 1. バリデーションルール一覧

すべてのバリデーションは `app/src/lib/validations.ts` の Zod スキーマに基づく。

### ユーザー登録（RegisterSchema）

| フィールド | 型 | ルール |
| --- | --- | --- |
| `name` | string | 必須、前後空白トリム、1〜50文字 |
| `email` | string | 必須、メールアドレス形式 |
| `password` | string | 必須、8〜100文字 |
| `confirmPassword` | string | 必須、`password` と一致 |

### ログイン（LoginSchema）

| フィールド | 型 | ルール |
| --- | --- | --- |
| `email` | string | 必須、メールアドレス形式 |
| `password` | string | 必須、1文字以上 |

### パスワードリセット（ResetPasswordSchema）

| フィールド | 型 | ルール |
| --- | --- | --- |
| `email` | string | 必須、メールアドレス形式 |
| `password` | string | 必須、8〜100文字 |
| `confirmPassword` | string | 必須、`password` と一致 |

### 読書ステータス登録（ReadingStatusSchema）

| フィールド | 型 | ルール |
| --- | --- | --- |
| `status` | enum | 必須、`unread` / `want_to_read` / `reading` / `read` |
| `title` | string | 必須、前後空白トリム、1〜200文字 |
| `author` | string | 必須、前後空白トリム、1〜100文字 |
| `isbn` | string | 任意 |
| `coverImageUrl` | string | 任意、URL 形式 |
| `publishedAt` | string | 任意 |
| `source` | enum | 任意、`rakuten` / `manual` |

### 本の編集（EditBookSchema）

| フィールド | 型 | ルール |
| --- | --- | --- |
| `title` | string | 任意、1〜200文字 |
| `author` | string | 任意、1〜100文字 |
| `isbn` | string | 任意 |
| `coverImageUrl` | string | 任意 |
| `publishedAt` | string | 任意 |

### レビュー（ReviewSchema）

| フィールド | 型 | ルール |
| --- | --- | --- |
| `body` | string | 必須、前後空白トリム、10〜2000文字 |
| `isSpoiler` | boolean | 任意、デフォルト `false` |
| `isPublic` | boolean | 任意、デフォルト `true`（`false` で非公開） |
| `bookId` | number | 任意、正の整数 |

### お気に入り著者（FavoriteAuthorSchema）

| フィールド | 型 | ルール |
| --- | --- | --- |
| `authorName` | string | 必須、前後空白トリム、2〜100文字 |

### お問い合わせ（ContactForm ※手動バリデーション）

| フィールド | 型 | ルール |
| --- | --- | --- |
| `category` | enum | 必須、`general` / `bug` / `feature` / `account` / `other` |
| `subject` | string | 必須、1〜100文字 |
| `body` | string | 必須、10〜2000文字 |

---

## 2. 列挙型（Enum）仕様

### ReadingStatus（読書ステータス）

| 値 | 表示名 |
| --- | --- |
| `unread` | 未読（レコードなし＝デフォルト） |
| `want_to_read` | 読みたい |
| `reading` | 読書中 |
| `read` | 読了 |

> `unread` に変更するとレコードが削除される（デフォルト状態 = レコードなし）。

### AwardEntryType（受賞種別）

| 値 | 表示名 |
| --- | --- |
| `winner` | 受賞 |
| `nominee` | ノミネート |

### BookSource（書籍登録元）

| 値 | 説明 |
| --- | --- |
| `rakuten` | 楽天ブックス API 経由で登録 |
| `manual` | ユーザーが手動で登録（編集・削除可能） |

### InquiryStatus（お問い合わせステータス）

| 値 | 説明 |
| --- | --- |
| `open` | 未対応（デフォルト） |
| `closed` | 対応済み |

### InquiryCategory（お問い合わせカテゴリ）

| 値 | 表示名 |
| --- | --- |
| `general` | 一般的なお問い合わせ |
| `bug` | 不具合報告 |
| `feature` | 機能追加要望 |
| `account` | アカウントについて |
| `other` | その他 |

### NotificationType（通知種別）

| 値 | 説明 | 生成タイミング |
| --- | --- | --- |
| `new_book` | 新刊通知 | Cron 実行時（お気に入り著者の新刊検出） |
| `like` | いいね通知 | 自分のレビューにいいねが付いた際 |

---

## 3. エラーレスポンス仕様

### 共通エラー形式

```json
{ "error": "エラーメッセージ" }
```

Zod バリデーション失敗時のみフィールド別エラーを返す：

```json
{
  "error": {
    "fieldName": ["エラーメッセージ1", "エラーメッセージ2"]
  }
}
```

### 共通ステータスコード

| コード | 意味 | メッセージ例 |
| --- | --- | --- |
| `200` | 成功 | — |
| `201` | 作成成功 | — |
| `204` | 削除成功（レスポンスボディなし） | — |
| `400` | リクエスト不正（バリデーション失敗・不正な ID 形式） | `"○○ が不正です。"` / Zod フィールドエラー |
| `401` | 未認証 | `"認証が必要です"` |
| `403` | 権限なし | `"権限がありません"` |
| `404` | リソース未検出 | `"○○が見つかりません。"` |
| `409` | 重複・競合 | `"○○は既に登録されています。"` |
| `422` | 処理不可（意味的エラー） | Google アカウントへのパスワードリセット試行時 |
| `500` | サーバーエラー | `"サーバーエラーが発生しました。"` |

### エンドポイント別エラーケース

#### POST /api/auth/register

| 状況 | コード | メッセージ |
| --- | --- | --- |
| バリデーション失敗 | 400 | Zod フィールドエラー |
| メールアドレス重複 | 409 | `"このメールアドレスは既に使用されています"` |

#### POST /api/auth/reset-password（step: check）

| 状況 | コード | メッセージ |
| --- | --- | --- |
| メールアドレス未入力 | 400 | — |
| ユーザー未存在 | 404 | — |
| Google アカウント | 422 | `"GOOGLE_ACCOUNT"` |

#### POST /api/reviews

| 状況 | コード | メッセージ |
| --- | --- | --- |
| バリデーション失敗 | 400 | `issue[0].message` |
| 未認証 | 401 | `"認証が必要です"` |

#### POST /api/reviews/[id]/likes

| 状況 | コード | メッセージ |
| --- | --- | --- |
| すでにいいね済み | 409 | `{ count: number }` を返す |

#### POST /api/admin/award-entries

| 状況 | コード | メッセージ |
| --- | --- | --- |
| 必須フィールド不足 | 400 | — |
| type 不正 | 400 | — |
| 本・賞・年の重複 | 409 | — |
| awardId 未存在 | 400 | Prisma P2003 |

#### DELETE /api/user/delete

| 状況 | コード | メッセージ |
| --- | --- | --- |
| 管理者アカウント削除試行 | 400 | — |
| ユーザー未存在 | 404 | — |

#### POST /api/admin/import-csv

| 状況 | コード | レスポンス形式 |
| --- | --- | --- |
| ファイル未指定 | 400 | — |
| 部分成功 | 200 | `{ "success": N, "errors": ["行2: ...", ...] }` |

---

## 4. DB ユニーク制約（重複時の挙動）

| モデル | 制約 | 重複時の挙動 |
| --- | --- | --- |
| `User` | `email` @unique | 409（register API で手動チェック） |
| `Book` | `isbn` @unique | `upsert` / `findFirst` で事前回避 |
| `ReadingStatus` | `@@unique([userId, bookId])` | `upsert` で自動上書き |
| `Review` | `@@unique([userId, bookId])` | 409（重複投稿時） |
| `Like` | `@@unique([userId, reviewId])` | 409（手動チェック） |
| `Report` | `@@unique([userId, reviewId])` | 409（手動チェック） |
| `FavoriteAuthor` | `@@unique([userId, authorId])` | 409（DB 制約で自動） |
| `AwardEntry` | `@@unique([bookId, awardId, year])` | 409（手動チェック） |
| `Notification` | `@@unique([userId, type, bookIsbn])` | `createMany` の `skipDuplicates: true` で無視 |

---

## 5. アカウントロック仕様

| 設定項目 | 値 |
| --- | --- |
| ロック閾値 | 10 回失敗 |
| ロック期間 | 15 分（900,000 ms） |
| カウンターリセット条件 | ログイン成功 / パスワードリセット完了 |
| DB カラム | `User.loginFailCount`、`User.lockedUntil` |

**フロントエンドの表示ロジック（LoginForm）：**

- ログイン失敗時に `/api/auth/remaining-attempts?email=...` を呼び出し、残り試行回数を取得
- 残り回数が 1〜3 回の場合：「あと○回間違えるとアカウントがロックされます」と表示
- `ACCOUNT_LOCKED` エラー時：「アカウントがロックされています。しばらくお待ちください。」と表示
- `OAuthAccountNotLinked` エラー時：「このメールアドレスはパスワードで登録済みです。パスワードでログインしてください。」と表示

---

## 6. 著者名正規化

**実装ファイル：** `app/src/lib/normalizeAuthorName.ts`

```ts
export function normalizeAuthorName(name: string): string {
  return name.replace(/[\s　]/g, "");
}
```

**適用箇所：**

- お気に入り著者の登録時（`POST /api/favorite-authors`）
- 楽天 API・NDL API からの著者名取得時
- 手動登録時の著者名入力時

**目的：** 全角スペース・半角スペースの有無による著者名の分裂（同一著者が別レコードになる問題）を防ぐ。

---

## 7. CSV インポートフォーマット

`POST /api/admin/import-csv` で受け付ける CSV の仕様。

### ヘッダー行（必須）

```
title,author,isbn,coverImageUrl,publishedAt,awardId,year,type
```

### 各列の仕様

| 列名 | 必須 | 型 | 説明 |
| --- | --- | --- | --- |
| `title` | ✅ | string | 書籍タイトル |
| `author` | ✅ | string | 著者名 |
| `isbn` | — | string | ISBN（省略可） |
| `coverImageUrl` | — | string | 表紙画像 URL（省略可） |
| `publishedAt` | — | string | 出版日（省略可） |
| `awardId` | ✅ | number | 文学賞 ID（DB の `Award.id`） |
| `year` | ✅ | number | 受賞年度 |
| `type` | ✅ | `winner` / `nominee` | 受賞種別 |

### レスポンス形式

```json
{
  "success": 42,
  "errors": [
    "行3: type が不正です（winner または nominee を指定してください）",
    "行7: awardId が存在しません"
  ]
}
```

- `success`：正常にインポートされた件数
- `errors`：スキップされた行のエラー内容（行番号付き）

---

## 8. API リクエスト / レスポンス形式（主要エンドポイント）

### POST /api/auth/register

**リクエスト**

```json
{
  "name": "山田太郎",
  "email": "user@example.com",
  "password": "password123",
  "confirmPassword": "password123"
}
```

**レスポンス（201）**

```json
{ "message": "ユーザー登録が完了しました" }
```

---

### POST /api/reading-status

**リクエスト**

```json
{
  "status": "reading",
  "title": "吾輩は猫である",
  "author": "夏目漱石",
  "isbn": "9784000000000",
  "coverImageUrl": "https://example.com/cover.jpg",
  "publishedAt": "1905-01-01",
  "source": "rakuten"
}
```

**レスポンス（200）**

```json
{
  "id": 1,
  "userId": 42,
  "bookId": 7,
  "status": "reading",
  "book": {
    "id": 7,
    "title": "吾輩は猫である",
    "author": "夏目漱石",
    "isbn": "9784000000000",
    "coverImageUrl": "https://example.com/cover.jpg"
  }
}
```

---

### POST /api/reviews

**リクエスト**

```json
{
  "bookId": 7,
  "body": "とても面白かったです。主人公の猫の視点が独特で...",
  "isSpoiler": false,
  "isPublic": true
}
```

**レスポンス（201）**

```json
{
  "id": 55,
  "userId": 42,
  "bookId": 7,
  "body": "とても面白かったです...",
  "isSpoiler": false,
  "isPublic": true,
  "createdAt": "2024-05-01T12:00:00.000Z"
}
```

---

### GET /api/awards/progress

**レスポンス（200）**

```json
[
  {
    "awardId": 1,
    "awardName": "直木賞",
    "total": 50,
    "read": 12
  },
  {
    "awardId": 2,
    "awardName": "芥川賞",
    "total": 40,
    "read": 8
  }
]
```

---

### GET /api/notifications

**レスポンス（200）**

```json
[
  {
    "id": 10,
    "type": "new_book",
    "message": "東野圭吾が新刊を出しました",
    "bookIsbn": "9784000000001",
    "isRead": false,
    "createdAt": "2024-05-25T09:00:00.000Z"
  },
  {
    "id": 9,
    "type": "like",
    "message": "あなたの感想にいいねがつきました",
    "bookIsbn": null,
    "isRead": true,
    "createdAt": "2024-05-24T15:30:00.000Z"
  }
]
```
