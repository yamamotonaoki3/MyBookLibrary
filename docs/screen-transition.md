# 画面遷移図

```mermaid
flowchart TD
    START([アプリアクセス]) --> LOGIN[ログイン画面]

    LOGIN --> |新規登録| REGISTER[ユーザー登録画面]
    REGISTER --> |登録完了| LOGIN
    LOGIN --> |ログイン成功| DASHBOARD[ダッシュボード]

    DASHBOARD --> AWARD[賞別作品一覧画面]
    DASHBOARD --> FAVORITE[お気に入り著者一覧画面]
    DASHBOARD --> NOTIFY[通知画面]
    DASHBOARD --> |管理者のみ| ADMIN[管理者画面]

    AWARD --> |作品をクリック| REVIEW[感想投稿・一覧画面]
    AWARD --> |著者名をクリック| AUTHOR[著者別作品一覧画面]

    FAVORITE --> AUTHOR
    AUTHOR --> |作品をクリック| REVIEW

    NOTIFY --> |新刊通知をクリック| AUTHOR
    NOTIFY --> |いいね通知をクリック| REVIEW
```

## 画面一覧

| 画面名 | 説明 |
| --- | --- |
| ログイン画面 | 未ログインユーザーの入口 |
| ユーザー登録画面 | 新規アカウント作成 |
| ダッシュボード | ログイン後のトップ画面 |
| 賞別作品一覧画面 | 文学賞ごとの受賞・ノミネート作品一覧 |
| お気に入り著者一覧画面 | 登録済み著者の一覧 |
| 著者別作品一覧画面 | 著者の全作品一覧 |
| 感想投稿・一覧画面 | 本ごとの感想投稿・閲覧 |
| 通知画面 | 新刊・いいね通知の一覧 |
| 管理者画面 | 受賞・ノミネート作品の登録（管理者のみ） |
