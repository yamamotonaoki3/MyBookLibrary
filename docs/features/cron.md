# 新刊チェック（Cron） 機能定義書

← [要件定義書に戻る](../requirements.md)

## 概要

AWS EventBridge Scheduler + Lambda で毎日定期実行し、お気に入り著者の新刊を自動検出してユーザーに通知する機能。

## 対象ユーザー

システム自動実行（一般ユーザーへ通知が届く）

## 機能仕様

- 定期実行（AWS EventBridge Scheduler + Lambda）でお気に入り著者の新刊（1週間以内）を楽天ブックス API で検索する
- 新刊が見つかった場合、通知 ON のユーザーに通知を作成する
- 同じ新刊で重複通知は作成しない（`Notification` テーブルに `@@unique([userId, type, bookId])` 制約）

### 実行フロー

```
EventBridge Scheduler（毎日定時）
  ↓
Lambda 関数が起動
  ↓
GET /api/cron/check-new-books（Bearer 認証）
  ↓
お気に入り著者一覧を取得
  ↓
各著者の楽天ブックス API で過去1週間の新刊を検索
  ↓
新刊が見つかった場合 → 通知 ON のユーザーに通知を作成
  ↓
重複チェック（同 userId・type・bookId の通知が既存なら作成しない）
```

### セキュリティ

- `/api/cron/check-new-books` は Bearer トークン認証必須
- NextAuth ミドルウェアのパブリックパスに `/api/cron/` を追加済み

## 関連 API エンドポイント

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/cron/check-new-books` | 新刊チェック（Bearer 認証必須） |

## 関連ドキュメント

- [ER 図](../er-diagram.md) — Notification テーブル構成
- [通知機能定義書](./notifications.md) — 生成された通知の表示
- [お気に入り著者管理定義書](./favorite-authors.md) — 通知 ON/OFF 設定
- [AWS デプロイガイド](../aws-app-deploy-guide.md) — Lambda・EventBridge の設定
