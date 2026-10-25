# Issue #776：PWAビルド依存の更新と検証

2026-10-25時点。PR #781のマージコミット `079d2218ec40c4644f4344aebf08bea03dcbbe37` を基準に調査した。

ユーザーが小さなforkを管理する方針を選択し、[具体設計](superpowers/specs/2026-10-25-pwa-dependency-fork-design.md)と[実装計画](superpowers/plans/2026-10-25-pwa-dependency-fork.md)を確認後、続行を指示した。以下に実装結果と更新前の調査を分けて記録する。

## 採用した更新

- [ローカルfork](../app/vendor/next-pwa/UPSTREAM.md)は上流10.2.9のMITライセンス・README・配布JavaScript・型定義を保持する。tarballのintegrityと各ファイルのSHA-256を照合した。変更はpackage.jsonのローカル版番号・private指定とWorkbox依存4種類の7.4.1への更新のみ。
- アプリはfile依存とプロジェクト内のinstall-links設定で通常のパッケージとして導入する。Dockerのbuild/runtime両ステージにもvendorと設定をnpm ci前に配置する。外部fork/npm公開は行わない。
- 実際の解決経路はnext-pwa 10.2.9-mbl.1 → workbox-build / workbox-webpack-plugin 7.4.1 → @rollup/plugin-terser 1.0.2 → serialize-javascript 7.1.4。直接依存宣言の変更はnext-pwaだけ。force・override・ダウングレードは使用しない。
- npm ciとnpm ls --allは成功。元のnode_modulesがない一時領域のprod-only導入でも、同じforkとWorkbox 7.4.1を解決した。npm 11では一般のpackage-lock-only更新が旧registry情報を保持したため、対象のfile依存を明示して再解決した。
- 全依存の監査は15件（moderate 6 / high 9）から10件（moderate 2 / high 8）へ減少。対象のserialize-javascriptの3 GHSAはすべて消失。件数は依存への伝播を含む。
- prod-only監査の残存はhigh 3件（Prisma/config/deepmerge-tsの経路）。全依存の10件と混同せず、後続#778で追跡する。

## キャッシュ保護と実際に検証するE2E

[PWA本番E2E](../app/e2e-pwa/cache-isolation.spec.ts)はnext devではなくproductionビルド＋next startで実SWを制御し、テスト専用MySQLと外部APIスタブを使う。架空の2ユーザーがそれぞれ持つ読書データでHTML・RSC・セッション・一般APIを実取得し、CacheStorageとオフライン応答を確認する。

更新前の設定では、オフラインでも一般APIとRSCの取得が成功し、旧start-url等のキャッシュも残ることを実測した。これを次の変更で修正した。

- start-urlの自動キャッシュと既定ランタイムルールを無効化。画面・全API・RSC・Next dataをNetworkOnlyにし、明示した同一originの公開資産だけをCacheFirstにする。任意のpublicファイルはprecacheせず、webpackの静的チャンクは維持する。
- カスタムSWのactivateで既知の旧個人データキャッシュ8種類だけを削除し、無関係なキャッシュを保持する。
- 認証プロキシが未認証のSW取得をログインへ転送する問題も検出した。sw.jsとハッシュ付きのWorkbox/PWA workerだけを公開し、API・類似パスを拒否するテストを追加した。
- 判定関数はSWへ文字列化された別コンテキストでも動作することを境界値23テストで確認する。本番E2Eはユーザー切替、個人URL/本文の非キャッシュ、オフライン取得拒否と公開アイコンの利用、旧キャッシュ削除・無関係キャッシュ保持を検証する。
- 本番テスト用ビルドはDBガード・テスト専用の信頼ホスト・外部APIスタブ・ローカルフォントCSSを使う。実APIや開発DBへのアクセス、フォントの外部ダウンロードに頼らない。既存通常E2E・デモE2Eとは同じDBを順番に使い、CIにも追加した。

## 更新後の残存警告

| 経路 | 警告・担当 |
| --- | --- |
| OpenNext Cloudflare → AWS → @node-minify/core → glob | globのGHSA-5j98-mcp5-4vw2。#774のビルド依存調査領域。今回のPWA経路の解消と分ける |
| OpenNext Cloudflare → wrangler → miniflare → undici | undiciのGHSA-4qv8-2p9j-2685 / GHSA-f72v-6w45-q472 / GHSA-xjj6-f33q-929c。#774の互換制約の記録を参照 |
| prisma → @prisma/config → deepmerge-ts | GHSA-ggr8-5vv4-36mx。Prisma 6維持の調査は後続#778 |

これら10件を本Issueで解消したとは扱わない。無関係な依存更新を混在させず、対象3 GHSAの消失と分けて追跡する。

## 検証記録

