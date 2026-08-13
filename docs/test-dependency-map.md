# テスト依存関係マップ

「どこが単体テストしにくいのか、それはなぜか、代わりにどう担保するのか」を明文化したもの。目的は3つある。

1. **機能の依存関係を把握する** — 何が何に依存していてテストを難しくしているのかを可視化する
2. **「テストしない」判断の根拠を残す** — カバレッジ閾値を決めるときの除外根拠になる
3. **外部APIに実リクエストを飛ばさない仕組みを共有する** — 相手のサービスに迷惑をかけないための必須要件

対象範囲と進捗は [test-plan.md](test-plan.md) が正本。このファイルは「テストの書きにくさ」という切り口で補完する。

## 現状サマリ（2026-08-13 時点）

| 区分 | 総数 | テストあり |
| --- | --- | --- |
| API Routes（`src/app/api/**/route.ts`） | 51 | 約14（follows・監査ログ・手動書籍管理・users/[id] は未対応） |
| `src/lib/*.ts` | 17 | 11 |
| コンポーネント・ページ（`.tsx`、計10,418行） | — | **0** |

コンポーネントテストが0件なのは書いていないからだけではなく、`app/jest.config.ts` の `testMatch` が `**/__tests__/**/*.test.ts` で **`.tsx` を拾わない**ため。書いても実行されず、エラーにもならない。この解消は [#431](https://github.com/yamamotonaoki3/MyBookLibrary/issues/431) で行う。

## 凡例

| 記号 | 意味 |
| --- | --- |
| 単体 | 依存をモックして関数単位で検証する |
| 結合 | Route Handler を関数として直接呼び、Prisma や外部APIをモックして検証する |
| 実DB | テスト用MySQLに対して実行する（[#433](https://github.com/yamamotonaoki3/MyBookLibrary/issues/433)） |
| E2E | Playwright で画面から操作する（[#435](https://github.com/yamamotonaoki3/MyBookLibrary/issues/435)） |
| 対象外 | 自動テストしないと決めたもの。手動確認またはコードレビューで担保する |

---

## 1. 単体テストしにくい箇所の一覧

### 1-1. 外部APIクライアント（`lib/rakuten.ts` / `ndl.ts` / `calil.ts`）

| 項目 | 内容 |
| --- | --- |
| なぜ困難か | `global.fetch` で実エンドポイントを直叩きしており、ベースURLがハードコードされている（環境変数で差し替え可能）。URL構築・レスポンス整形・エラー処理が1関数に混在している |
| どうテストするか | `src/__tests__/helpers/fetchMock.ts` で fetch を差し替えて結合的に単体テストする。カーリルのポーリング（`continue`打ち切り・20秒デッドライン）・楽天の429リトライ上限は `jest.useFakeTimers()` + `advanceTimersByTimeAsync` で実時間を消費せず検証する（[学び・手直しの記録](lessons-learned.md) 2026-08-12参照） |
| 補足 | ベースURLの環境変数化は [#434](https://github.com/yamamotonaoki3/MyBookLibrary/issues/434)。E2E ではローカルスタブサーバーへ向ける |
| 状態 | 対応済み（Phase 2 / [#454](https://github.com/yamamotonaoki3/MyBookLibrary/issues/454)）。テストファイル: `node/lib/rakuten.test.ts`, `node/lib/ndl.test.ts`, `node/lib/calil.test.ts` |

### 1-2. `src/proxy.ts`（middleware 相当）

`NextAuth(authConfig).auth` を export するだけの12行で、ロジックを持たない。

| 項目 | 内容 |
| --- | --- |
| なぜ困難か | `src/proxy.ts` は `NextAuth(authConfig).auth` をそのまま export するだけで、自前のロジックを一切持たない。動作は NextAuth の内部実装に依存するため、`proxy.ts` を直接呼ぶテストは NextAuth 自体のテストになり、自プロジェクトのロジックの検証にならない |
| どうテストするか | **`proxy.ts` 自体はテストしない。** 実質のテスト対象である `src/auth.config.ts` の `authorized` コールバックを直接呼ぶ単体テストで、公開パス／保護パス／管理者パス／リダイレクト先を網羅する。さらに、matcher の設定ミスによって保護対象のパスが素通りしないよう、`config.matcher` の正規表現を「パス文字列 → マッチするか」のテーブルテストで検証する |
| 状態 | 未対応（Phase 3 で実施） |

### 1-3. `src/auth.ts`（NextAuth 設定オブジェクト）

| 項目 | 内容 |
| --- | --- |
| なぜ困難か | `authorize` / `jwt` / `session` が設定オブジェクト内のクロージャで外から掴みにくい。bcrypt と Prisma に密結合している |
| どうテストするか | 既に `src/__tests__/lib/auth.test.ts` が `authorizeCredentials` を export させて単体テストしている。この方式を踏襲する |
| 改善案 | さらに難しくなるようなら、`authorize` の中身を `lib/authenticateUser.ts` として切り出し、設定側を薄いアダプタにする |
| 状態 | `src/__tests__/lib/auth.test.ts` で `authorizeCredentials` を8ケース（未入力、ユーザー不存在、パスワード未設定、ロック中、ロック期限切れ、パスワード不一致の閾値未満／到達、正常系のカウンタリセット）網羅済み。未対応は `jwt` / `session` コールバック |
| 補足 | `api/auth/reset-password` の合言葉（秘密の言葉）照合ロックは、`secretWordFailCount`/`secretWordLockedUntil` を使った同じ「N回失敗でロック」パターンをパスワード認証ロックとは別カラムで実装している。テストする際はこのロジック共通性を踏まえ、`authorizeCredentials` のロック関連ケースと同じ観点（閾値未満／到達、ロック期限切れ後のカウンタリセット）で `app/api/auth/reset-password` の結合テストを設計する |

### 1-4. 全 API Route の Prisma 直依存

| 項目 | 内容 |
| --- | --- |
| なぜ困難か | **カスケード削除・複合ユニーク制約（`P2002`）・トランザクションのロールバックは、モックでは原理的に検証できない。** 「モックが `P2002` を投げるか」はテスト側の取り決めにすぎず、実際のスキーマがその制約を持っているかは何も保証しない |
| どうテストするか | 通常は `src/lib/__mocks__/prisma.ts`（`jest.mock("@/lib/prisma")` の1行で使える）で結合テストする |
| モックの限界を補う | 制約系のみ実DBで担保する（[#433](https://github.com/yamamotonaoki3/MyBookLibrary/issues/433)）。対象は `api/user/delete` のカスケード、`api/favorite-authors` の重複登録、`api/reviews/[id]/report` の重複通報、`api/reading-status` の upsert、`api/admin/manual-books/merge` の統合元書籍に紐づく読書ステータス・レビュー・受賞登録の付け替え（統合先で複合ユニーク制約に抵触するケースを含む）の5件に絞る |
| 状態 | モック側は対応済み（[#430](https://github.com/yamamotonaoki3/MyBookLibrary/issues/430)）／実DB側は未対応 |

`$transaction` のコールバックにはルートと同一のモックが渡るため、トランザクション内の呼び出しも `prismaMock.user.deleteMany` のように検証できる。

### 1-5. 巨大コンポーネント

| ファイル | 行数 |
| --- | --- |
| `src/app/admin/page.tsx` | 2,214（3タブ化・手動書籍管理・監査ログ表示を追加し増加） |
| `src/app/books/search/page.tsx` | 547 |
| `src/app/page.tsx` | 380 |
| `src/app/_components/Sidebar.tsx` | 311 |

| 項目 | 内容 |
| --- | --- |
| なぜ困難か | `admin/page.tsx` は14の管理機能の状態・fetch・モーダル・テーブルが1ファイルに同居している。レンダリングするだけで大量の fetch モックが必要になり、**テストが実装の写経になってしまう** |
| どうテストするか | **テストの前にリファクタが必須。** `admin/_components/` にタブ単位（`UsersTab` / `ManualBooksTab` / `AwardEntriesTab` / `ReportedReviewsTab` / `InquiriesTab` / `StatsPanel`）で分割し、データ取得を `useXxx` フックへ寄せる。テストは「フック（単体）＋表示コンポーネント（RTL）」に分ける |
| 補足 | `books/search/page.tsx` も検索フォーム／結果リスト／登録モーダルに分割する。`ManualBookRegisterModal.tsx` が既に分離済みなので同じ流儀に揃える |
| 状態 | 未対応（Phase 14 / Phase 4 で実施） |

### 1-6. `html5-qrcode`（バーコードスキャン）

| 項目 | 内容 |
| --- | --- |
| なぜ困難か | `getUserMedia` / カメラ / `<video>` に依存し、jsdom では動作しない |
| どうテストするか | `jest.mock("html5-qrcode")` でクラス全体をモックし、「スキャン成功コールバックに ISBN を渡したら検索が走る」ところだけを検証する |
| 対象外 | **カメラ起動自体はテストしない。** ブラウザ確認のチェックリストに手動項目として残す |
| 状態 | 未対応（Phase 4 で実施） |

### 1-7. `api/cron/check-new-books`

| 項目 | 内容 |
| --- | --- |
| なぜ困難か | Vercel Cron から呼ばれる。Bearer トークン検証・外部API・複数ユーザーのループを含み、**1回の実行で楽天に数十〜数百リクエストを発生させる** |
| どうテストするか | fetch をモックした結合テストのみ。観点は Bearer 検証（欠落／不正／正）と「1ユーザーの外部API失敗が他ユーザーを止めないこと」 |
| 対象外 | **E2E の対象にしない。手動実行もしない**（外部API保護。3章参照）。スケジュール発火（`vercel.json`）は設定の目視確認のみ |
| 状態 | 未対応（Phase 8 で実施） |

### 1-8. `lib/badge.ts`（PWAバッジ）

| 項目 | 内容 |
| --- | --- |
| なぜ困難か | `navigator.setAppBadge` はブラウザAPIで、未対応環境もある（実装側も `"setAppBadge" in navigator` でガードしている） |
| どうテストするか | jsdom の setup では `navigator.setAppBadge` と `navigator.clearAppBadge` の**両方**をスタブ化し、「0件でクリアされる」ことを単体テストする。`setAppBadge` だけをスタブすると機能検出ガードを通過した後、0件以下で `clearAppBadge` が呼ばれて `TypeError` になる。「未対応環境で例外を投げない」ケースは、逆に両方を `navigator` から取り除いた状態で検証する |
| 状態 | 未対応（Phase 7 で実施） |

### 1-9. `lib/auditLog.ts`（監査ログ）

| 項目 | 内容 |
| --- | --- |
| なぜ困難か | 各 Route の副作用として発火するため、呼び出し元のテストで存在を意識しづらい |
| どうテストするか | 呼び出し元では `jest.mock` して「呼ばれたか＋イベント種別＋対象ID」を検証する。`recordAuditEvent` 自体は Prisma モックで単体テストする |
| 必ず入れるケース | **DB書き込みが失敗しても呼び出し元の本処理を巻き込まない**こと。これは実装のコメントで明示されている設計意図なので、テストで固定する |
| 状態 | 部分的に対応済み。`src/__tests__/api/admin-users.test.ts` で管理者昇格時の監査ログ作成を検証済み。`recordAuditEvent` 自体の単体テスト、他の呼び出し元、DB書き込み失敗時の継続動作は未対応（Phase 12 で実施） |

### 1-9-1. `app/api/admin/audit-logs`（監査ログ閲覧API）と `/admin/audit-logs` ページ

| 項目 | 内容 |
| --- | --- |
| なぜ困難か | クエリパラメータ（`eventType`/`actorUserId`/`from`/`to`/ページング）の組み合わせが多く、`AuditLogQuerySchema` 自体は単体テスト済みだが、Route Handler としての結合テストと、一覧表示・フィルタ操作・詳細モーダルを含むページ側の検証は別に必要 |
| どうテストするか | API は Prisma モックで結合テストする（クエリ変換の正しさ・権限チェック・ページング）。ページ（`AuditLogsView.tsx`）はコンポーネントテストの対象だが、[#431](https://github.com/yamamotonaoki3/MyBookLibrary/issues/431) で `.tsx` のテスト実行が解消されるまで着手できない |
| 状態 | 未対応。`AuditLogQuerySchema` のみ `node/lib/validations.test.ts` でカバー済み |

### 1-10. `lib/rateLimit.ts`

| 項目 | 内容 |
| --- | --- |
| なぜ困難か | プロセス内メモリ（`Map`）の状態と `Date.now()` に依存する |
| どうテストするか | `jest.useFakeTimers()` と `resetRateLimits()`（テスト用に export 済み）を併用する |
| **設計上の限界** | **インメモリのため単一インスタンス運用が前提。** サーバーレスや複数インスタンスにスケールすると、インスタンス間でレート制限が共有されない。実装のコメントにも記載があり、Redis 等の共有ストアへの置き換えが必要。**この限界はテストでは検出できない** |
| **古いエントリの間引きロジックについて** | `staleThreshold`（`intervalMs*10`）を超えたエントリを `Map` から削除する処理があるが、**削除の有無は `isRateLimited()` の戻り値からは観測できない**。`staleThreshold` は常に `intervalMs` より大きいため、間引かれたキー・間引かれていないキーのどちらに再度アクセスしても「`intervalMs` を過ぎている」ため同じ `false`（制限なし）が返る。Map からの実削除を検証するには内部状態を露出する必要があり、そこまでは行わない方針とした。テストは「大量の古いキーが蓄積しても例外を投げず動き続けること」のスモークに留める |
| 状態 | `src/__tests__/node/lib/rateLimit.test.ts` で連続呼び出しの制限、時間経過後の許可、キー間の独立、`resetRateLimits()` によるクリア、大量の古いエントリでの非クラッシュを検証済み |

### 1-11. `lib/adminFetch.ts`

| 項目 | 内容 |
| --- | --- |
| なぜ困難か | クライアント側の fetch ラッパーで、403 検知時の `update()` リトライという副作用を持つ（[lessons-learned.md](lessons-learned.md) の2026-08-04 の記録を参照） |
| どうテストするか | jsdom project で `next/navigation` と `next-auth/react` をモックして単体テストする |
| 状態 | 未対応（Phase 12 以降） |

### 1-12. `lib/logger.ts`（pino）

| 項目 | 内容 |
| --- | --- |
| なぜ困難か | 出力先が実行環境依存で、検証する価値が薄い |
| **対象外** | **テストしない。** ただし他テストの出力を汚染するため、setup で silent 化する（[#431](https://github.com/yamamotonaoki3/MyBookLibrary/issues/431)） |

### 1-13. Server Component / `next/navigation` / `next/image`

| 項目 | 内容 |
| --- | --- |
| なぜ困難か | Server Component は Jest でレンダリングできない。`useRouter` は Provider の外で呼ぶとエラーになる |
| どうテストするか | jsdom の setup で `next/navigation` と `next/image` を既定モックする |
| **対象外** | **Server Component は RTL でテストしない。** データ取得ロジックを `lib/` 側の関数に寄せてそこを単体テストし、画面全体の担保は E2E に任せる |

### 1-14. Google OAuth ログイン

| 項目 | 内容 |
| --- | --- |
| なぜ困難か | 外部IdP に依存し、ローカル／CIで完結できない |
| **対象外** | **自動テストしない。** `auth.ts` の providers 配列に条件付きで含まれることの静的確認のみ。動作は手動確認項目とする |

---

## 2. 依存関係から見たテストの実施順序

依存の浅い（他機能のデータ・認可に依存せず、純粋関数が多い）ものから着手する。

```
純粋関数（utils / normalizeAuthorName / validations / rateLimit / adminLimits）
  └ 外部APIクライアント（rakuten / ndl / calil）
       └ 認証・認可（auth.ts / auth.config.ts / session.ts）… 以降すべての前提
            ├ 書籍検索・登録 → 読書ステータス → 書籍編集/削除
            ├ 感想 → いいね／通報 → 通知
            ├ お気に入り著者 → 新刊通知（cron）
            ├ フォロー / 文学賞 / 図書館蔵書検索
            └ 監査ログ → 管理者API → 管理画面UI → お問い合わせ
```

**認証・認可がボトルネック。** ほぼ全ての API が `getAuthenticatedUserId` / `requireAdminSession` を通るため、ここのテストと理解が固まっていないと、以降のテストで「401/403 の期待値」を毎回作り直すことになる。共通化は `src/__tests__/helpers/sessionMock.ts` で済ませてある。

---

## 3. 外部APIへの配慮（実リクエストを飛ばさない）

本アプリは3つの外部API（**楽天ブックス書籍検索API・NDLサーチ・カーリル**）を利用する。テスト整備でこれらに負荷や不正リクエストを与えないことを、Phase 0 の必須要件とする。

### 3-1. 現状のリスク実態

| 箇所 | 実装 | リスク |
| --- | --- | --- |
| `lib/rakuten.ts:44` | 実エンドポイント直叩き＋48行目に指数バックオフのリトライ | 失敗時にリクエストが増幅する |
| `lib/calil.ts:74,98` | `continue` が 0 になるまで2秒間隔でポーリング継続 | 1操作で複数リクエスト。カーリルは規約でポーリング間隔を要求している |
| `lib/ndl.ts:116,140,184,199` | OpenSearch / SRU を4箇所から直叩き | 検索1回で複数エンドポイントを叩く |
| `api/cron/check-new-books` | 全ユーザー×お気に入り著者をループして楽天を検索 | 1回の実行で数十〜数百リクエスト |

### 3-2. 対策

| # | 対策 | 実施 |
| --- | --- | --- |
| 1 | **Jest の fetch 禁止ガード** — `global.fetch` の既定実装を「呼ばれたら URL 付きで throw」にし、全 project に適用する。モック漏れが実リクエストではなく**テスト失敗**として即座に露見する | [#431](https://github.com/yamamotonaoki3/MyBookLibrary/issues/431) |
| 2 | **E2E はローカルスタブサーバーへ向ける** — 外部 fetch は Route Handler＝**サーバー側**で発生するため、Playwright の `page.route()` では捕まえられない。ベースURLを環境変数化してスタブに差し替える | [#434](https://github.com/yamamotonaoki3/MyBookLibrary/issues/434) [#435](https://github.com/yamamotonaoki3/MyBookLibrary/issues/435) |
| 3 | **cron は自動テストで実行しない** — 結合テスト（fetch モック）のみ。E2E・手動実行の対象外 | Phase 8 |
| 4 | **実APIへの疎通確認は任意実行・既定スキップ** — `npm run test:external` でのみ実行。1 APIにつきリクエスト1回、リトライ無効、**CIから完全除外** | 保留 |

### 3-3. 「飛んでいない」ことの証明方法

1. **ネットワークを遮断した状態で全テストが通ること** — オフライン、またはローカルのスタブサーバーのみに到達可能な状態で Jest・E2E を含む全テストを実行する。外部APIへ到達できない条件でも完走することを、実リクエストが飛んでいないことの最も強い証拠とする（**ただし E2E には 3-5 に記載の既知の例外が1件ある**）
2. **fetch ガードの負例を確認すること** — モックを意図的に外したテストが、外部URLへの fetch を検知して**失敗すること**を確認する。これにより、モック漏れをテスト失敗にするガードが実際に機能していることを示す
3. **ダミーAPIキーは補助的な運用確認に限る** — `RAKUTEN_APP_ID` / `CALIL_API_KEY` をダミー値にしても、リクエストが相手サーバーへ到達し、認証エラーとして拒否される可能性があるため、実リクエストが飛んでいない証明にはならない。CIに実キーを置かない運用と、テストが実キーに依存していないことを確認する目的でのみ用いる。なお、NDLサーチはAPIキーを必要としないため、ダミーキーによる確認の対象外である

### 3-4. 手動ブラウザ確認について

ワークフロー手順6の手動確認は実APIを叩くが、**アプリの通常利用と同じ1操作＝数リクエストの範囲**なので許容する。ただし **cron エンドポイント（`api/cron/check-new-books`）の手動実行は禁止**とする。

### 3-5. 既知の例外：`next/font/google`（Geist / Geist Mono）は対象外

`src/app/layout.tsx` は `next/font/google` で Geist・Geist Mono を読み込んでおり、`next dev` 起動時（`next build` も同様）に Next.js 自身が `fonts.googleapis.com` へ CSS/フォントファイルを取得する。これは E2E（#435）の「外部通信ゼロ」の対象**外**として扱う。

- **本節が対象とする外部APIは、楽天・NDL・カーリルの3つに限定される。** これらは ToS・レート制限・課金の観点で明示的な配慮が必要（3-1参照）だが、Google Fonts はそれらとは性質が異なる（高可用な公式CDN、Next.js自体が標準機能として依存する、E2Eの有無に関わらず通常の開発・本番でも同様に発生する）
- **技術的な理由で対処を見送った。** Next.js公式の緩和策 `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` は Webpack 向けの実装で、本プロジェクトが使う Turbopack（`next.config.ts` の `turbopack: {}`）では別経路（Rust実装）のため効かない。実際に試したところ、ビルド自体が壊れる形で失敗した（2026-08-11 検証）
- **実害は小さいと判断した。** GitHub Actions（`ubuntu-latest`）は既定でインターネット接続があるため、CIでハングする心配はない。フォントの取得は `next dev` サーバー起動時に1回のみで、テストケースごとに繰り返されるものではない
- **完全に対処する場合の選択肢**（今回は見送り）: `next/font/google` を `next/font/local` に切り替えフォントファイルをリポジトリに同梱する（アプリ本体の変更を伴う）。必要になった場合は別Issueで扱う

---

## 4. 更新方法

- テストを追加して状態が変わったら、該当項目の「状態」を更新する
- 新たに「テストしにくい箇所」が判明したら1章に追記する。**「なぜ困難か」と「どうテストするか」を必ずセットで書く**
- 「対象外」と決めたものは、その判断理由を必ず残す。理由の書けない除外は、単なるサボりと区別がつかない

## 関連ドキュメント

- [test-plan.md](test-plan.md) — 対象範囲と進捗（正本）
- [lessons-learned.md](lessons-learned.md) — 実装中の学び・手直しの記録
- [requirements.md](requirements.md) — 要件定義
- [api-spec.md](api-spec.md) — API仕様
