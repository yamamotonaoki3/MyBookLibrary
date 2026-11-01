# Issue #809: Prisma 7セキュリティ移行の検証結果

**検証日:** 2026-11-01 (JST)

**対象:** `prisma`、`@prisma/client`、`@prisma/adapter-d1`、`@prisma/adapter-mariadb` をすべて正確な `7.10.1` に固定。

## 脆弱性監査

| 監査範囲 | 移行前 | 移行候補 |
| --- | ---: | ---: |
| 全依存ツリー | 53件（low 3、moderate 43、high 7） | 50件（low 3、moderate 43、high 4） |
| production依存ツリー | 14件（low 2、moderate 9、high 3） | 11件（low 2、moderate 9、high 0） |

最新lockfileの監査結果は全依存50件（low 3、moderate 43、high 4、critical 0）、production依存11件（low 2、moderate 9、high 0、critical 0）。対象の `GHSA-ggr8-5vv4-36mx` は存在しない。候補比較では新しいGHSAおよび新規package-node advisoryは見つからなかった。残る監査 finding は残存項目として扱い、今回の修正で解消したとは記載しない。

## 互換性と実装

- 既存の `prisma-client-js` generator と `engineType = "client"` を維持する。全体ESM化、override、fork、データモデル変更、migration SQL変更は行わない。
- 4つのPrisma packageを `7.10.1` に固定する。Prisma CLIとClientの実package engine条件は `^20.19 || ^22.12 || >=24.0`。アプリは既存のNode 22系方針を保ち、`^22.12 || >=24.0` を要求する。
- lockfileで `deepmerge-ts` は `8.0.2`、Prisma系4 packageはすべて `7.10.1` と確認した。
- MySQL URLをMariaDB adapterへ変換するfactoryを追加する。pool、接続timeout、TLS CAを既存URLの明示設定から組み立てる。`sslaccept=strict` は証明書検証を有効にし、`sslaccept=accept_invalid_certs` は明示指定された場合だけMariaDBの `rejectUnauthorized: false` に対応させる。CAがありTLS mode指定がなければstrictとして扱う。
- factoryはMySQL schema directoryをアプリrootの `prisma/` から解決する。Nextの生成bundle内で変化する `__dirname` に依存しない。証明書相対パスの解決と作業ディレクトリ変更への独立性は接続設定テストで確認する。
- migration source/target exampleの説明を共通factoryへ同期した。相対CAは `app/prisma/` 基準で解決し、target exampleでは `sslaccept=strict` と `pool_timeout=0` 非対応も説明する。
- `pool_timeout=0` は明示的に拒否する。Prisma 6ではpoolの無期限待ちを意味したが、MariaDB adapterのtimeout値0では同じ挙動を保証できないためである。公開exampleと既存接続設定での使用有無を確認し、見つからなかった。
- D1のbinding/request proxyと `D1_RUNTIME` 切替を維持する。Nodeは生成root entry、Workersは生成edge entryを使い、Prisma 7の `wasm-worker-loader.mjs` と `query_compiler_fast_bg.wasm` をOpenNext postprocessでWorker相対importにする。初回独立検査でdriver混入を検出した後、providerを直接分岐してMySQL singletonを別moduleへ隔離し、Worker build guardを追加した。修正後bundleの実code/driver path scanは0 hit。
- アプリのPrisma singletonはimport時に `DATABASE_URL` を要求せず、DBを初めて使う時点でClientを作成する。
- schema/model/migration SQLと実DBデータは変更していない。ロールバックはコード・lockfile・設定を同じGit revertで戻し、DB復元コマンドは追加しない。

## 検証結果

