# テスト計画表

## 検索の時間制限（#802）

- `externalApiTimeouts.test.ts`: 楽天・NDLのヘッダー未着／本文停止、全体期限・呼び出し元中断で、明示指定時だけ `ExternalApiTimeoutError` を返す。既定の空結果、版解決の既存挙動、時間切れ以外の失敗を確認する。
- `books-search.test.ts`: 数十msにモックした検索定数と中断対応fetchで、楽天・NDL・検索予算の時間切れが504／`SEARCH_TIMEOUT`になること、正常0件が200になること、既存の429等を確認する。
- `BookSearchTimeout.test.tsx`: fake timersで15秒後の待機解除と再試行、504の共通表示、再試行成功、古い応答の無視、追加ページのエラーと強制再試行、タイマー解除を確認する。
- `e2e/search-timeouts.spec.ts`: `.env.test` を明示して起動し、楽天スタブの遅延で実検索APIの504と画面のエラーを確認、遅延解除後に同じ検索条件の再試行で結果が出ることを検証する。
- 実装時の結果: 対象のnode/jsdomテスト48件・型チェック・lintは成功。全体テストは857件成功、既存の `authSecurityRuntime.test.ts` 1件は子プロセス起動の `EPERM` で失敗。E2Eは `spawn EPERM` で起動できず未検証。`check:docs` も `spawnSync git EPERM` で未完了。

## 書誌補完のWorkers分割実行（#696）

CIでは通常E2Eの直後に `e2e/book-enrichment-cron.spec.ts` を専用ステップで実行する。既存の `.env.test` を使い、`ENRICHMENT_MODE=cron` と、そのステップ内で `openssl rand -hex 16` により生成した `ENRICHMENT_TICK_SECRET` を渡す（値はログに出さない）。テスト内で架空の著者・ISBN未設定の本を3件作り、各アイテムが `done` または `error` になり、ジョブが `completed`、`doneCount === totalCount` になるまでtickを呼ぶ。

- `bookEnrichmentWorker.test.ts`: 予算超過でheartbeatを更新しrunningを維持、アイテム途中では止めない、予算なし・予算内完了、既存の中断・貸出回収。
- `cronScheduler.test.ts`: 毎時tickの専用Bearer、secret不足、デモのスキップ、日次の既存処理。日次の新刊（UTC 00:00）と毎時30分の補完が、`controller.cron` により、それぞれ正しいパス・Bearerに振り分けられることを確認する。補完のCronを30分にしたのは、新刊チェック（楽天API）と同じ時刻に動かさないため。
- `bookEnrichmentWorker.test.ts`: 複数のpendingを新しい本（`bookId` 降順、同値なら `id` 降順）から処理する。常駐モード（AWS含む）と20秒予算のCronモードの両方を確認する。
- `api/book-enrichment.test.ts`: startのCron予約と従来の即時起動、tickの全running取得・順次await・tick全体の残り予算、従来staleのvoid再開、認証・デモ拒否。
- `enrichmentMode.test.ts`: `cron`完全一致のみ有効。
- `authorizedPaths.test.ts`: 未ログインのtick完全一致だけがproxyを通過し、start・status・cancel・tick/x・tickxなどの類似パスと他の管理APIは拒否される。
- `e2e/book-enrichment-cron.spec.ts`: 管理者セッションはstartにだけ使い、進捗ゼロで予約されることを確認する。tickはCookieのない独立した`request`フィクスチャで呼び、Bearerなしは401（307ではない）、Bearerありは200、繰り返しのtickでDB進捗が保存されcompletedになることを確認する。リダイレクトは追従せず、完了後のtickは200かつ処理対象なしを確認する。`.env.test`を明示的に読み込み、`ENRICHMENT_MODE=cron` とテスト専用の `ENRICHMENT_TICK_SECRET`（16文字以上）をテストプロセス・webServerの両方に渡して専用実行する。通常の未設定モードではスキップする。稼働済みの別サーバーを使わない（`CI=1`）。外部APIは既存スタブ、DBはテスト専用のみ。値は出力しない。
- ステージング（2026-10-29、旧設定）で、変更前のCronが `tick` を `status: 200` で呼べることを確認し、ジョブの完了は、ユーザーの確認の報告を受けた。現在ステージングのCronは無効。毎時Cronの時間・CPUの上限は公式資料とステージング実測による確認が必要で未確認。1時間1回・20秒の予算で数件〜十数件を想定するが処理量は未実測。1,000件に約4〜8日（計算上の目安。実測ではない）を許容し、待機中は1日24回の軽い確認クエリを行う。
- #696実装時の検証では、API E2Eの起動は `spawn EPERM` により未実行。代替として、実際のRoute Handler→Service→Repository（DBはモック）のテストと、ワーカー・Cronの単体テストで分岐・待機・予算共有を確認した。実DB／Workerランタイムでの検証は未完了。
- #800では既存E2EがCron式に依存せず、tickを直接呼んで全アイテムの完了を検証することを中身で確認した。`.env.test`・Cronモード・テスト専用Bearerを渡して専用実行を試みたが、`spawn EPERM` で起動できず、処理順変更後のE2Eは未検証。単体テストは変更前の失敗と変更後の29件成功を確認した。

