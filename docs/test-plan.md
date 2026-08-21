# テスト計画表

MyBookLibrary の単体テスト・結合テストの対象範囲と進捗をまとめたもの。**単体テストしにくい箇所とその理由・代替手段、および外部APIへの配慮**は [テスト依存関係マップ](test-dependency-map.md) を参照。ブラックボックス方式（API結合テスト、同値分割・境界値・エラー系）とホワイトボックス方式（`src/lib` の分岐網羅・境界値）を併用する。テストは Jest + ts-jest（`app/src/__tests__/`）で実施し、実行方法は [README.md](../README.md#テスト) を参照。

## 進捗サマリ

| 優先度 | 状態 |
|---|---|
| A（認証・session・books検索・admin系） | 実施済み（Issue [#378](https://github.com/yamamotonaoki3/MyBookLibrary/issues/378)） |
| B（favorite-authors・reviews周辺・awards・calil・user/delete・follows・監査ログ・手動書籍管理） | 未実施 |
| C（純粋関数・contact・cron） | 一部実施済み（normalizeAuthorName、SecretWordSchema/AuditLogQuerySchema） |

## 優先度A（実施済み）

| 対象 | 手法 | テストファイル |
|---|---|---|
| `src/auth.ts`（アカウントロック処理） | 単体（ホワイトボックス） | `src/__tests__/node/lib/auth.test.ts` |
| `src/lib/session.ts`（認可ガード） | 単体（ホワイトボックス） | `src/__tests__/node/lib/session.test.ts` |
| `app/api/books/search` | 結合（ブラックボックス） | `src/__tests__/node/api/books-search.test.ts` |
| `app/api/admin/users`, `admin/users/[id]` | 結合（ブラックボックス） | `src/__tests__/node/api/admin-users.test.ts` |
| `app/api/admin/inquiries`, `admin/stats` | 結合（ブラックボックス） | `src/__tests__/node/api/admin-inquiries-stats.test.ts` |
| `app/api/auth/register`, `reset-password`, `remaining-attempts` | 結合（ブラックボックス） | `src/__tests__/node/api/auth.test.ts` |
| `app/api/notifications`, `notifications/[id]/read`, `notifications/read-all` | 結合（ブラックボックス） | `src/__tests__/node/api/notifications.test.ts` |
| `app/api/reading-status` | 結合（ブラックボックス） | `src/__tests__/node/api/reading.test.ts` |
| `app/api/reviews`, `reviews/[id]/likes` | 結合（ブラックボックス） | `src/__tests__/node/api/reviews.test.ts` |
| `src/lib/validations.ts`（Zodスキーマ） | 単体（ホワイトボックス） | `src/__tests__/node/lib/validations.test.ts` |

## 優先度B（未実施）

| 対象 | 観点 |
|---|---|
| `app/api/favorite-authors`, `favorite-authors/[authorId]`, `favorite-authors/[authorId]/books` | 登録・解除の正常系、複合ユニーク制約違反（重複登録）の異常系 |
| `app/api/reviews/[id]/report`, `reviews/stats` | 通報重複、統計集計値の正確性 |
| `app/api/awards`, `awards/[id]/books`, `awards/progress` | 受賞歴に紐づく本の一覧、進捗計算ロジック |
| `app/api/user-libraries`, `calil/check`, `calil/libraries` | 外部API（カーリル）モック時の正常系・タイムアウト/エラー系 |
| `app/api/user/delete` | 退会時の関連データ削除（カスケード）の確認 |
| `app/api/admin/award-entries`, `admin/award-entries/[id]`, `admin/reported-reviews`, `admin/reviews/[id]`, `admin/ndl-search`, `admin/import-csv`, `admin/award-entries/export` | 権限チェック・CRUD正常系/異常系 |
| `app/api/follows`, `follows/recommendations` | フォロー/解除の正常系、自分自身のフォロー・重複フォローの異常系、おすすめ候補の算出（共通お気に入り著者数） |
| `app/api/admin/audit-logs` | 権限チェック、`AuditLogQuerySchema` のフィルタ（eventType/actorUserId/期間）・ページングの正常系/異常系 |
| `app/api/admin/manual-books`, `admin/manual-books/[id]`, `admin/manual-books/merge` | 権限チェック、手動登録本の一覧・編集・削除、マージ時の関連データ（読書ステータス・レビュー・受賞登録）の付け替え |
| `app/api/user/secret-word` | 現在のパスワード確認、合言葉の設定・変更の正常系/異常系 |
| `/users/[id]` ページ（Server Component） | お気に入り著者・読んでいる本が相互フォローの有無に関わらず表示される、相互フォロー成立時のみ「相互フォロー」ラベルが表示される分岐 |

## 優先度C（低リスク・純粋関数、一部実施済み）

| 対象 | 状態 | 備考 |
|---|---|---|
| `src/lib/normalizeAuthorName.ts` | 実施済み | `node/lib/normalizeAuthorName.test.ts` に全角/半角スペース除去の境界値ケースあり |
| `src/lib/utils.ts`（`cn()`） | 実施済み（Phase 1） | `node/lib/utils.test.ts`。Tailwindクラスの競合マージ、falsy値の除外を検証 |
| `src/lib/validations.ts`（Zodスキーマ） | 実施済み（Phase 1で全スキーマに拡大） | `node/lib/validations.test.ts`。`SecretWordSchema` / `AuditLogQuerySchema` を追加、`ReadingStatusSchema` の `coverImageUrl` / `source` 分岐を追加 |
| `src/lib/rateLimit.ts` | 実施済み | `node/lib/rateLimit.test.ts`。古いエントリの間引きは戻り値から観測不能なため対象外（[テスト依存関係マップ](test-dependency-map.md) 1-10 参照） |
| `src/lib/adminLimits.ts` | 対象外（判断済み） | 単一定数で分岐が無いため専用テストを作らない。`api/admin-users.test.ts` で間接的に検証済み |
| `src/lib/rakuten.ts` | 実施済み（Phase 2） | `node/lib/rakuten.test.ts`。429リトライ上限（3回で打ち切り）、`deduplicateByTitle`の形式優先度・出版日タイブレーク、`getAuthorBookCount`のNDLフォールバックを検証 |
| `src/lib/ndl.ts` | 実施済み（Phase 2） | `node/lib/ndl.test.ts`。SRU/OpenSearchのXMLパース分岐、`type`別クエリ組み立て、ページング、著者名の生年サフィックス処理を検証 |
| `src/lib/calil.ts` | 実施済み（Phase 2） | `node/lib/calil.test.ts`。ポーリング継続・打ち切り条件（`continue=0`／20秒デッドライン）を`jest.useFakeTimers()`で検証、`mergeResults`のsystemid+libkey単位のマージ優先度を確認 |
| `src/lib/userRecommendations.ts`（フォロー候補の算出） | 実施済み | `node/lib/userRecommendations.test.ts` |
| `src/lib/recommendations.ts`（著者ベースのおすすめ） | 実施済み | `node/lib/recommendations.test.ts` |
| `app/api/contact` | 未実施 | |
| `app/api/cron/check-new-books` | 未実施 | Bearerトークン認証の検証を含む |

## テストケース設計の考え方

- **ブラックボックス（API結合テスト）**: 正常入力／バリデーションエラー／認可エラー／存在しないリソースの同値クラスと、文字数・数値・日付の境界値、状態遷移（未ログイン→ログイン→ロック等）を確認する。
- **ホワイトボックス（単体テスト）**: 対象関数の分岐カバレッジ100%を目標に、if/switch/早期returnの各パスに対応するケースを用意する。

## 進捗の更新方法

新しいテストを追加したら、このファイルの該当行を「未実施」から「実施済み」に更新し、テストファイル名を記載する。
