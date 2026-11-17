# ブラウザーの保護と外部コンテンツ（#841）

## 採用方針
既存機能を維持する最小案を採用した。Next.jsの全パスとCloudflare ASSETSの静的応答に共通ヘッダーを設定し、アプリの表示・入力の両方で外部URLを確認する。新依存・DB変更・画像のサーバー代理取得は追加しない。

- X-Content-Type-Options: nosniff、X-Frame-Options: DENY。
- Referrer-Policy: strict-origin-when-cross-origin。Permissions-Policyはcamera=(self)、microphone=()。バーコード用カメラは同一originで使用できる。
- CSPはdefault-src selfを基準とし、script/styleのunsafe-inlineを維持する。任意外部script、object、iframe/第三者からの埋め込みを拒否し、base/formをselfに限定する。書影はself/http/https/data、worker/mediaはself/blob、font/connectはself。開発時のみunsafe-evalとWebSocket接続を許可する。
- 認証APIなどproxyを通さないNext応答にもNextのheaders設定を使う。Cloudflare ASSETSはNextのheaders()を通らないため、`app/public/_headers` の `/*` に `buildSecurityHeaders(false)` と同じ本番ヘッダーを定義する（SW・manifest・静的ファイルを含む）。HSTSの長期固定・preload・COOP・nonce方式は今回追加しない。

このCSPはNextの既存inline bootstrap/styleを許す互換性重視の設定であり、inline scriptを禁止する厳格CSPや、すべての入力攻撃を防ぐ保証ではない。nonce方式はNextの動的レンダリングとの整合確認が必要なため採用していない。

## 図書館の予約先
絶対HTTP(S) URLのみリンクにする。ユーザー名・パスワード付き、非Web scheme、相対URL、内部の空白/制御文字、バックスラッシュを含むURLは予約リンクにしない。図書館の貸出状態は引き続き表示する。正規のHTTP図書館サイトも維持し、hostを一律限定しない。別タブ・noopener noreferrer・外部アイコンを維持し、外部サイト/新しいタブである案内を読み上げにも付ける。

## 書影
一般登録/編集、管理者の登録/編集、CSVで同じHTTP(S) URL条件を使う。空欄は書影なしとして扱い、任意hostの手動書影を維持する。既存DBを一括変更せず、表示時に非対応URLをNo Imageへ置き換える。取得失敗・欠落もNo Imageになり、URL変更後は新しい画像を再試行する。古い非Web書影メタデータが読書ステータスの変更を妨げないよう送信時に除外する。

表示・遷移には `getSafeWebUrl` が正規化したURLを使う。保存・読書ステータス送信では同じ安全性検証後に元の文字列の前後空白だけを除去し、日本語パスのパーセントエンコードによる `cover_image_url`（VARCHAR(191)）の超過を避ける。不正な既存・外部メタデータは読書ステータス送信時にnullにする。

HTTP書影はHTTPSページのmixed content制約等で取得できない場合がある。HTTP(S)であっても取得成功や提供元の安全性を保証せず、取得できなければ代替表示する。

## 検証の境界
検証はテスト専用DB・架空ユーザー・ローカルの外部API/画像/予約先スタブで行う。Google OAuthの実サービス往復、実在の図書館/書影配信、実機カメラ、本番・ステージングへのHTTP確認は行わない。PWAはdevelopmentで無効になるため、productionのローカルビルドで別に確認する。

### 回帰テストの対象（実行結果ではない）

- `browserProtectionHeaders.test.ts` は `public/_headers` をパースし、対象が `/*` だけで、キー・値・件数が `buildSecurityHeaders(false)` と完全一致することを確認する。Nextのヘッダー検証と、ASSETS用の宣言の同期検証は別である。
- `protectionStub.test.ts` は通常のカーリルfixtureが変わらないこと、オプトインしたサーバーだけが実際の待受ポートのloopback予約URLと `/stub/reserve` のローカルHTMLを返すことを確認する。
- `e2e-pwa/browser-protection.spec.ts` は追跡対象の `test.use.launchOptions` でfake deviceとfake UIを指定する。`serviceWorkers: allow` を維持し、貸出チェックの前に `navigator.serviceWorker.controller` を確認する。ISBN `9784101010014` の架空書籍と `Tokyo_Bunkyo` / `図書館` の架空登録図書館をテスト専用DBに作り、実アプリAPI→サーバー側カーリルスタブ→画面表示を検証する。`page.route` のAPI応答置換やSWのブロック・登録解除は使わない。
- 予約リンクのURL・別タブ・rel・案内とローカルHTMLへの遷移、書影の成功/失敗表示、fake cameraのlive映像と「キャンセル」での終了を検証する。在庫モーダルの「閉じる」は維持する。