| 検証 | 結果 |
| --- | --- |
| baseline/candidate npm audit比較 | 対象GHSA解消。新しいGHSA/package-node findingなし |
| Prisma 7.10.1 MySQL・D1生成と初期runtime gate | 成功 |
| schema、Prisma config、D1 CLI、生成entry整合 | 成功。modelとmigration SQLは不変 |
| TypeScript typecheck | 成功 |
| `npm run check` | status 0。86 suites、872 tests成功。Worker postprocess回帰テストもcheckへ接続 |
| D1 binding/proxy単体テスト | 2 suites、19 tests成功 |
| MySQL integration | 15 suites成功、2 suites skip。84 tests成功、16 tests skip。process status 0 |
| 最終D1 integration (`test:integration:d1`) | status 0。16 suites成功、1 suite skip。97 tests成功、3 tests skip |
| envなしのDocker app build | builder/runner両stageがstatus 0で完了 |
| 完成app imageのPrisma CLI | Prisma CLI / Client 7.10.1、Node v22.23.4、Linux x64。DATABASE_URLなしで実行 |
| 完成app imageのHTTP/runtime smoke | login 200、CSS 200、未認証books 307→login、auth providers 200、version 200。両generated client rootをrequireし7.10.1を確認 |
| 最終clean Docker image build/runtime smoke | `reviewed-app-20261101` のbuilder/runner build status 0。CLIと両generated rootは7.10.1、Node v22.23.4。HTTP helper exit 0: login 200、CSS 200/83527 bytes、books 307→login、providers 200、version 200 |
| Linux Playwright 1.62.1環境 | clean candidate上でLinux `npm ci` とpostinstallを実行 |
| Linux Playwright単一smoke | `e2e/smoke.spec.ts` 1件成功（10.3秒）。25 migrationsは適用済み |
| Linux通常E2E | 101 passed、1 flaky、1 skipped。process status 0。flaky retryは `e2e/library-check-unified.spec.ts:69` の検索429/貸出チェックで、最初の5秒以内にボタンもrate-limit表示も見えず、retryでは成功した |
| Linux demo E2E | 7 passed。process status 0 |
| Linux PWA build/E2E | 同一container内で `build:test:pwa` の後に `test:e2e:pwa` を実行。2 tests passed、process status 0 |
| 修正前Linux Worker build/smoke | status 0。Prisma fast-WASM import 72件をWorker相対pathへ書換え、10項目すべて成功。Node 22.23.4/glibcで実施。smoke成功だけではdriver非混入を証明できなかった |
| 修正後Linux Worker build/smoke | status 0、10/10 checks成功。検査対象31 filesのSHA一致、network none、npm ci/full testなし、build:worker 1回。OpenNext出力3171 filesを走査し、実code hit 0・driver package path 0。package.json 2 filesには依存名がmetadataとして残るが、実コードではない |
| 修正後Worker WASM成果物 | 相対import72件・絶対import0件、3,304,603 bytesの有効binary。生成元SHA-256 `99b53db1575f67e5f9e8d33070b27918536b88e55e6232617dfc992c640bfbdf` と一致。保存成果物に対して再buildせずoffline `wrangler deploy --dry-run`を実行しstatus 0。最終配布4 filesでも実code hit 0・driver path 0・WASM hash一致 |
| Worker bundleサイズ比較 | 最終 `index.js` raw bytesは18,153,963→17,072,173（1,081,790減）、同じNode gzip条件で4,457,497→4,150,480 bytes（303,017減）。サイズ以外のperformance影響は未計測 |
| 最終 `npm ls` | status 0 |
| 修正後の最終 `npm run check` | 初回はtypecheck status 0後、MySQL require行のeslint-disable位置でlint停止。位置修正後はexit 0。86 suites/872 tests成功、Native Worker tests 2/2、docs check 71 files / 0 links error。実indexに変更なし。既存unused lint warning 1件のみ |
| Driver split後のMySQL integration限定確認 | テスト専用DBの `reading-status.itest.ts` 1 suite/3 tests passed、exit 0。全integration/E2Eは再実行していない |

4つのintegration suite（`favorite-authors`、`reading-status`、`reviews-report`、`user-delete`）ではfixture Clientとアプリsingletonの両方をdisconnectする。`reading-status` 単独でsingleton側poolが残りprocessが終了しないことを再現し、disconnect追加後にwrapper status 0となった。forceExitは使わず、MySQLとD1のintegrationを変更後に再検証した。

## 環境依存の結果と残る検証

