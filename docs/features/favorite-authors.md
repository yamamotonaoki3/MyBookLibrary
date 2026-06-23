# お気に入り著者管理 機能定義書

← [要件定義書に戻る](../requirements.md)

## 概要

著者をお気に入り登録し、著者ごとの書籍一覧の閲覧・読書ステータス管理・新刊通知の ON/OFF 切り替えができる機能。

## 対象ユーザー

一般ユーザー

## 機能仕様

- 著者を「お気に入り」として登録・削除できる
- お気に入り著者の一覧を表示する
- 著者ごとに新刊通知の ON/OFF を切り替えられる
- 著者名をクリックするとその著者の書籍一覧を表示する
- 書籍ごとに読書ステータスを変更できる
- 楽天ブックス API（フォールバック：国立国会図書館 API）で著者名を検索して登録できる

### 書籍一覧の表示仕様

- タイトルの重複を NFKC 正規化で排除（全角・半角・スペース差異を吸収）
- 同タイトルが複数版ある場合は最古出版年（初版）を表示
- 単行本優先で版種を選択

## 関連画面

| パス | 画面名 |
| --- | --- |
| `/favorite-authors` | お気に入り著者一覧 |
| `/favorite-authors/[authorId]` | 著者別書籍一覧 |

## 関連 API エンドポイント

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/authors` | 著者一覧 |
| GET | `/api/authors/search` | 著者検索 |
| GET | `/api/favorite-authors` | お気に入り著者一覧 |
| POST | `/api/favorite-authors` | 著者をお気に入り登録 |
| PATCH | `/api/favorite-authors/[authorId]` | 新刊通知 ON/OFF 切り替え |
| DELETE | `/api/favorite-authors/[authorId]` | お気に入りから削除 |
| GET | `/api/favorite-authors/[authorId]/books` | 著者の書籍一覧 |

## 関連ドキュメント

- [API 仕様書](../api-spec.md) — 書籍一覧レスポンス形式
- [ER 図](../er-diagram.md) — FavoriteAuthor テーブル構成
- [新刊チェック（Cron）定義書](./cron.md) — 新刊通知の自動生成
- [通知機能定義書](./notifications.md) — 新刊通知の表示
