# 画面遷移図

```mermaid
flowchart TD
    START([アプリアクセス]) --> LOGIN[ログイン画面\n/login]

    LOGIN --> |新規登録| REGISTER[ユーザー登録画面\n/register]
    LOGIN --> |パスワード忘れ| FORGOT[パスワードリセット画面\n/forgot-password]
    REGISTER --> |登録完了| LOGIN
    FORGOT --> |リセット完了| LOGIN
    LOGIN --> |ログイン成功| DASHBOARD[ダッシュボード\n/]

    DASHBOARD --> BOOKS[私の本一覧\n/books]
    DASHBOARD --> SEARCH[本を探す\n/books/search]
    DASHBOARD --> AWARD[賞別作品一覧\n/awards]
    DASHBOARD --> FAVORITE[お気に入り著者一覧\n/favorite-authors]
    DASHBOARD --> MYREVIEWS[投稿した感想\n/my-reviews]
    DASHBOARD --> NOTIFY[通知\n/notifications]
    DASHBOARD --> CONTACT[お問い合わせ\n/contact]
    DASHBOARD --> SETTINGS[設定\n/settings]
    DASHBOARD --> |管理者のみ| ADMIN[管理者パネル\n/admin]

    BOOKS --> BOOKDETAIL[本の詳細\n/books/id]
    SEARCH --> BOOKDETAIL
    SEARCH --> |バーコードスキャン| ISBN[ISBN書籍詳細\n/books/isbn/isbn]
    ISBN --> BOOKDETAIL
    AWARD --> BOOKDETAIL

    BOOKDETAIL --> REVIEWNEW[感想投稿\n/books/id/reviews/new]
    REVIEWNEW --> BOOKDETAIL

    FAVORITE --> AUTHORDETAIL[著者別作品一覧\n/favorite-authors/authorId]
    AUTHORDETAIL --> BOOKDETAIL

    NOTIFY --> |新刊通知| AUTHORDETAIL
    NOTIFY --> |いいね通知| BOOKDETAIL

    SETTINGS --> LIBSETTINGS[近隣図書館の登録\n/settings#libraries]
    ADMIN --> LIBSETTINGS

    BOOKS --> LIBCHECK{図書館の在庫を確認}
    SEARCH --> LIBCHECK
    AUTHORDETAIL --> LIBCHECK
    AWARD --> LIBCHECK
    LIBCHECK --> |貸出可・予約する| LIBSITE([図書館予約サイト\n外部])
```

## 画面一覧

### 認証画面

| パス | 画面名 | 認証 |
| --- | --- | --- |
| `/login` | ログイン画面 | 不要 |
| `/register` | ユーザー登録画面 | 不要 |
| `/forgot-password` | パスワードリセット画面 | 不要 |

### メイン画面

| パス | 画面名 | 認証 |
| --- | --- | --- |
| `/` | ダッシュボード | 必要 |
| `/books` | 私の本一覧 | 必要 |
| `/books/search` | 本を探す | 必要 |
| `/books/[id]` | 本の詳細 | 必要 |
| `/books/[id]/reviews/new` | 感想投稿 | 必要 |
| `/books/isbn/[isbn]` | ISBN書籍詳細 | 必要 |
| `/awards` | 賞別作品一覧 | 必要 |
| `/favorite-authors` | お気に入り著者一覧 | 必要 |
| `/favorite-authors/[authorId]` | 著者別作品一覧 | 必要 |
| `/my-reviews` | 投稿した感想 | 必要 |
| `/notifications` | 通知 | 必要 |
| `/contact` | お問い合わせ | 必要 |
| `/settings` | 設定 | 必要 |

### 管理者画面

| パス | 画面名 | 認証 |
| --- | --- | --- |
| `/admin` | 管理者パネル | 必要（admin ロール） |
