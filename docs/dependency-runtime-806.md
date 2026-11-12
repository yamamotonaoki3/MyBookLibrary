# Issue #806: shadcn の実行時依存関係の検証

## 変更内容

`shadcn` を、既存のバージョン範囲 `^4.10.0` のまま `dependencies` から `devDependencies` へ移動した。lockfile上の同一性は維持されている。バージョンは `4.22.1`、レジストリtarballは `https://registry.npmjs.org/shadcn/-/shadcn-4.22.1.tgz`、integrityは `sha512-LbB4Lro+b0qSVki/tgL5edtKylEnXe1ppxMJC12d7NHPgaT+eSgJGMQULwP72V7X9tbiUq7xfx3VDAfB7jdGoA==`。lockfileの比較では、rootでの依存区分と、そこから派生する `dev` フラグ以外に、バージョン、解決先URL、integrity、パッケージ間の依存関係の変更はなかった。

基準コミット: `a4911740bb560ea4c970e8e4ae4081421b66d135`。基準時点の `app/package.json` のSHA-1は `cb2c40fbe1ab0c7eb7049b5a7a27c003f3a74b95`、`app/package-lock.json` のSHA-1は `5d4fa15b4631710bed051523bbe05a3e6f882daa`。リポジトリ内を検索した結果、CSSのimportは `src/app/globals.css` にあり、アプリのソース、Worker、スクリプトにはshadcnの実行時importはなかった。基準時の `npm explain` では、CLIからMCP/Expressへの依存経路が確認された。

`src/app/globals.css` の `shadcn/tailwind.css` importは維持した。ソースコード、Prisma、PWA、その他の依存区分は変更していない。

## 本番依存への実測影響

基準版と候補版は、同一のNode/npmバージョン（`v24.22.1` / `11.19.1`）を使い、クリーンなコピー上でpostinstallを有効にした `npm ci --omit=dev` により導入した。

| 測定項目 | 基準版 | 候補版 | 差分 |
|---|---:|---:|---:|
| npm本番導入時のパッケージパス数 | 680 | 492 | −188 |
| 本番導入時の `node_modules` バイト数 | 838,869,343 | 820,223,126 | −18,646,217 |
| Docker runner内のパッケージmanifest数 | 1,234 | 1,022 | −212 |
| Docker runner内の `node_modules` バイト数 | 765,665,888 | 728,058,578 | −37,607,310 |
| Dockerイメージサイズ | 2,061,739,852 | 1,980,290,818 | −81,449,034 |

Dockerイメージサイズには全イメージレイヤーが含まれるため、runner内に導入された `node_modules` のサイズとは分けて報告している。本番依存のみの監査対象が減ったのは、CLIと、そのCLI専用の依存ツリーを本番導入から外した結果であり、脆弱性を修正したものではない。

## CSSと実行時の検証結果

基準版と候補版のDocker buildはいずれも完了した。builderが生成したCSS manifestは一致した。

| CSSファイル | バイト数 | SHA-256 |
|---|---:|---|
| `css/09134e3ab47a454b.css` | 83,527 | `21a01fd19245b29882370579859d276765dbb3c29ed808b9925fb2941ebbc41a` |

manifestのテキストだけでなく、導入されたパッケージ自体の有無もassertで確認した。

- 基準版のクリーンな本番導入: `npm ci --omit=dev` は終了コード0。`shadcn@4.22.1` が存在したためassertは終了コード1で失敗した。
- 基準版のDocker runner: `shadcn` が存在したためassertは終了コード1で失敗した。
- 候補版のクリーンな本番導入: `npm ci --omit=dev`、`npm ls --omit=dev --all`、assertはいずれも終了コード0。postinstallでPrisma clientが2種類とも生成され、Prisma CLIのバージョンも正常に表示された。
- 候補版のDocker runner: assertは終了コード0。Prismaの生成先ディレクトリが2つとも存在し、Prisma CLIも正常に実行できた。

