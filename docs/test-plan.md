# テスト計画表

MyBookLibrary の単体テスト・結合テストの対象範囲と進捗をまとめたもの。ブラックボックス方式（API結合テスト、同値分割・境界値・エラー系）とホワイトボックス方式（`src/lib` の分岐網羅・境界値）を併用する。テストは Jest + ts-jest（`app/src/__tests__/`）で実施し、実行方法は [README.md](../README.md#テスト) を参照。

## 進捗サマリ

| 優先度 | 状態 |
|---|---|
| A（認証・session・books検索・admin系） | 実施済み（Issue [#378](https://github.com/yamamotonaoki3/MyBookLibrary/issues/378)） |
| B（favorite-authors・reviews周辺・awards・calil・user/delete） | 未実施 |
| C（純粋関数・contact・cron） | 一部実施済み（normalizeAuthorName） |

## 優先度A（実施済み）

| 対象 | 手法 | テストファイル |
|---|---|---|
| `src/auth.ts`（アカウントロック処理） | 単体（ホワイトボックス） | `src/__tests__/lib/auth.test.ts` |
| `src/lib/session.ts`（認可ガード） | 単体（ホワイトボックス） | `src/__tests__/lib/session.test.ts` |
| `app/api/books/search` | 結合（ブラックボックス） | `src/__tests__/api/books-search.test.ts` |
| `app/api/admin/users`, `admin/users/[id]` | 結合（ブラックボックス） | `src/__tests__/api/admin-users.test.ts` |
| `app/api/admin/inquiries`, `admin/stats` | 結合（ブラックボックス） | `src/__tests__/api/admin-inquiries-stats.test.ts` |
| `app/api/auth/register`, `reset-password`, `remaining-attempts` | 結合（ブラックボックス） | `src/__tests__/api/auth.test.ts` |
| `app/api/notifications`, `notifications/[id]/read`, `notifications/read-all` | 結合（ブラックボックス） | `src/__tests__/api/notifications.test.ts` |
| `app/api/reading-status` | 結合（ブラックボックス） | `src/__tests__/api/reading.test.ts` |
| `app/api/reviews`, `reviews/[id]/likes` | 結合（ブラックボックス） | `src/__tests__/api/reviews.test.ts` |
| `src/lib/validations.ts`（Zodスキーマ） | 単体（ホワイトボックス） | `validations.test.ts` |

## 優先度B（未実施）

| 対象 | 観点 |
|---|---|
| `app/api/favorite-authors`, `favorite-authors/[authorId]`, `favorite-authors/[authorId]/books` | 登録・解除の正常系、複合ユニーク制約違反（重複登録）の異常系 |
| `app/api/reviews/[id]/report`, `reviews/stats` | 通報重複、統計集計値の正確性 |
| `app/api/awards`, `awards/[id]/books`, `awards/progress` | 受賞歴に紐づく本の一覧、進捗計算ロジック |
| `app/api/user-libraries`, `calil/check`, `calil/libraries` | 外部API（カーリル）モック時の正常系・タイムアウト/エラー系 |
| `app/api/user/delete` | 退会時の関連データ削除（カスケード）の確認 |
| `app/api/admin/award-entries`, `admin/award-entries/[id]`, `admin/reported-reviews`, `admin/reviews/[id]`, `admin/ndl-search`, `admin/import-csv` | 権限チェック・CRUD正常系/異常系 |

## 優先度C（低リスク・純粋関数、一部実施済み）

| 対象 | 状態 | 備考 |
|---|---|---|
| `src/lib/normalizeAuthorName.ts` | 実施済み | `utils.test.ts` に全角/半角スペース除去の境界値ケースあり |
| `src/lib/rakuten.ts`（`deduplicateByTitle` 等） | 未実施 | 純粋関数部分のみ切り出してテスト可能 |
| `src/lib/ndl.ts` | 未実施 | 外部APIクライアント、モックが必要 |
| `app/api/contact` | 未実施 | |
| `app/api/cron/check-new-books` | 未実施 | Bearerトークン認証の検証を含む |

## テストケース設計の考え方

- **ブラックボックス（API結合テスト）**: 正常入力／バリデーションエラー／認可エラー／存在しないリソースの同値クラスと、文字数・数値・日付の境界値、状態遷移（未ログイン→ログイン→ロック等）を確認する。
- **ホワイトボックス（単体テスト）**: 対象関数の分岐カバレッジ100%を目標に、if/switch/早期returnの各パスに対応するケースを用意する。

## 進捗の更新方法

新しいテストを追加したら、このファイルの該当行を「未実施」から「実施済み」に更新し、テストファイル名を記載する。
