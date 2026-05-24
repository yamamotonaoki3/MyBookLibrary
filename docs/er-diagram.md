# ER図

```mermaid
erDiagram
    User {
        int id PK
        string name
        string email
        string role
        datetime created_at
    }

    Author {
        int id PK
        string name
    }

    Book {
        int id PK
        int author_id FK
        string title
        date published_at
        string cover_image_url
    }

    Award {
        int id PK
        string name
    }

    AwardEntry {
        int id PK
        int book_id FK
        int award_id FK
        int year
        string type
    }

    FavoriteAuthor {
        int id PK
        int user_id FK
        int author_id FK
        boolean notify
    }

    ReadingStatus {
        int id PK
        int user_id FK
        int book_id FK
        string status
    }

    Review {
        int id PK
        int user_id FK
        int book_id FK
        text body
        boolean is_spoiler
        datetime created_at
    }

    Like {
        int id PK
        int user_id FK
        int review_id FK
    }

    Notification {
        int id PK
        int user_id FK
        string type
        string content
        boolean is_read
        datetime expires_at
        datetime created_at
    }

    User ||--o{ FavoriteAuthor : "お気に入り登録"
    User ||--o{ ReadingStatus : "読書記録"
    User ||--o{ Review : "感想投稿"
    User ||--o{ Like : "いいね"
    User ||--o{ Notification : "通知"
    Author ||--o{ Book : "著作"
    Author ||--o{ FavoriteAuthor : "登録される"
    Book ||--o{ AwardEntry : "受賞・ノミネート"
    Award ||--o{ AwardEntry : "対象"
    Book ||--o{ ReadingStatus : "記録される"
    Book ||--o{ Review : "感想"
    Review ||--o{ Like : "いいね"
```

## エンティティ説明

| エンティティ | 説明 |
| --- | --- |
| User | アプリ利用者。roleで一般ユーザーと管理者を区別する |
| Author | 著者情報 |
| Book | 書籍情報。楽天ブックスAPIから取得 |
| Award | 文学賞（直木賞・芥川賞・本屋大賞・このミステリーがすごい！） |
| AwardEntry | 書籍と文学賞の受賞・ノミネート関係。typeで受賞/ノミネートを区別する |
| FavoriteAuthor | ユーザーのお気に入り著者登録。notifyで新刊通知ON/OFFを管理する |
| ReadingStatus | ユーザーごとの読書ステータス（読んだ／未読） |
| Review | ユーザーが投稿した感想。is_spoilerでネタバレフラグを管理する |
| Like | 感想へのいいね |
| Notification | アプリ内通知。typeで新刊・いいねを区別する。expires_atで自動削除を管理する |