## PWAビルド依存とキャッシュ分離（Issue #776）

- `app/src/__tests__/node/lib/pwaRuntimeCaching.test.ts`：実際のルート判定関数を別コンテキストへ文字列化して実行する。画面・API・RSC・Next dataのNetworkOnly、公開資産の許可、類似パス・別originの拒否を確認する。
- `app/src/__tests__/node/lib/authorizedPaths.test.ts`：未認証でもSWとハッシュ付きの依存スクリプトを取得でき、APIや類似パスを公開しない。
- `app/e2e-pwa/cache-isolation.spec.ts`：実SW・実ログイン・2ユーザーの個別読書データで、切替後の分離、個人URL/本文の非キャッシュ、オフラインでの保護データ取得・画面遷移の失敗、公開アイコンの利用を確認する。旧個人キャッシュだけを削除し、無関係なキャッシュを残す。
- 実行はappで `npm run build:test:pwa` → `.env.test` を明示して `npm run test:e2e:pwa`。テストDBガード付きのproductionビルドとnext start（3200）・外部スタブ（3999）を使う。通常E2E/デモE2Eと同じMySQLを同時に使用しない。next devだけのE2EはSWを検証しない。
- ローカルforkのtarball・ハッシュ・差分・再作成手順は[UPSTREAM.md](../app/vendor/next-pwa/UPSTREAM.md)。npm ci・prod-only導入、Docker両ステージ・Prisma・未認証HTTP、Linux Workerビルド/D1/Cron疎通でもfile依存の導入互換性を確認する。
- 実測結果と対象/残存GHSAは[監査記録](dependency-audit-776.md)に記載する。
- shadcn・MCP・Express経路の再確認（#777）は[監査記録](dependency-audit-777.md)に記載する。依存・コードは変更しない。
- Prisma設定依存（`deepmerge-ts`）の調査（#778）は[監査記録](dependency-audit-778.md)、Wrangler・Miniflareの更新（#789）は[監査記録](dependency-audit-789.md)に記載する。
- 互換範囲内の依存更新候補の監査（#804）は[監査記録](dependency-audit-804.md)に記載する。
- shadcn CLIを開発依存へ移したruntime検証（#806）は[検証結果](dependency-runtime-806.md)に記載する。CSSの完全一致、prod-only/standaloneのHTTP疎通、PrismaとWorker smokeを確認し、監査件数の変化を脆弱性修正とは扱わない。
- 依存関係の監査警告の段階的解消（親Issue #772）の集約は[監査記録](dependency-audit-772.md)に記載する。

## 認証ライブラリのセキュリティ更新（Issue #773）

- 実ライブラリ回帰: `authSecurityRuntime.test.ts` が独立プロセスでAuth.jsを読み、設定エラーがtruthyなセッションとして公開されず、ライブラリとアプリの認証ガードが未認証リクエストを拒否することを確認する。更新前beta.31で失敗し、beta.32で成功することを確認する。
- E2E: `auth-session.spec.ts` が実ログインで発行されたJWTを復号し、保持なし8時間・保持あり30日、セッション再取得後の期限、ログアウト後の拒否を確認する。デモの `demo-mode.spec.ts` では15分を確認する。秘密鍵・トークンは出力しない。
- ログイン保持なしでブラウザを閉じた後（#782）: 単体テスト `authorizedBrowserSession.test.ts` が、トークン・保持の有無・ブラウザ起動中の目印のCookieの組み合わせごとの判定を確認する。E2E `auth-session.spec.ts` が、目印のCookieだけを消した状態で `/login` を開くと、ダッシュボードを経由せずログイン画面が表示されること（保持ありは従来どおりダッシュボードへ移ること）を確認する。
- ログアウト直後のセッション Cookie の復活（#784）: 単体テスト `authorizedBrowserSession.test.ts` が、ログアウト済みの目印があるときの判定を、`signedOutMarker.test.ts` が、ログイン成功のときだけサーバーが目印を消す（失敗・セッション再発行・サインアウトでは消さない）ことを、UI テスト `signOutWithMarker.test.tsx` が、サインアウトの前に目印を発行することを確認する。E2E `auth-session.spec.ts` が、ログアウト後にセッション Cookie を書き戻しても、ログイン画面に残ること、ログインに失敗しても拒否されたままであること、続けてログインできることを確認する。本番 PWA E2E は、ログアウト操作をまたぐ検証を行う。
- 既存検証: `auth.spec.ts` の登録/ログイン/失敗/管理者制限、デモの操作制限、MySQL/D1の認証アダプタ結合テスト、LinuxでビルドしたWorkerのCredentialsログイン・D1・保護ページの疎通を確認する。Google認証の実サービスへのログインは、テスト用設定とステージングで別途確認する。

