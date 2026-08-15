# 書籍情報補完処理 機能定義書

← [要件定義書に戻る](../requirements.md)

## 概要

ISBN・カバー画像・出版日のいずれかが欠けている登録済みの本について、外部API（楽天ブックス・NDL）から情報を再取得して補完するバッチ処理。管理者パネルから手動で起動し、進捗をポーリングで確認できる。

## 対象ユーザー

管理者のみ

## 機能仕様

- 補完対象は `Book` テーブルのうち `isbn` が null、`coverImageUrl` が null、`publishedAtUnknown` が true のいずれかに該当する本
- 同時に実行できるジョブは1件のみ（既に `running` 状態のジョブがある場合は開始不可）
- ジョブの進捗は `BookEnrichmentJob`（合計件数・完了件数・成功件数・失敗件数・開始/終了/最終更新日時）で管理し、対象1件ごとの結果は `BookEnrichmentItem`（pending/processing/done/error とエラーメッセージ）で管理する
- 管理者パネルからジョブの進捗（成功・失敗件数、失敗した本のタイトルとエラー内容）を確認できる
- ワーカー（EC2プロセス等）が再起動等で消失し、`running` のまま進捗が一定時間（3分）更新されないジョブは、`tick` エンドポイントの定期呼び出しにより再開される

### 処理フロー

```
管理者が管理者パネルから補完開始を操作
  ↓
POST /api/admin/book-enrichment/start
  ↓
補完対象の本を抽出し、BookEnrichmentJob（status: running）と
対象件数分の BookEnrichmentItem（status: pending）を作成
  ↓
processEnrichmentJob が対象を順次処理
  （楽天ブックス・NDL API から情報を再取得し Book を更新）
  ↓
各 Item の status を done / error に更新、Job の進捗カウントを更新
  ↓
全件処理完了で Job の status を completed / failed に更新

---（別経路）---

GET /api/admin/book-enrichment/tick（Bearer 認証、定期呼び出し）
  ↓
lastTickAt が3分以上更新されていない running ジョブを検出
  ↓
processEnrichmentJob を再実行して処理を再開
```

### セキュリティ

- `start` / `status` は管理者セッション必須
- `tick` は Bearer トークン認証必須（`ENRICHMENT_TICK_SECRET`、16文字以上）

## 関連 API エンドポイント

| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/api/admin/book-enrichment/start` | 補完ジョブを開始 |
| GET | `/api/admin/book-enrichment/status` | ジョブの進捗・失敗項目を取得 |
| GET | `/api/admin/book-enrichment/tick` | 停止中のジョブを再開（Bearer 認証必須） |

## 関連ドキュメント

- [ER 図](../er-diagram.md) — BookEnrichmentJob・BookEnrichmentItem テーブル構成
- [管理者機能 機能定義書](./admin.md) — 管理者パネルからの操作
- [本の一覧・検索 機能定義書](./book-search.md) — 補完対象となる Book のデータ取得元