- WindowsのPlaywright実行は完了しなかった。通常全件runは101 failed、1 passed、1 skipped。最初の共通基盤エラーはTurbopackが `src/app/globals.css` をPostCSS処理中に起動したNode child processのWindows status `0xc0000142`。単一smokeでも同じエラーを再現した。両runで `.env.test`、`CI=true`、既存server非reuse、専用port空きを確認し、初回後の残存Node/Next processはなかった。Linux上の同一smokeは通過した。Windows側の根本原因は特定できていない。
- Linux PWAの最初のharness実行は `test:e2e:pwa` だけを起動したため `.next` buildがなく失敗した。正規のbuildとtestを同一containerで連続実行した結果は2 tests passed。
- final check/D1/audit/npm ls系列を重複実行してしまった。両方のcheckはstatus 0（86 suites、872 tests）、両方のD1 integrationとnpm lsもstatus 0、audit件数と対象GHSAの判定は同一だった。重複の原因は特定できていない。不要な再試験だったため、結果へは1回分のみ集計した。
- 修正前bundleの独立scanでは、MariaDB package directoryが無い一方、`handler.mjs` と `.next/server/chunks/2210.js` にadapter/connection poolの実コードが見つかった（manifest上の文字列だけではない）。当時の `index.js` にはline 68718の `poolCallback`、line 68722の `@prisma/adapter-mariadb` の識別文字列と、その直後の型変換実装があった。これは修正前の状態で、誤接続・情報漏えいが起きたことを示さない。
- Worker provider moduleはliteral build-time requireへ分割し、MySQL singleton/cache/lazy/log/method bindingを別moduleに移した。Worker build guardはhandlerにadapter識別子があれば失敗する。Native testはRED（1 pass/1 fail Missing expected exception）から修正後GREEN（2/2 pass）。保存済みの実bad handlerもguardで拒否した。修正後のbundle scan、offline dry-run、smokeは上表の通り成功。最終lockは変わらず、この修正後にauditは取り直していない。
- Docker runnerは `WORKDIR /app` で `prisma/` を配置し、MySQL factoryは `process.cwd()/prisma` を証明書相対pathの基準とする。この設定はapp rootから起動するDocker/npm scriptsを前提とする。最終clean imageのbuilder/runner buildとCLI/HTTP smokeは上表のとおり成功し、固有smoke containerは停止済み。
- `npm audit` と `npm audit --omit=dev` は残存advisoryがあるためstatus 1。件数と対象GHSAの有無は上表に記録した。隔離copyでの最終docs checkは新規plan/specを含めstatus 0、リンク切れ0件。schema/model/migration SQL不変を確認済み。最終 `git diff --check` もexit 0。

## 2026-11-02 追加確認

- provider分離後に `npm ls --all` を実行し、status 0を確認した。依存lockは変更していない。
- 独立Worker scanでのコード混入検出、その後のprovider分離、再scanによる非混入確認は上記の経緯のとおり。検証結果は、初回の混入検出と修正後の成功を区別して記録した。

## 初期比較の識別情報と証跡範囲

- 比較対象のbaselineはHEAD `271b3c57e3d83cc4f07f7b3ef0a9ff6acfeeac53`。baselineの `package.json` SHA256は `7c5de91e5f4d9b1d5d0287e1076e44aa627e0019f56825b333c5ecda218857f3`、`package-lock.json` は `ad1e607c668dfb1ce2f134c6aa51c2508b5abed2717b2a14459138caddcbe4d3`。
- 候補の `package.json` SHA256は `22d68087614b5ff4afea8896eac6a3b6cf0a91d9b80d018b2220361372e8b722`、`package-lock.json` は `ad779222dab1d65c45d85cfa3aec5e514cec3fb86c78af202687eb0e4c7e5a58`。初期監査時にbaseline/candidateを隔離比較し、対象GHSAが候補で解消したとの実施記録がある。
- 初期baseline/candidateの生auditログは現在のTEMP保存先では再確認できない。初期実行時のNode/npm値もこの記録から確定できないため補完していない。後日のfinal full/prod auditログは残存しており、これは初期比較の生ログとは区別する。
- 提出時にGitから再取得したbaselineと候補のhashは上記のとおり。検証済みruntime入力31ファイルのSHA一致を確認した。提出時環境のNode 24.22.1/npm 11.19.1は2026-11-02 JSTの値であり、初期audit時の環境値ではない。