- 更新前のキャッシュE2Eは実SW登録・実ログイン後に2件とも意図した挙動で失敗し、修正後は2件とも成功した。
- `npm run check`：型・lint・ドキュメント検査成功、72スイート/751テスト成功。既存の作業用build-konomys-csv.mjsに未使用関数のlint警告1件があるが、エラーはない。
- `.env.test`明示の本番PWA E2E：2件成功（追加のオフライン画面遷移拒否を含む）。通常E2E：96件成功。デモE2E：7件成功。リトライなし。
- Linux（Node.js 22.23.4/glibc）の`npm ci`、D1結合テスト（97件成功/3件スキップ）、`build:worker`、`smoke:worker`（10項目成功）を確認した。wasm同梱、D1の認証・保護画面・Cronを含む。
- 実際のDockerfileのbuild/runtime両ステージが成功。完成イメージでNode.js 22.23.4、Prisma CLI、ログイン200・保護画面307、SWとWorkbox/カスタムworkerの直接取得200、秘密設定ファイルの除外とsymlinkでないforkの導入実体を確認した。
- 上流15ファイルを再照合し、宣言したpackage.json差分以外は一致。core.autocrlf=trueでも対象ディレクトリの.gitattributesによりGitのフィルター適用後にバイト列が変わらないことを確認した。
- MySQL結合テストの初回は83件成功/16件スキップ/1件失敗。email-normalization.itest.tsのbeforeEach内resetDbが5秒制限を超えた。重い検証の終了後に同じコマンドで全体を再実行し、15スイート/84件成功・16件スキップ・失敗0件を確認した（179.351秒）。テストやタイムアウト設定は変更していない。初回の失敗を隠して全試行成功とは記録しない。
- `codex review --uncommitted`の追加レビューは指摘なし。レビュー側も型チェックとキャッシュ/公開パス33テストを独立に実行した。production E2E・Docker・Workerは実装側で上記のとおり実行し、レビュー側の実行とは区別する。

## 更新前の調査（判断時点）

現在の依存宣言を守る通常の更新だけでは、PWA経由の `serialize-javascript` の警告を解消できない。公開版の `@ducanh2912/next-pwa` は最新も10.2.9で、Workboxを完全一致で固定している。PWA実装を変更する前にユーザー判断を得る、というIssueの条件に到達した。

この調査段階ではアプリコード・依存ファイル・DBを変更していなかった。上の実装結果とは区別する。

## 調査方法と結果

- `npm audit --json`：全依存15件（moderate 6 / high 9 / critical 0）。件数は依存経路への伝播を含み、独立した攻撃経路の数ではない。
- `npm explain @rollup/plugin-terser serialize-javascript workbox-build`：以下の完全一致依存と、`serialize-javascript@6.0.2` を確認。
- `npm view`：公開版の依存定義・最新バージョンを確認。候補の公開を確認しただけで、プロジェクトへの採用や互換性検証はしていない。

| 親パッケージ | 宣言された依存 | 現在の解決版 |
| --- | --- | --- |
| `@ducanh2912/next-pwa@10.2.9` | `workbox-build: 7.1.1` | 7.1.1 |
| 同上 | `workbox-webpack-plugin: 7.1.0` | 7.1.0 |
| `workbox-webpack-plugin@7.1.0` | `workbox-build: 7.1.0` | 7.1.0（別のコピー） |
| 上記2種類の `workbox-build` | `@rollup/plugin-terser: ^0.4.3` | 0.4.4 |
| `@rollup/plugin-terser@0.4.4` | `serialize-javascript: ^6.0.1` | 6.0.2 |

公開されているWorkbox 7.4.1は `@rollup/plugin-terser: ^1.0.0` を使い、公開版の同プラグイン1.0.2は `serialize-javascript: ^7.0.3` を使う。シリアライザーの最新は7.1.4（Node.js >=20）である。しかし、現行PWAラッパーの完全一致依存はWorkbox 7.4.1を許容しない。これを強制するoverrideやダウングレードは採用していない。

公開パッケージ定義：