PWA設定のスタブは既定 `http://localhost:3999`。隔離実行時は `PROTECTION_STUB_ORIGIN=http://localhost:4492` を指定すると、追跡対象のPWA設定がスタブのポートとアプリの外部API接続先を揃える（HTTPのlocalhost origin・明示ポートだけを許可）。同設定はスタブプロセスにもこの変数を渡し、ローカル予約先を明示的に有効化する。通常suiteの `createStubServer()` と変数未指定のCLIは従来fixtureを返す。予約先はリクエストのHostや任意の外部URLから作らず、実際の待受ポートから組み立てる。

### 配送と未検証事項

既存のWrangler設定は `assets.directory: .open-next/assets` と `ASSETS` を維持する。インストール済みOpenNextのソースでは、Cloudflareのbuildが `createStaticAssets` を呼び、その処理が `public` 全体をassetsへコピーすることを確認した。この既存処理に `public/_headers` の同梱を任せ、追加のコピー処理やrouting変更は行わない。これはローカルのパッケージ処理のソース確認であり、今回の変更後のOpenNextビルド成果物や公開Cloudflare上の適用確認ではない。

`next start` のヘッダー確認だけではCloudflare ASSETS上の適用は検証できない。本番・ステージングでの配信ヘッダー、実外部サービスへの遷移・応答、実機カメラ（読み取り精度を含む）は未検証のままであり、ローカルテスト成功から保証しない。

### ローカル実行結果（2026-11-17）

- 最終品質チェック：typecheck・lint・docs check・Worker build単体とJest 93 suites / 909 tests成功。独立CLIレビューは第1回の有効4指摘を修正後、第2回で指摘なし。PWA fixtureの循環型推論エラーは配列の型注釈だけで解消し、最終typecheckで確認した。
- 対象結合テスト：reading-statusとadmin-role-and-primary-isbnの2 suites / 18 tests成功。テスト専用MySQLのみ使用。
- 通常E2E：新規保護4シナリオ、既存認証・図書館シナリオを含め23件成功。実HTTPヘッダー、外部script拒否、HTTP予約先、書影成功/失敗、旧非Web書影の読書状態変更、不正URLの各API拒否を確認した。
- productionビルド：build:test:pwa成功。production PWAは新規保護1件と既存キャッシュ分離2件の計3件成功。SW制御下の実API経路、local予約先への別タブ遷移、書影fallback、疑似カメラ映像とキャンセル終了を確認した。
- ローカルCloudflare Assets：既存Wranglerのassets-only設定（main・D1・bindingなし）でpublicを127.0.0.1に一時配信し、`/sw.js`・`/manifest.json` の200応答と5ヘッダーを完全一致で確認した。設定は検証領域だけに置き、終了後の接続拒否を確認した。Next経由の確認とは独立したAssets層の検証であり、OpenNextの成果物同梱・公開環境の実測ではない。
- レビュー修正の対象単体：2 suites / 5 tests成功。ASSETS用宣言とproduction builderの完全一致、既存スタブfixtureの維持、オプトインしたローカル予約先を確認した。

このWindows worktreeは既存依存をjunctionで参照したため、Turbopackがroot外のNextを解決できなかった。通常E2Eは検証用設定だけwebpackに切り替えて実行し、追跡対象の開発設定は変更していない。Turbopackでの本変更のE2Eは未確認。productionビルドは既存webpack経路を使用した。通常E2EにMaxListenersExceededWarning、build後のJestにstandalone/package.jsonのhaste名重複警告、PWA起動にstandalone構成でnext startを使う警告が出たが、上記テストは成功した。
