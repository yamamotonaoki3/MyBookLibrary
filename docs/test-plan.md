# テスト計画表

MyBookLibrary の単体テスト・結合テストの対象範囲と進捗をまとめたもの。**単体テストしにくい箇所とその理由・代替手段、および外部APIへの配慮**は [テスト依存関係マップ](test-dependency-map.md) を参照。ブラックボックス方式（API結合テスト、同値分割・境界値・エラー系）とホワイトボックス方式（`src/lib` の分岐網羅・境界値）を併用する。テストは Jest + ts-jest（`app/src/__tests__/`）で実施し、実行方法は [README.md](../README.md#テスト) を参照。

## 進捗サマリ

2026-10-18 時点。テストの種類と件数:

| 種類 | 実行 | 件数 |
|---|---|---|
| 単体・API 結合（Jest の `node` と `jsdom` プロジェクト） | `npm test` | 63 ファイル / 690 テスト（`node` プロジェクト 60 ファイル（`node/lib/migration/` 配下を含む）＋ `jsdom` プロジェクト 3 ファイル） |
| 実 DB 結合（MySQL。`integration` プロジェクト）と、D1 結合（`integration-d1` プロジェクト） | `npm run test:integration` / `npm run test:integration:d1` | `src/__tests__/integration/*.itest.ts` が 16 ファイル。**同じファイルを、MySQL と D1（miniflare）の両方で実行**する（MySQL 専用のテストは D1 では除外。CI で、どちらも実行） |
| E2E（Playwright） | `npm run test:e2e` / `npm run test:e2e:demo` | `e2e/*.spec.ts` が 15 ファイル、デモ環境の保護（`DEMO_MODE`）が `e2e-demo/demo-mode.spec.ts` |

| 優先度 | 状態 |
|---|---|
| A（認証・session・books検索・admin系） | 実施済み（Issue [#378](https://github.com/yamamotonaoki3/MyBookLibrary/issues/378)） |
| B（favorite-authors・reviews周辺・awards・calil・user/delete・follows・監査ログ・手動書籍管理） | **一部実施済み**（下の表。実 DB 結合・E2E・後から追加したテストで、一部を担保している） |
| C（純粋関数・contact・cron） | 一部実施済み（`src/lib` の純粋関数は多くが実施済み。`contact` は未実施） |
| 追加分（Workers + D1 への移行、デモ環境、管理者のメールのマスク） | 実施済み（下の「追加分」） |

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

## 優先度B（一部実施済み）

「状態」は、2026-10-18 時点で、テストファイルを確認した範囲。**実施済みは、記載した観点だけ**で、ほかの観点は未実施。

| 対象 | 観点 | 状態 |
|---|---|---|
| `app/api/favorite-authors`, `favorite-authors/[authorId]` | 登録・解除の正常系、複合ユニーク制約違反（重複登録）の異常系 | 一部実施済み: 重複登録（POST）は `integration/favorite-authors.itest.ts`。解除・通知切替（PATCH）の専用テストはない |
| `app/api/reviews/[id]/report` | 通報重複 | 実施済み: `integration/reviews-report.itest.ts`（2 回目は 409、通報は 1 件のまま） |
| `app/api/awards` | 文学賞一覧 | 未実施（E2E `e2e/awards.spec.ts` が画面を確認） |
| `app/api/user-libraries`, `calil/check`, `calil/libraries` | 外部API（カーリル）モック時の正常系・タイムアウト/エラー系 | 一部実施済み: `calil/check`・`calil/check-book` は `node/api/calil-check.test.ts`（正常・ポーリング・500）。`user-libraries`・`calil/libraries` は未実施 |
| `app/api/user/delete` | 退会時の関連データ削除（カスケード）の確認 | 実施済み: `integration/user-delete.itest.ts`（カスケード削除・管理者は削除不可） |
| `app/api/admin/award-entries`, `admin/award-entries/[id]`, `admin/reported-reviews`, `admin/reviews/[id]`, `admin/ndl-search`, `admin/import-csv`, `admin/award-entries/export` | 権限チェック・CRUD正常系/異常系・CSV 検証 | 一部実施済み: `award-entries` の一覧（GET。100 件超の ISBN の分割取得）は `node/api/admin-award-entries.test.ts`。`admin/reviews/[id]`（削除・通知の作成・同一 ISBN の通知の重複防止）は `integration/atomic-writes.itest.ts`。ほかは未実施（E2E `e2e/admin.spec.ts` が画面を確認） |
| `app/api/follows` | フォロー/解除の正常系、自分自身のフォロー・重複フォローの異常系 | 一部実施済み: 相互フォロー解除の通知の削除は `integration/atomic-writes.itest.ts`。入力の異常系は未実施 |
| `app/api/admin/audit-logs` | 権限チェック、`AuditLogQuerySchema` のフィルタ（eventType/actorUserId/期間）・ページングの正常系/異常系 | 一部実施済み: スキーマは `node/lib/validations.test.ts`、メールのマスクは `node/api/admin-email-masking.test.ts`、イベント種別の絞り込みとページング（総件数と取得件数）は `integration/atomic-writes.itest.ts`。実行者・期間の絞り込みは未実施 |
| `app/api/admin/manual-books`, `admin/manual-books/[id]`, `admin/manual-books/merge` | 権限チェック、手動登録本の一覧・編集・削除、マージ時の関連データ（読書ステータス・レビュー・受賞登録）の統合 | 一部実施済み: 一覧のメールのマスクのみ（`node/api/admin-email-masking.test.ts`）。編集・削除・マージは未実施 |
| `app/api/user/secret-word` | 現在のパスワード確認、合言葉の設定・変更の正常系/異常系 | 一部実施済み: 設定状況の確認（GET）は `node/api/user-secret-word.test.ts`。設定・変更（POST）は未実施 |
| `/users/[id]` ページ（Server Component） | お気に入り著者・読んでいる本が相互フォローの有無に関わらず表示される、相互フォロー成立時のみ「相互フォロー」ラベル | 未実施（E2E `e2e/favorites-follows.spec.ts` がフォロー周辺を確認） |

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
| `app/api/cron/check-new-books` | 実施済み | `node/api/check-new-books.test.ts`（発売日の判定）と、`integration/cron-check-new-books.itest.ts`（通知の作成・再実行しても重複しない・通知 OFF の著者は対象外・1 週間より前は対象外・D1 の変数の上限を超える件数・`CRON_SECRET` が違えば失敗） |

## 追加分（Workers + D1 への移行、デモ環境、管理者のメールのマスク）

計画表の作成後に、追加したテスト。

| 対象 | テストファイル |
|---|---|
| 管理者のメールのマスク・「表示」API（認可・入力検証・監査ログ・回数制限・記録失敗時）・画面部品 | `node/lib/maskEmail.test.ts`、`node/api/admin-email-masking.test.ts`、`node/api/admin-email-reveal.test.ts`、`ui/frontend/MaskedEmail.test.tsx` |
| 管理画面の読み込み失敗（HTTP エラー・通信失敗・JSON 解析失敗）で画面を落とさない | `ui/frontend/useAdminLoad.test.tsx` |
| セッションの有効期間（保持なし 8 時間・保持あり 30 日・デモ 15 分） | `node/lib/sessionPolicy.test.ts`、`node/lib/sessionJwt.test.ts` |
| デモモード（保護・共通の認可・定期的な初期化・データの作成計画） | `node/api/demo-mode.test.ts`、`node/lib/demoSeedPlan.test.ts`、E2E `e2e-demo/demo-mode.spec.ts` |
| D1 の変数の上限（100 個）に収める分割 | `node/lib/chunk.test.ts`、`integration/bind-limit.itest.ts` |
| MySQL → D1 の移行ツール（変換・照合・ガード・移行元が空のときの中止） | `node/lib/etl.test.ts`、`etlDemo.test.ts`、`etlGuard.test.ts`、`integration/etl-d1.itest.ts`、`integration/etl-mysql-to-d1.itest.ts` |
| Workers（D1 のバインディング・リクエストごとのクライアント・Cron・バージョン） | `node/lib/d1Binding.test.ts`、`perBindingProxy.test.ts`、`cronScheduler.test.ts`、`node/api/version.test.ts`、`node/lib/workerVersion.test.ts` |
| ドキュメントのリンク切れ・存在しないパス | CI の `Docs link check`（`npm run check:docs`） |

## テストケース設計の考え方

- **ブラックボックス（API結合テスト）**: 正常入力／バリデーションエラー／認可エラー／存在しないリソースの同値クラスと、文字数・数値・日付の境界値、状態遷移（未ログイン→ログイン→ロック等）を確認する。
- **ホワイトボックス（単体テスト）**: 対象関数の分岐カバレッジ100%を目標に、if/switch/早期returnの各パスに対応するケースを用意する。

## 進捗の更新方法

新しいテストを追加したら、このファイルの該当行を「未実施」から「実施済み」に更新し、テストファイル名を記載する。