- [next-pwa 10.2.9](https://registry.npmjs.org/@ducanh2912%2fnext-pwa/10.2.9)
- [workbox-webpack-plugin 7.1.0](https://registry.npmjs.org/workbox-webpack-plugin/7.1.0)
- [workbox-build 7.4.1](https://registry.npmjs.org/workbox-build/7.4.1)
- [Rollup terser plugin 1.0.2](https://registry.npmjs.org/@rollup%2fplugin-terser/1.0.2)
- [serialize-javascript 7.1.4](https://registry.npmjs.org/serialize-javascript/7.1.4)

## 対象アドバイザリー

| ID | 修正済み版 | この構成で調べるべき入力・利用条件 |
| --- | --- | --- |
| [GHSA-5c6j-r48x-rmvq](https://github.com/advisories/GHSA-5c6j-r48x-rmvq) | 7.0.3 | 攻撃者が細工したRegExp/Dateオブジェクトをシリアライズし、その結果が評価される条件 |
| [GHSA-qj8w-gfj5-8c6v](https://github.com/advisories/GHSA-qj8w-gfj5-8c6v) | 7.0.5 | 細工した配列様オブジェクトがシリアライズ対象になる条件 |
| [GHSA-m5mm-p8h7-m29v](https://github.com/advisories/GHSA-m5mm-p8h7-m29v) | 7.1.3 | 細工した関数のソースがシリアライズされ、HTMLのscript要素へ埋め込まれる条件 |

Issueで参照されていた [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)（braces）は2026-10-23に撤回済み。現在の監査でPWA経由に残る上記の警告と分けて扱う。古い参照だけを理由にfast-globやbracesを更新しない。

## 入力と実行経路の静的調査

調査した固定版のソース：

- `node_modules/workbox-webpack-plugin/build/generate-sw.js`：GenerateSWがWorkboxのテンプレートを作り、ビルド用のbundle処理を呼ぶ。
- `node_modules/workbox-build/build/lib/bundle.js`：productionモードでterserプラグインを追加する。渡すオプションは、固定のmangle設定と通常の正規表現 `/(^_|_$)/`。
- `node_modules/@rollup/plugin-terser/dist/cjs/index.js`：`context.options` をシリアライズしてビルド用のNode.js workerへ渡し、workerでそのオプションを評価する。圧縮対象のJavaScriptコードは別の文字列フィールドとして渡している。

この呼び出し元では、シリアライズ対象はビルドツールが作った設定であり、本のタイトル・レビュー・認証APIの入力を設定オブジェクトへ渡す処理は確認されなかった。アプリの実行用ソース（生成Clientとテストを除く）にも、対象のビルドパッケージを直接importする箇所は見つからなかった。

これは確認した呼び出し経路からの判断であり、「攻撃不能」や「Workerへの同梱なし」の実測証明ではない。ビルド設定・依存ソースを変更できる主体は別の信頼境界になる。特に、シリアライズ結果を評価する処理自体は存在するため、パッケージが残る状態を脆弱性修正済みと扱わない。

## 更新前のPWAと検証の制約

現行の [next.config.ts](../app/next.config.ts) は、画面ナビゲーションと `/api/auth/` を `NetworkOnly` に設定している。フロントエンド遷移時の積極的キャッシュは無効。既存のPWAインストール・スタンドアロン起動・通知バッジを維持することは [要件定義](requirements.md) に従う。

現行 [Playwright設定](../app/playwright.config.ts) は `next dev` を起動し、PWAはdevelopment時に無効になる。このため、既存のE2E成功だけでは生成Service Workerのキャッシュ分離やオフライン挙動を検証できない。

PWA生成部分を変更する場合は、productionビルドに対するService Worker登録、認証API・画面ナビゲーションの非キャッシュ、ユーザー切替・ログアウト、オフライン、静的資産、Linux WorkerのビルドとD1疎通を別途検証する必要がある。今回それらの動作検証を実施したとは扱わない。

## 方式の比較（判断前の記録）

### 現行next-pwaを基にした小さなfork

next-pwa 10.2.9の動作を基準に、パッケージ自身の完全一致依存をWorkbox 7.4.1系へ更新する案。親パッケージの依存宣言を修正するため、既存宣言を無視して上書きするoverrideとは異なる。インストール・Service Worker生成・Cloudflare互換性は、まだ検証していない。

upstreamの [パッケージ情報](https://registry.npmjs.org/@ducanh2912%2fnext-pwa/10.2.9) ではMITライセンス。forkを採用する場合はライセンス・出典・元の版と変更差分を保持し、上流との追従責任を明記する必要がある。リポジトリ内のローカルパッケージとして管理する場合は、Dockerのbuild/runtime両ステージの `npm ci` より前にそのパッケージを配置する対応も必要になる。外部へのfork公開やパッケージ公開を、この案の調査だけで許可されたとは扱わない。

利点は、既存のPWAラッパーと設定を基準に差分を絞れること。欠点は、第三者パッケージの変更版をプロジェクト側で保守する責任が増えること。

### Serwistへの置換

[公式のwebpack向け導入手順](https://serwist.pages.dev/docs/next/getting-started) とnpmの公開情報を確認した。`@serwist/next@9.5.13` はNext.js >=14 / React >=18を宣言し、現在の主要バージョンは範囲内。現行のproductionビルドもwebpackだが、これだけでOpenNextや既存PWAとの実動作互換を証明したことにはならない。

公開定義では `@serwist/next@9.5.13` と `@serwist/build@9.5.13` が `zod: 4.6.5` を完全一致で依存している。これは [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) の影響範囲（4.6.6未満）に含まれる。#775で解消した別の警告を再導入するため、現時点で単純な置換先として推奨しない。preview版は採用していない。

確認した定義：[next 9.5.13](https://registry.npmjs.org/@serwist%2fnext/9.5.13)、[build 9.5.13](https://registry.npmjs.org/@serwist%2fbuild/9.5.13)。

## 判断と保守

Issue #776の実装前判断を経て、小さなforkを採用した。今後はUPSTREAM.mdの再作成手順・ハッシュ照合と同じ互換性検証を使い、上流が修正された場合もレビュー後に切り替える。外部公開・本番反映はこのローカル実装に含めない。
