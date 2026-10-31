# 互換更新の依存監査（Issue #804）

## 対象と方法

通常のsemver制約を保ったlockfile更新で、glob、minimatch、deepmerge、deepmerge-tsの対象GHSAが減るかを確認した。基準ブランチの依存lockを使ったクリーン一時コピーを作り、基準auditと候補auditを近接した時刻に取得した。候補コピーには `app/package.json`、`app/package-lock.json`、`app/.npmrc`、`app/vendor/next-pwa` だけを配置し、既存の `node_modules`、`.env*`、`.dev.vars*`、実データ、ローカル設定は持ち込んでいない。

| 項目 | 値 |
| --- | --- |
| 基準HEAD | `5d4d927b770220d9ce88128f176808eaa31a8589` |
| 基準 `app/package.json` のGit blob | `cb2c40fbe1ab0c7eb7049b5a7a27c003f3a74b95` |
| 基準lockのGit blob | `5d4fa15b4631710bed051523bbe05a3e6f882daa` |
| Node.js / npm | `v24.22.1` / `11.19.1` |
| 取得日 | 2026-10-31（JST） |

PowerShellから保存したaudit JSONはUTF-16LEとしてNode.jsの `JSON.parse` で読み取った。npm auditの終了コード1は脆弱性を検出した結果であり、通信・認証エラーではない。`npm audit fix --dry-run --ignore-scripts --json` も終了コード1で、全解消には `--force` が必要という案内だった。dry-run出力はJSONとして解釈できる形式ではなかったため、保存したJSONとは別に終了コードと表示された脆弱性件数を記録した。dry-run後も `node_modules` は作られていない。

## 基準と候補の比較

| 監査 | 基準 | `glob` / `minimatch` 候補 |
| --- | ---: | ---: |
| 全依存 | 53（low 3 / moderate 43 / high 7 / critical 0） | 53（low 3 / moderate 43 / high 7 / critical 0） |
| `--omit=dev` | 18（low 3 / moderate 12 / high 3 / critical 0） | 18（low 3 / moderate 12 / high 3 / critical 0） |

候補は基準コピーから `npm update glob minimatch --package-lock-only --ignore-scripts` を実行したもの。終了コードは0だった。lock差分は2ノードだけで、`@ts-morph/common/node_modules/minimatch` と `@typescript-eslint/typescript-estree/node_modules/minimatch` が `10.2.5` から `10.2.6` になった。どちらもGHSA-g3hv-75wg-m249の影響範囲 `<11.0.1` に残り、監査件数・対象GHSA・影響nodeに変化はなかった。この候補lockは採用しない。作業ブランチの `app/package.json` と `app/package-lock.json` は変更していない。

## 対象GHSAと影響node

候補と基準のaudit JSONを比較し、以下のGHSAと `nodes` が全依存・`--omit=dev` の両方で一致することを確認した。

| Advisory | 監査node（全依存） | `--omit=dev` node |
| --- | --- | --- |
| [GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2), [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) (`glob`) | `node_modules/@node-minify/core/node_modules/glob`, `node_modules/@opennextjs/cloudflare/node_modules/glob`, `node_modules/glob`, `node_modules/test-exclude/node_modules/glob`, `node_modules/workbox-build/node_modules/glob` | `node_modules/workbox-build/node_modules/glob` |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) (`minimatch`) | `node_modules/@node-minify/core/node_modules/minimatch`, `node_modules/@opennextjs/cloudflare/node_modules/minimatch`, `node_modules/@ts-morph/common/node_modules/minimatch`, `node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch`, `node_modules/filelist/node_modules/minimatch`, `node_modules/glob/node_modules/minimatch`, `node_modules/minimatch`, `node_modules/workbox-build/node_modules/minimatch` | `node_modules/@ts-morph/common/node_modules/minimatch`, `node_modules/filelist/node_modules/minimatch`, `node_modules/workbox-build/node_modules/minimatch` |
| [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) (`deepmerge`) | `node_modules/deepmerge` | `node_modules/deepmerge` |
| [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) (`deepmerge-ts`) | `node_modules/deepmerge-ts` | `node_modules/deepmerge-ts` |

`npm audit` reports `nodes` on its package-level vulnerability record. A record can contain multiple `via` advisories, so this table compares the complete package node set and advisory list between the two locks; it does not establish that every GHSA applies to every listed node.

## 互換性の確認と採否

2026-10-31にnpmの公開メタデータと、作業時点の依存宣言を照合した。

| 経路 | 公開版・制約 | 判定 |
| --- | --- | --- |
| `@node-minify/core@9.0.2` → `glob` | 公開依存は `glob@10.3.3`。修正版glob 14系を許容しない。 | 親の更新なしに対象GHSAを解消できない。見送り。 |
| `workbox-build@7.4.1` → `glob` | 公開範囲は `^11.0.1`。`glob@latest` は `14.0.3`。 | 14系は親範囲外。見送り。 |
| `jest-runtime@30.5.2` → `glob` | 公開範囲は `^13.0.6`。 | 14系は親範囲外。見送り。 |
| `minimatch` | 公開latestは `11.0.3`。通常更新では対象nodeを含むすべての範囲が11.0.1以上にならず、GHSAと影響nodeが残った。 | 件数が減らない候補lockを見送り。 |
| `deepmerge` | 公開latestは `4.3.1` で、監査対象範囲は `4.3.1` 以下。 | 修正版が確認できないため見送り。 |
| Prisma 6 → `@prisma/config` → `deepmerge-ts` | `@prisma/config@6.19.3` の依存は `deepmerge-ts@7.1.5`。解消に必要な8系を通常のPrisma 6制約では選べない。 | Prisma major更新・RC導入は対象外のため見送り。 |

