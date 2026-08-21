# 画面遷移図

```mermaid
flowchart TD
    START([アプリアクセス]) --> LOGIN[ログイン画面\n/login]

    LOGIN --> |新規登録| REGISTER[ユーザー登録画面\n/register]
    LOGIN --> |パスワード忘れ| FORGOT1[①メールアドレス確認\n/forgot-password]
    REGISTER --> |登録完了（合言葉は任意入力）| LOGIN
    FORGOT1 --> |未設定の場合はエラー| FORGOT1
    FORGOT1 --> |確認OK| FORGOT2[②秘密の言葉を照合]
    FORGOT2 --> |10回失敗でロック| FORGOT2
    FORGOT2 --> |照合OK| FORGOT3[③新しいパスワードを入力]
    FORGOT3 --> |変更完了| LOGIN
    LOGIN --> |ログイン成功| DASHBOARD[ダッシュボード\n/]

    DASHBOARD --> BOOKS[私の本一覧\n/books]
    DASHBOARD --> SEARCH[本を探す\n/books/search]
    DASHBOARD --> AWARD[賞別作品一覧\n/awards]
    DASHBOARD --> FAVORITE[お気に入り著者一覧\n/favorite-authors]
    DASHBOARD --> MYREVIEWS[投稿した感想\n/my-reviews]
    DASHBOARD --> NOTIFY[通知\n/notifications]
    DASHBOARD --> CONTACT[お問い合わせ\n/contact]
    DASHBOARD --> SETTINGS[設定\n/settings]
    DASHBOARD --> |管理者のみ| ADMIN[管理者パネル（設定/管理/監査ログ）\n/admin]

    BOOKS --> BOOKDETAIL[本の詳細\n/books/id]
    SEARCH --> BOOKDETAIL
    SEARCH --> |バーコードスキャン| ISBN[ISBN書籍詳細\n/books/isbn/isbn]
    SEARCH -.->|モーダル：見つからない本を手動登録| MANUALMODAL[[手動書籍登録モーダル]]
    MANUALMODAL -.-> SEARCH
    ISBN --> BOOKDETAIL
    AWARD --> BOOKDETAIL
    BOOKDETAIL -.->|モーダル：手動登録本のみ| EDITBOOKMODAL[[本の編集モーダル]]
    EDITBOOKMODAL -.-> BOOKDETAIL

    BOOKDETAIL --> REVIEWNEW[感想投稿\n/books/id/reviews/new]
    REVIEWNEW --> BOOKDETAIL

    FAVORITE --> AUTHORDETAIL[著者別作品一覧\n/favorite-authors/authorId]
    FAVORITE -.->|モーダル：著者カード詳細| AUTHORMODAL[[著者詳細モーダル]]
    AUTHORMODAL -.-> FAVORITE
    AUTHORDETAIL --> BOOKDETAIL

    NOTIFY --> |新刊通知| AUTHORDETAIL
    NOTIFY --> |いいね通知| BOOKDETAIL
    NOTIFY --> |フォロー通知| USERPROFILE[ユーザー詳細\n/users/id]

    SETTINGS -.->|モバイル幅のみ・モーダル：アカウント情報| ACCOUNTMODAL[[アカウント情報モーダル]]
    ACCOUNTMODAL -.-> SETTINGS
    SETTINGS --> LIBSETTINGS[近隣図書館の登録\n/settings#libraries]
    SETTINGS --> FOLLOWS[フォロー一覧\n/settings/follows]
    FOLLOWS --> USERPROFILE
    USERPROFILE --> |フォロー/フォロー解除| USERPROFILE
    ADMIN --> LIBSETTINGS
    ADMIN --> |監査ログタブ、または単独ページ| AUDITLOGS[監査ログ\n/admin/audit-logs]

    BOOKS --> LIBCHECK{図書館の在庫を確認}
    SEARCH --> LIBCHECK
    AUTHORDETAIL --> LIBCHECK
    AWARD --> LIBCHECK
    LIBCHECK --> |貸出可・予約する| LIBSITE([図書館予約サイト\n外部])
```

凡例：破線（`-.->`）はページ遷移ではなく、同一画面内でのモーダル表示を表す。

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
| `/settings` | 設定（アカウント情報はモバイル幅のみモーダル表示、PC幅は常時インライン表示） | 必要 |
| `/settings/follows` | フォロー一覧・おすすめフォロー候補 | 必要 |
| `/users/[id]` | ユーザー詳細（フォロー/フォロー解除。お気に入り著者・読んでいる本は誰でも閲覧可、相互フォロー時は活動通知が届く） | 必要 |

### 管理者画面

| パス | 画面名 | 認証 |
| --- | --- | --- |
| `/admin` | 管理者パネル（設定／管理／監査ログの3タブ構成） | 必要（admin ロール） |
| `/admin/audit-logs` | 監査ログ一覧（`/admin` の監査ログタブと同内容） | 必要（admin ロール） |
