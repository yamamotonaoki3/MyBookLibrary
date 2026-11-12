# Prisma 7セキュリティ移行 Implementation Plan（#809）

**Goal:** Prisma関連を正式版7.10.1へそろえ、GHSA-ggr8-5vv4-36mxを実際に解消し、MySQL/D1の動作を維持する。

**Architecture:** 既存generator/生成先とDB選択境界を維持し、MySQL接続だけ共通adapter factoryへ集約する。CLI設定とD1検査をPrisma 7へ合わせ、生成物・bundle・実DB互換性を段階検証する。

**Tech Stack:** Node 22.23.4、Prisma/Client/D1/MariaDB adapter 7.10.1、Next.js、Jest、Playwright、Docker、Cloudflare D1。

**Spec:** [詳細設計](../specs/2026-10-31-prisma7-security-migration-design.md)、[Issue #809](https://github.com/yamamotonaoki3/MyBookLibrary/issues/809)。

## 共通制約・検証の順序

### 独立検査で見つかったMySQL driver混入の最小修正

2026-11-01の独立検査では、D1用OpenNext handlerとWrangler dry-run後の最終配布コードにMariaDB adapterと接続poolの実装が残った。wasm同梱とWorker smokeの成功は、不要依存の除外を保証しない。

採用する修正はproviderごとのモジュール分離とする。共通の `app/src/lib/prisma.ts` はビルド時provider条件による直接のrequire分岐だけを持ち、MySQL側の既存singleton・遅延初期化・log設定を新規 app/src/lib/prismaMysqlSingleton.ts へ移す。adapter factoryの接続設定とD1のrequest/binding proxyは変更しない。Webpack専用aliasで隠す方式より、Nodeテストとビルドの両方で境界を明確にできるため、この方法を選ぶ。

- [x] `app/scripts/build-worker.test.mjs` に、保存済みbundleで検出したMariaDB adapter/pool実装の混入を拒否する回帰テストを追加し、既存のwasm後処理で拒否されない失敗を確認する。
- [x] 共通provider分岐とMySQL初期化を分離する。import時にDATABASE_URLを要求しない動作、開発cache、methodのthis、D1のbinding単位動作を保つ。
- [x] `app/scripts/build-worker.mjs` の後処理でhandlerへのMySQL driver混入を拒否する。生成物を削除・置換して検査を通すことは禁止する。
- [x] focused回帰テスト、provider/初期化テストを通し、`npm run check` を実行する。関連外の通常/demo/PWA全E2Eは繰り返さない。
- [x] 既存Linux検証imageへ変更ファイルだけを反映し、一回のWorker buildから成果物を保存する。保存成果物の走査・Wrangler offline dry-run後の最終配布コードの走査・Worker smoke10項目を実施する。npm ciやimageの再構築は不要。生成物の独立scanでMariaDBコードが検出され、provider分離後に非混入を確認した。
- [x] 実測結果と残る制限を結果記録へ反映する。コミット・push・PR・外部反映は行わない。


- 実DB・既存DB構造・migration SQLを変更しない。テストだけを専用MySQL/ローカルD1へ接続する。架空ユーザー・外部APIスタブを使い、`.env.test`を明示する。
- override/fork/RC、無関係な依存更新、業務コードの再編を行わない。生成物は再生成し、Gitへ手編集結果を持ち込まない。
- まず候補audit・旧generator/モジュール形式gateを通す。新generatorや全ESM化が必要なら後続を始めず、分割判断を求める。
- シェルはOrca内蔵terminal、Windows子プロセスはwindowsHide:true。既存Docker資源は削除せず、固有名の検証コンテナとテスト用volume/保存先だけを使う。秘密設定をscratchへコピーしない。
- 新規文書のリンク検査は一時index等で対象に含める。公開計画に検証成功の先取りや未確認の互換性保証を書かない。

## 実施結果の範囲補足

- Task 6の通常・demo・PWA E2E、Docker、全MySQL/D1 integrationは、それぞれ記載の環境・時点で実施済み。provider module分離後は `npm run check` とNative provider testsに加え、MySQLの `reading-status.itest.ts` 1 suite/3 testsを再確認した。分離後の全integration/E2E再実行はしていない。
- Worker初回の独立scanで実コード混入が見つかったため、その結果を初回失敗として残し、provider分離後のscan、Wrangler offline dry-run、10項目smokeの成功を別に記録した。
- 最終 `npm ls --all` は2026-11-02にstatus 0。Prisma 7 lock更新後にauditを実行した。provider分離ではlockを変更していないため、分離後の再取得はしていない。

## Review Focus

1. CLI-onlyの修正を本番リクエスト脆弱性修正と誤認しない。auditはGHSAと実解決nodeで比較する（Task 1・7）。
2. 特殊文字、URL別接続、TLS相対パス、poolの秒/ミリ秒変換を壊さない（Task 3）。
3. テストguardより先にClient生成・環境読込が走らない。ETL source/targetが混ざらない（Task 4）。
4. D1 bundleにMySQL driverが入り、wasmが欠けることを型チェックだけで見逃さない（Task 5）。
5. mockが通っても実Client・Prisma CLI・prod-only Dockerが壊れる場合がある（Task 6）。

### Task 1: バージョン・audit・生成入口の成立を先に確認する

**Files:** `app/package.json`、`app/package-lock.json`。後続で使う一時schema/config（Git管理外）。

**入力:** HEAD271b3c5と基準audit。**成果物:** 7.10.1候補lockと、継続可否のgate結果。

- [ ] 基準HEAD・manifest/lock hash・Node/npm版と全依存/omit=dev auditを保存する。対象GHSAと全脆弱nodeをJSONで読む。
- [ ] 隔離コピーで4 packageを7.10.1完全固定し、npmの通常解決でlockを作る。新MySQL adapter以外の直接依存を追加しない。全依存とomit=devの候補auditを基準と同時期に比較する。
- [x] 対象GHSAが消え、新たなGHSAや脆弱nodeが増えていないことを確認する。CLIの新しい推移依存も確認し、増加があれば隠さず判断へ戻す。対象を直す代わりに別警告を導入したlockをそのまま採用しない。
- [x] データモデルを持つ一時schemaで旧`prisma-client-js`＋engineType=clientを生成し、MySQL root/D1 root/wasm入口、adapterのimport/require、tsxによる生成Client構築、Jestからの読込、Prisma config読込を確認する。DBには接続しない。公式deprecated記述と実生成結果を区別して記録する。
- [x] gate成功後に候補lockを作業branchへ反映する。失敗したらgenerator刷新・全ESMを自動採用せず、設計の分割条件に従う。Node enginesはpackage実要件に合わせ、Docker Nodeは維持する。

### Task 2: schema・Prisma config・D1 CLIを先に整合させる

**Files:** `app/prisma/schema.prisma`、`app/src/lib/schema/toD1Schema.ts`、`app/prisma/d1/schema.prisma`、`app/prisma.config.ts`、新規 app/prisma.d1.config.ts、`app/prisma/scripts/d1-migration.ts`、`app/package.json`。

**入力:** Task 1。**成果物:** DBを変えないschema/config、成功する両Client生成とmigration検査。

- [x] 既存toD1Schemaテストへ「datasource urlなし、model部分不変、既存generator/output/engineType維持」のアサーションを追加し、旧実装で失敗を確認する。
- [x] MySQLのengineTypeをclientへ、両datasource URLをconfigへ移す。D1は変換関数から再生成する。generator/datasource以外の差分がないことを確認する。
- [x] default configは外部から渡されたenvを上書きしない。D1 configには生成・検査専用sqlite URLとschemaを置く。postinstallとprisma:generate:d1、schema:d1:checkはD1 configを明示する。古いpackage prisma.seedを削除し、configのseedを維持する。
- [x] D1 diffの旧flagを新flagへ変更する。一時DBのURLを一時Prisma configへ渡す。既存migrationを一時SQLiteへ適用して`--from-config-datasource --to-schema ... --script --exit-code`を実行し、空差分を成功とする。差分ありexit2とCLI起動失敗を別に扱う。
- [x] `prisma validate`、両generate、`npm run schema:d1:check`、`npm run d1:migration:check`を実行する。DATABASE_URLなしのgenerate成功と、テストenvが開発envに上書きされないことをprocess-level検証で確認する。migrationファイルを作成しない。

### Task 3: MySQL接続設定とadapter factoryをTDDで追加する

**Files:** 新規 app/src/lib/mysqlConnectionConfig.ts、app/src/lib/prismaMysql.ts、新規 app/src/__tests__/node/lib/mysqlConnectionConfig.test.ts、app/src/__tests__/node/lib/prismaMysql.test.ts。

**Interfaces:** 設計記載の`mysqlConnectionOptions(databaseUrl, schemaDir)`、`createMysqlPrisma(databaseUrl, options?)`。factoryはdotenv・singleton・業務処理を持たない。

- [x] URL変換テストをTDDで追加・実行する。`mysql://testuser:p%40ss@localhost:3307/mybooklibrary_test?connection_limit=5&connect_timeout=5&pool_timeout=10`からpassword=`p@ss`、port3307、limit5、connectTimeout5000、acquireTimeout10000を得ること。IPv6、URL別DB、欠落/不正値、未対応引数、エラーに認証値が出ないことも検証する。
- [x] TLS option testsは架空CAと公開example形式で`sslcert`解決、`strict`のrejectUnauthorized=true、未知mode拒否を検証した。production factoryは`process.cwd()/prisma`を基準とし、Docker/npm scriptsのapp root (`/app`) 起動を前提とする。任意のcwd変更に対する独立性は保証しない。
- [x] 接続設定とfactoryを実装する。adapter/Clientをmockし、URLから作った設定がadapterへ、adapterとlogがClientへ渡ることを検証する。import時に接続・dotenv読込をしないことも検証する。
- [x] Node単体テストをGREENにする。default pool10とtimeout、0の意味等を候補driverの実仕様で確定し設計とテストを一致させる。`pool_timeout=0`は未対応として拒否し、設計・テスト・公開接続説明へ反映した。

### Task 4: アプリ・seed・ETL・test helperの生成箇所を統一する

**Files:** `app/src/lib/prisma.ts`、`app/src/__tests__/helpers/dbTest.ts`、`app/prisma/seed.ts`、`app/prisma/seed.dev.ts`、`app/prisma/seed.e2e.ts`、`app/scripts/enrich-books.ts`、`app/scripts/fix-published-at.ts`、`app/scripts/normalize-published-at.ts`、`app/scripts/seed-test-review.ts`、`app/prisma/scripts/audit-email-normalization.ts`、`app/prisma/scripts/audit-production-readonly.ts`、`app/prisma/scripts/backfill-book-owner.ts`、`app/prisma/scripts/migration/mysql-to-d1.ts`、`app/prisma/scripts/migration/restore-to-target.ts`、`app/prisma/scripts/migration/verify-migration.ts`。

**入力:** Task 3のfactory。**成果物:** 全MySQL constructorがadapter経由になり、URL選択とguardが維持される。

- [x] test guardを通さないURLではadapter生成も開始しないテストと、ETLのsource URLがtargetへ漏れないテストを既存のguard/ETLテストへ追加する。datasourceUrl/datasourcesに頼る旧呼出で失敗することを確認する。
- [x] アプリ側はDB_PROVIDERの既存分岐内でfactoryを読む。開発singletonとlogを維持する。D1側へMySQL driverが静的importされない構成にする。
- [x] 上記の実constructorをfactory呼出へ置換する。`seed.e2e.ts`はURL guard後に生成する。ETLは既に検証済みのsource/target URLを明示し、すべてのfinallyのdisconnectを保持する。type import、業務SQL、データ操作、既存guardの許可条件を変えない。
- [x] `git --no-pager grep`でconstructor、datasourceUrl、datasourcesを再検索し取り残しを確認する。MySQL factoryとD1 adapter以外の裸constructorがないことを説明する。CLIスクリプトは型チェック・mockテストで確認し、副作用のある本番向けコマンドを実行しない。
- [x] `npm run typecheck`と関連Nodeテストを実行する。CJS/ESM差に対して最小のpackage単位対応を行い、全Jest変換や全体type=moduleは追加しない。

### Task 5: D1生成物・wasm・Nodeテストを実物で整合させる

**Files:** 必要な場合だけ`app/src/lib/prismaD1.ts`、`app/scripts/build-worker.mjs`、`app/next.config.ts`、`app/jest.config.ts`、`app/prisma/scripts/migration/d1Target.ts`、D1関連helper/setup。既存D1 binding/perBindingProxyテストを使う。

- [x] 7.10.1の生成ディレクトリ、runtime import、wasmファイル、OpenNextのhandlerを保存し、現後処理が何に適用されるかを調べる。生成ファイルやbundleを手でパッチしない。
- [x] 既存request単位proxyのテストを通す。Node D1 rootとWorker wasm入口を実行し、adapterのworkerd向けexportsがbundleで選ばれることを確認する。
- [x] 後処理を実生成物に沿ってfast WASM entryへ合わせ、postprocess regression testで72 importのrewriteとWorker smoke成功を確認した。修正後保存bundleのoffline検査でOpenNext 3171 files、code hits/driver paths 0、絶対WASM import 0、binary有効/生成元SHA一致、`wrangler deploy --dry-run` status 0も確認した。
- [x] Jestの既存Prisma mock/transaction既定動作、D1のky stubの必要性を確認した。stubはtest runtimeに限定し、実D1 integrationは別に実行した。

### Task 6: MySQL/D1・認証・CLI・Docker・Workerを順に検証する

**Files:** `app/Dockerfile`、`.github/workflows/ci.yml`、既存integration/globalSetup、`app/e2e/auth-session.spec.ts`、`app/e2e/auth.spec.ts`、`app/e2e-demo/demo-mode.spec.ts`、`app/e2e-pwa/cache-isolation.spec.ts`、build/smokeスクリプト。

- [x] `npm run check`とCI相当coverageを実行。修正後check exit 0、86 suites/872 tests、Native Worker tests 2/2、docs check 71 files/0 link errors。実indexは不変。過去値を流用していない。
- [x] guard済みtest DBでMySQL/D1 integrationを実行した。MySQLは15 suites/84 tests成功・2 suites/16 tests skip。D1は最終status 0、16 suites/97 tests成功・1 suite/3 tests skip。provider module分離後も別のlocal test DBで`reading-status.itest.ts` 1 suite/3 tests pass、exit 0。期待値やmigration SQLは緩和していない。
- [x] 通常/デモE2Eを順次実行した。Linux通常は101 passed、1 flaky、1 skipped、demoは7 passed。WindowsはTurbopack/PostCSS child processの0xc0000142で失敗し根因未確定。詳細を結果記録に記載。
- [x] production PWA buildとE2Eを同じcontainerで実行し2 tests passed。初回のbuild未実行harness失敗も結果記録に記載した。
- [x] Dockerfileは必要なD1 configをnpm ci前にCOPYする。最終clean builder/runner build status 0、postinstall両生成、Prisma CLIと両generated root 7.10.1、Node22.23.4を確認。HTTP smoke exit 0でlogin200、CSS200/83527 bytes、保護books307→login、providers/version200。固有smoke containerは停止済み。
- [x] Linux Node22.23.4/glibcでWorker build/smokeは10/10 checks成功。修正後はOpenNext 3171 filesの実コード走査でadapter code hits/driver paths 0。package.json 2 filesにはmetadata名が残るが実装コードではない。WASM 72 relative/0 absolute、3,304,603 bytes有効・生成元SHA一致。offline `wrangler deploy --dry-run` status 0。最終配布4 filesでも0 hits/paths、WASM一致。
- [x] schema/D1 migration検査とtest DB migration状態を確認。25 migrations up to date、既存model/migration SQLは変更なし。起動失敗やskipを成功扱いにしていない。

### Task 7: audit結果・技術スタック・ロールバックを記録する

**Files:** 新規結果記録 docs/dependency-audit-809.md、`docs/requirements.md`、`docs/test-plan.md`、必要な`docs/lessons-learned.md`、root `CLAUDE.md`/`AGENTS.md`の技術版記述、公開接続exampleと影響する運用コマンド。

- [x] lock変更時に全依存/omit=dev audit、`npm ls`を実行。全依存50件（low3/moderate43/high4）、production11件（low2/moderate9/high0）、対象GHSAなし、deepmerge-ts8.0.2、Prisma系7.10.1、npm ls status 0。今回のprovider/bundle修正はlockfileを変えていないためauditは再実行していない。残るadvisoryは未修正として記録。
- [x] 結果記録に環境、RED/GREEN、実行・失敗・skip、generator継続理由、pool/TLS、WASM後処理根拠を記録。技術スタックを同期した。
- [x] source/target exampleを共通factoryとMariaDB adapterの接続契約へ同期。相対CAはapp/prisma基準、`sslaccept=strict`、`pool_timeout=0`非対応を明記。秘密値は追加せず、アーカイブの履歴資料も改稿していない。
- [x] DB/model/migration不変を確認し、rollbackはコード/lock/configを同一Git revertで戻す旨を記録した。DB復元コマンドは追加していない。
- [x] 最終`npm run check`はstatus 0、隔離copyの`npm run check:docs`は新規plan/spec込みでstatus 0・リンク切れ0件、`git diff --check`はexit 0。受入基準と未検証事項を対応付けて報告した。コミット・push・PR・外部反映は行っていない。