## 本の公開レビュー件数（Issue #768）

- 単体: `bookReviewSummary.test.ts`（空入力、ID重複、別版ISBN、完全一致、表記ゆれを一致扱いしないこと、同名別著者、曖昧な照合、取得失敗）、`bookReviewRepository.test.ts`（著者全件走査の禁止）、`BookReviewCount.test.tsx`（0・2・1234件）、`WriteReviewModalCount.test.tsx`（取得失敗の表示）。
- 結合: `book-review-count.itest.ts` をMySQLとローカルD1で実行。151冊・公開/本人非公開/他人非公開・同一ユーザーの複数投稿・ネタバレ・代表外ISBN・公開範囲変更・削除を検証する。
- E2E: `book-review-count.spec.ts` でダッシュボードを除く7箇所を開き、公開2件のみの表示、変更・削除後の0件、未登録の外部検索結果を表示してもBookが増えないことを確認する。


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

### E2E の検索間隔とログアウト判定（#794）

- `playwright.config.ts` の next dev 用 webServer の env だけに `SEARCH_RATE_LIMIT_INTERVAL_MS: "0"` を設定する。同じユーザー・同じプロセスを共有する E2E では、サーバーの処理時刻の詰まりによる429を避ける。デモ・PWAのPlaywright設定と、本番・ステージング・デモのwrangler設定には追加せず、既定の500msを維持する。
- `searchRateLimit.test.ts` が既定値・上書き・不正値・0を、既存の `rateLimit.test.ts` が制限そのものを検証する。`books-search.test.ts` は既定の500ms未満で429、500msで許可、0では連続検索を許可することを確認する。
- `sessionRequestIsSignedOut.test.ts` がCookieヘッダーの名前の完全一致・空値・別パス・POSTを検証する。`auth-session-marker.test.ts` は目印ありのGET sessionがAuth.jsを呼ばずnull JSON・Set-Cookieなしを返し、目印なしや他パスでは従来のハンドラを呼ぶことを確認する。
- `auth-session.spec.ts` の #784 のCookie書き戻しシナリオで、書き戻した後も `/api/auth/session` がnullでSet-Cookieがないことを確認する。既存のログアウト直後のnull判定も維持する。

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

## Dockerイメージの変更（#770）

既存のPlaywrightは `next dev` を起動するため、Dockerfileや実行イメージの依存導入を直接検証しない。Dockerの変更は、`app/` で次のビルド・実行確認を行う。

- `docker build --pull -t mybooklibrary-app:node-patch .` が成功すること。ビルド用・実行用ともNode.js 22.23.4を使い、実行用の依存も `package-lock.json` から導入する。
- 完成イメージで `node --version` が `v22.23.4`、`npx --no-install prisma --version` が既存のPrisma 6.19.3を返すこと。
- ビルドステージと完成イメージに `.env*` / `.dev.vars*` がないこと。`.dockerignore` によってローカルの依存・生成物・秘密設定をビルド対象から除外する。
- 架空の認証設定のみを渡してローカル専用ポートで起動し、`/login` が200、未認証の `/books` がログインへリダイレクトすること。`/api/auth/providers` と `/api/version` の応答も確認する。開発・本番DBには接続せず、データを書き換えない。
- 検証用コンテナの終了後も、通常の開発サーバー・DBコンテナが稼働していること。

## テストケース設計の考え方

- **ブラックボックス（API結合テスト）**: 正常入力／バリデーションエラー／認可エラー／存在しないリソースの同値クラスと、文字数・数値・日付の境界値、状態遷移（未ログイン→ログイン→ロック等）を確認する。
- **ホワイトボックス（単体テスト）**: 対象関数の分岐カバレッジ100%を目標に、if/switch/早期returnの各パスに対応するケースを用意する。

## 進捗の更新方法

新しいテストを追加したら、このファイルの該当行を「未実施」から「実施済み」に更新し、テストファイル名を記載する。