候補版は、クリーンな本番依存のみの導入を使った `next start` と、Docker standalone runnerの両方で動作を確認した。テスト専用の架空認証設定を使い、どちらも `/login` は200、参照先CSSは200、未認証の `/books` は307でリダイレクトし、`/api/auth/providers` と `/api/version` は200を返した。standaloneで返されたCSSのサイズは83,527バイトだった。

ブラウザー確認とPlaywright E2Eスイートは実行していない。既存のログイン/認証E2Eシナリオはユーザーから見える認証動作を確認し、`admin-visual-check.spec.ts` は管理画面のタブと選択状態を確認するが、本番依存ツリーやCSSのバイト一致は検証しない。今回の依存区分変更とasset配信については、本番依存のみでの `next start` とDockerのHTTP確認、および基準版/候補版のCSS hash完全一致で確認した。ブラウザー上の見た目の比較は未検証である。

## 監査結果

基準版と候補版の監査は、作業中の同じ時点で取得した。全依存を対象とする監査では、脆弱性のあるパッケージ記録とadvisory URLは一致しており、`shadcn` の移動によってパッケージのバージョンやadvisoryは変わっていない。

| 監査対象 | 基準版（low / moderate / high / critical） | 候補版（low / moderate / high / critical） |
|---|---:|---:|
| 全依存 | 53 (3 / 43 / 7 / 0) | 53 (3 / 43 / 7 / 0) |
| `--omit=dev` | 18 (3 / 12 / 3 / 0) | 14 (2 / 9 / 3 / 0) |

変わらず報告された5件のadvisory URLは、`GHSA-3g3m-2fjr-6pw4`、`GHSA-5j98-mcp5-4vw2`、`GHSA-g3hv-75wg-m249`、`GHSA-gcqx-w48m-w2h4`、`GHSA-ggr8-5vv4-36mx`。候補版の本番依存のみのレポートから除外された4つのパッケージ記録は、`shadcn`、`@shadcn/registry`、`ts-morph`、`@ts-morph/common` である。これらはすべて、候補版の全依存監査には残っている。`--omit=dev` の件数減少は依存区分とレポート対象の変化であり、脆弱性の修正ではない。全依存側のその他の検出結果に変化はなかった。

## Workerと品質チェック

候補版をクリーンに導入し、Linux/glibcのNode `22.23.4` 環境でbuildした。`npm run build:worker` と `npm run smoke:worker` は成功した。login、未認証時のredirect、パスワード認証の各結果、Prisma+D1への書き込み、session、Cron認可、scheduled trigger、ログにsecret値が含まれないことを含む、smoke確認10項目すべてが成功した。一時的なLinux検証環境にはシステムCA証明書と `SSL_CERT_FILE` を設定し、WranglerのローカルWorkers runtimeを起動できるようにした。この環境設定のためのアプリや依存関係の変更は行っていない。smoke suiteはローカルD1のみを使用した。

一時的なGit metadataを用意した候補版のクリーンコピーでは、`npm ci`、`npm ls --all`、`npm run check` がすべて終了コード0だった。`check:docs` ではMarkdownファイル66件を確認し、リンク切れはなかった。最初のクリーンコピーにはGit metadataがなく、初回のcheckは `git rev-parse` で停止した。そのため、Git metadataを付与したソース全体の一時コピーでcheckを成功させた。データベース動作に変更がないため、integration/E2Eのデータベースsuiteは実行していない。

## 対象範囲と未検証事項

この変更により、CLIと開発用依存ツリーにのみ属するパッケージが、本番依存のみの導入から除かれる。脆弱性のある推移依存パッケージの更新、CSSの削除や供給元の変更、Workerコードの変更は行っておらず、アプリケーションの脆弱性が減ったとも主張しない。ブラウザー上での描画とデータベースを使うE2E動作は確認していない。代わりにCSSのバイト一致と本番HTTPでの配信を確認した。