互換更新の候補が対象警告を減らさなかったため、依存更新は導入しない。npm auditの件数は依存lock上の警告であり、実行時の到達性や独立した攻撃経路の数を表すものではない。特に `--omit=dev` は依存区分を絞るだけで、Workerリクエストからの到達性を証明しない。

## 残存リスクと再確認条件

監査で見えるパッケージ経路から利用目的を整理した。今回、依存のソースコードや実行時の呼び出しを追って入力からsinkまでの到達性を証明してはいない。

| 経路 | 想定用途・入力・呼び出し元 | 未検証事項 | 再確認する条件 |
| --- | --- | --- | --- |
| `glob` / `minimatch` → `@node-minify/core`、`@opennextjs/cloudflare`、`workbox-build` | lock上ではOpenNext/Workerのビルド、node-minifyのファイル処理、WorkboxのService Worker/資産生成に付随する。入力候補はビルド設定と対象ファイル名・globパターン。呼び出し元は依存パッケージのビルド処理とみられる。 | アプリのHTTPリクエストやユーザー入力が各matcherへ渡るか、Worker実行時に該当コードがロード・実行されるか、個々のGHSAがどのnodeで成立するかは未追跡。`test-exclude` とルートnodeの呼び出し箇所も未追跡。 | 親パッケージが互換範囲を広げたとき、またはlock更新で対象nodeが変わったときに、修正版・semver制約・audit nodesを照合する。採用時は対応するOpenNext/WorkerまたはPWAビルド経路の回帰確認を行う。 |
| `minimatch` → `@ts-morph/common`、`@typescript-eslint/typescript-estree`、`filelist` | TypeScript解析・lint/test toolingのファイル選択に使う依存経路。入力候補はプロジェクト内のファイル名とツール設定。 | 実際にどの設定がパターンを供給するか、外部・ユーザー制御の値が渡るか、各nodeでGHSAを再現する呼び出し経路は未調査。 | 各親が `minimatch >=11.0.1` を通常制約で許容するリリースを出したときに、nodeごとの解決版・auditを再確認する。 |
| `deepmerge` → `@rollup/plugin-node-resolve`、`@shadcn/registry`、`shadcn` | ビルド設定・コンポーネントレジストリ関連の設定/オブジェクト結合経路と推定される。lockでは `shadcn` が依存nodeとして見える。 | どのregistry/API応答や設定オブジェクトが `deepmerge` に届くか、アプリの本番リクエストから到達するかは未追跡。npmのproduction区分は実行時到達性を証明しない。 | deepmergeの修正版が公開されたとき、または `shadcn` / Rollup利用箇所・配布区分が変わったときに、親制約と実際の呼び出し元を確認する。 |
| `deepmerge-ts` → `@prisma/config` | Prisma CLIの設定読込・統合時に設定値を結合する経路と推定される。入力候補は `prisma.config.*` 等のプロジェクト設定。 | Prisma設定の具体的な入力元、Prisma CLIがアプリの本番処理から呼び出されるか、再帰オブジェクトが外部制御されるかは未調査。 | Prisma 6内で8系を許容する互換リリースが出たときに再確認する。major移行は別Issueで互換性・移行手順を判断する。 |

## 検証

- 実施: 基準コピーで `npm audit --package-lock-only --json`（exit 1、53件）、`npm audit --package-lock-only --omit=dev --json`（exit 1、18件）。JSONのmetadataと脆弱性情報をNode.jsで解析した。
- 実施: dry-runはexit 1、脆弱性は53件のままで、npmは `--force` を案内した。forceは許容外。dry-run出力はJSONとして解析できる形式ではなかった。
- 実施: 候補コピーで `npm update glob minimatch --package-lock-only --ignore-scripts`（exit 0）と、同じ2種類のaudit（各exit 1）。全依存53件、`--omit=dev` 18件、対象GHSAとnode集合は基準と一致した。
- 実施: 候補lock差分は2つの `minimatch` nodeで `10.2.5` → `10.2.6` のみ。npm installは行わず `node_modules` がないことを確認した。候補lockは不採用。
- 実施: 作業ブランチの `app/package.json` と `app/package-lock.json` のblob hashは開始時の基準と一致し、依存マニフェスト・lockに変更はない。
- 実施: 最終docs-only変更後の `npm run check` はexit 0。typecheck、lint、check:docsを通過し、Jestは82 suites / 859 testsが成功した。
- 実施: 最終docs-only変更後の `npm run check:docs` はexit 0。文書65ファイルのリンク・パス検査に成功した。新規文書は一時 `GIT_INDEX_FILE` のintent-to-addで列挙し、実indexは変更していない。
- 省略: 候補lockは不採用でアプリコード・依存lockが変わらないため、`npm ci`、build、Worker、Docker、E2Eは実施していない。これらを依存互換性の証拠とは扱わない。
