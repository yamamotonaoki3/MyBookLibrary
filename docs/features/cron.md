# 新刊チェック（Cron） 機能定義書

← [要件定義書に戻る](../requirements.md)

## 概要

Cloudflare Workers の Cron Trigger で毎日定期実行し、お気に入り著者の新刊を自動検出してユーザーに通知する機能。（AWS の EventBridge + Lambda でも、同じ API を呼べる。AWS は現在停止中）

## 対象ユーザー

システム自動実行（一般ユーザーへ通知が届く）

## 機能仕様

- 定期実行（Cloudflare Cron Trigger）でお気に入り著者の新刊（1週間以内）を楽天ブックス API で検索する
- 新刊が見つかった場合、通知 ON のユーザーに通知を作成する
- 同じ新刊で重複通知は作成しない（`Notification` テーブルに `@@unique([userId, type, bookId])` 制約）

### 実行フロー

```
Cloudflare Cron Trigger（毎日 UTC 00:00 = JST 09:00。本番のみ）
  ↓
Worker の scheduled ハンドラ（src/lib/cronScheduler.ts）が、Worker 内の fetch を直接呼ぶ
  ↓
GET /api/cron/check-new-books（Bearer = Worker の secret CRON_SECRET）
  ↓
お気に入り著者一覧を取得
  ↓
各著者の楽天ブックス API で過去1週間の新刊を検索
  ↓
新刊が見つかった場合 → 通知 ON のユーザーに通知を作成
  ↓
重複チェック（同 userId・type・bookId の通知が既存なら作成しない）
```

### 環境ごとの Cron

| 環境 | Cron | 実行内容 |
| --- | --- | --- |
| 本番 | `0 0 * * *`（UTC 00:00 = JST 09:00） | 新刊チェック |
| ステージング | なし（本番との二重通知を防ぐ） | — |
| デモ | `0 18 * * *`（UTC 18:00 = JST 03:00） | 新刊チェックの代わりに、デモのデータの初期化（`GET /api/cron/reset-demo`。[デモ環境の方針](../demo-environment.md)） |

`scheduled` ハンドラ（エントリは `app/worker/index.mjs`）は、secret `CRON_SECRET` が未設定のとき、または API が 2xx 以外を返したときは、失敗として記録する。Cloudflare の Cron は自動で再試行しないが、API は重複通知を作らない冪等な作りのため、次の定時実行で回復する。ローカルでの手動実行は `wrangler dev --test-scheduled`。詳細は [Cloudflare へのデプロイ](../cloudflare-deploy.md) と [移行計画](../cloudflare-d1-migration-plan.md) §4-4 の実装メモ（#668）を参照。

### AWS 構成（停止中）

EventBridge ルール（毎日 UTC 00:00）が Lambda を起動し、Lambda が同じ `GET /api/cron/check-new-books` を Bearer 認証で呼ぶ。設定は [AWS デプロイガイド](../aws-app-deploy-guide.md) を参照。

### セキュリティ

- `/api/cron/check-new-books` は Bearer トークン認証必須
- NextAuth ミドルウェアのパブリックパスに `/api/cron/` を追加済み

## 関連 API エンドポイント

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/cron/check-new-books` | 新刊チェック（Bearer 認証必須） |
| GET | `/api/cron/reset-demo` | デモ環境のデータの初期化（Bearer 認証必須。`DEMO_MODE` のときだけ動く） |

## 関連ドキュメント

- [ER 図](../er-diagram.md) — Notification テーブル構成
- [通知機能定義書](./notifications.md) — 生成された通知の表示
- [お気に入り著者管理定義書](./favorite-authors.md) — 通知 ON/OFF 設定
- [Cloudflare へのデプロイ](../cloudflare-deploy.md) — Cron Trigger の設定
- [AWS デプロイガイド](../aws-app-deploy-guide.md) — Lambda・EventBridge の設定（停止中）
