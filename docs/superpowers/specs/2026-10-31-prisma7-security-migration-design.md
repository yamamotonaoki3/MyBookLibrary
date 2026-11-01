# Prisma 7正式版へのセキュリティ移行設計（#809）

## 目的と範囲

[Issue #809](https://github.com/yamamotonaoki3/MyBookLibrary/issues/809)の目的は、Prisma 6の固定依存`deepmerge-ts@7.1.5`を、正式なPrisma 7の依存関係へ移行してGHSA-ggr8-5vv4-36mxを解消すること。依存区分による監査対象の縮小ではなく、全依存・本番依存の両方から対象GHSAをなくす。

基準はmain `271b3c57e3d83cc4f07f7b3ef0a9ff6acfeeac53`。2026-10-31再取得では全依存53件（low 3 / moderate 43 / high 7）、本番依存14件（low 2 / moderate 9 / high 3）。53件すべての解消は範囲外で、glob/minimatch/deepmergeは別の判断とする。

モデル・テーブル・カラム・インデックス・既存migration SQL・既存DBは変更しない。MySQL 8.4とD1を維持し、業務ロジック・画面・認証仕様の変更を混ぜない。override、fork、RC、forceは使わない。本番・ステージング・デモへの反映は含めない。

## 確認した一次情報（2026-10-31）

| 項目 | 確認結果 |
| --- | --- |
| Prisma 6の公開最新版 | 6.19.3。configがdeepmerge-ts 7.1.5を完全固定 |
| 採用候補 | `prisma`、`@prisma/client`、`@prisma/adapter-d1`、追加する`@prisma/adapter-mariadb`をすべて**7.10.1完全固定** |
| 修正済み依存 | `@prisma/config@7.10.1` → `deepmerge-ts@8.0.2`。GHSAの修正境界は8.0.0 |
| 間接driver | MariaDB adapter 7.10.1 → mariadb 3.5.4、driver-adapter-utils 7.10.1。mariadbを別途直接依存には追加しない |
| Node / TS | 候補packageのNode範囲は`^20.19 || ^22.12 || >=24.0`、clientのTypeScript peerは`>=5.4.0`。既存Docker Node 22.23.4を維持し、manifestのNode下限を候補の実要件に合わせる |
| latest注意 | prismaのlatestは8.0.0-rc.29、prevは7.10.1。タグ追従ではなく7.10.1を指定 |
| MariaDB API | 公開tarballの型は`new PrismaMariaDb(poolOrConfig: Pool | PoolConfig | string, options?)`。import/require両exportsがある。adapter所有poolはdisposeで終了する |
| D1 API | Node用とworkerd用のexports、およびimport/requireを提供。実bundleが適切な入口を選ぶことは別途検証する |

根拠: [Prisma 7移行ガイド](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)、[MySQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/mysql)、[D1](https://www.prisma.io/docs/guides/v7/deployment/cloudflare-d1)、[generator reference](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators)、[GHSA](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)。公開packageの`npm view`とMariaDB adapterの7.10.1配布物も照合した。インストール・生成・候補auditは本設計作成時には未実施。

## 既存構成と設計判断

### generatorとモジュール形式

現在は両schemaとも`prisma-client-js`、MySQLは独自output、D1は`engineType="client"`。D1はNode用rootとWorker用`/wasm`を条件分岐で読み込む。公式v7 referenceにも旧generatorはdeprecatedとして残っており、即時利用不能ではない。

**今回は旧generatorを継続**し、MySQLにも`engineType="client"`を指定する。generatedのoutputとroot型importを保つ。新`prisma-client`への変更は、全import・D1 Node/workerd別生成・Jestの変更を同時に増やすため含めない。将来旧generatorが削除対象になった時点、または既存入口で7.10.1が成立しない場合に別途見直す。廃止警告は記録し、セキュリティ警告の解消と区別する。

Prisma CLI/configのモジュール形式とアプリの形式を分ける。既存Next TSのmoduleはesnext/bundler、JestはCommonJSで、adapterはrequireも提供する。一般的なESM移行手順だけを根拠にpackage全体へ`type=module`を追加しない。初期gateでCLI設定読込、旧generatorの実生成、generated root/wasmの入口、tsx、Jest、Nextビルドを確認する。必要な箇所だけESM APIへ変える。アプリ全体・全テストのESM化や第3の生成Clientが必要なら実装を広げず分割判断へ戻す。

### MySQL factoryと接続設定

新規Infrastructureを src/lib/mysqlConnectionConfig.ts と src/lib/prismaMysql.ts に分ける。

- `mysqlConnectionOptions(databaseUrl: string, schemaDir: string): MysqlConnectionOptions`はURL・pool・TLS変換だけを担当し、接続しない。返却型はadapter constructorの設定型と整合する構造型。型目的でmariadbを直接追加しない。
- `createMysqlPrisma(databaseUrl: string, options?: { log?: ("query" | "info" | "warn" | "error")[] }): PrismaClient`は`new PrismaMariaDb(config)`を渡してMySQL generated Clientを生成する。自動dotenv読込・環境変数書換え・グローバルcacheを行わない。
- `src/lib/prisma.ts`は既存DB_PROVIDER分岐と開発時cacheを保持し、MySQL側の分岐内でfactoryを読み込む。MySQL adapterやdriverをD1 bundleへ静的importしない。
- scripts/seed/test helperは呼出元で決めたURLをfactoryへ明示する。ETLの移行元・移行先URLを混同しない。`datasourceUrl`、`datasources.db.url`によるPrisma 6式overrideはfactory引数へ移す。

設定契約:

| 入力 | adapter設定 |
| --- | --- |
| mysql URL | host、port（省略3306）、database、user、passwordを一度だけdecode。特殊文字・IPv6をテストする。URL自体をエラー出力しない |
| `connection_limit` | 正の整数を`connectionLimit`へ。AWS資料の5を維持。未指定は明示的に10（driverの通常pool上限）とし、従来のCPU依存defaultからの差を記録する |
| `connect_timeout` | 秒→`connectTimeout`ミリ秒。未指定5000。0の意味はdriver仕様に照合し、無条件に正値へ丸めない |
| `pool_timeout` | 秒→`acquireTimeout`ミリ秒。未指定10000。無限待ち等の特殊値は7.10.1/driver仕様とテストで意味を固定する |
| `sslcert` | schema配置ディレクトリ基準の相対パスを保持しCAを読む。cwdに依存させない。絶対パスも扱う |
| `sslaccept=strict` | `ssl.rejectUnauthorized=true`。CA指定の検証を無効にしない |
| `sslaccept=accept_invalid_certs` | 明示指定に限り従来の指定をdriverへ対応させ、暗黙に追加しない。CAありでmode未指定ならstrict |
| 未対応のTLS/接続引数 | 黙って捨てない。秘密を含まないエラーで停止し、必要な対応を設計へ戻す。特に`sslidentity`/証明書password等の実需要があれば別途扱う |

設定は既存の公開example（migration source/targetのstrict+CA、AWSのconnection_limit=5）を対象にする。秘密のURLを資料へ記録しない。停止中AWSへの接続確認はしない。実環境の未知オプション対応は、値を伏せてパラメータ名だけ確認して判断する。

### D1とwasm

`prismaD1.ts`のrequest/binding単位proxyとD1_RUNTIME切替を維持する。MySQL型への境界castもこの層に限定する。D1 adapterだけ7.10.1へ整合させる。

`build-worker.mjs`は現在、query_compiler_bg.wasmの絶対importを相対化し、ファイルをコピーしている。7.10.1の生成物とOpenNext出力を実際に調べる前に削除・全面書換えしない。同じ問題が残れば現処理を維持し、ファイル名・import形だけが変わる場合は対象を限定する。後処理不要なら、その根拠を生成物・bundle・Worker実行で示してから除く。未解決の絶対参照、wasm欠落、MySQL driver混入を失敗条件にする。

### schema・CLI・環境読込

- MySQL/D1のdatasourceから`url`を除き、MySQLは既存prisma.configへ集約する。モデル以下は不変。D1自動生成関数`toD1Schema`を直し、D1 schemaを再生成する。
- D1のvalidate/generate/diff用に app/prisma.d1.config.ts を追加し、sqliteの生成・検査用URLを設定する。`--config`を明示し、MySQL設定や`.env.local`をD1検査へ持ち込まない。
- default configは既存の`.env.local`読込をoverride=falseで維持し、明示されたテストenvを優先する。generateだけのDocker導入時にDATABASE_URLがなくても設定ロードが例外にならず、DB接続しない。DBを使うCLIはURL欠落時に失敗させる。偽の本番接続先を補完しない。
- packageの旧`prisma.seed`設定はconfigの`migrations.seed`へ一本化する。seedは明示コマンドだけ。migrateで自動generate/seedされる前提を残さない。
- D1 migration検査は一時SQLiteに既存SQLを適用して差分を見る。廃止された`--from-url`/`--to-schema-datamodel`を、専用一時configのURL＋`--from-config-datasource`/`--to-schema`へ変更する。SQLの新規生成や本番適用はしない。

### tests・scripts・Docker・CI

MySQLの直接constructorはseed3種類、enrich、日付修正・監査スクリプト、ETL restore/verify/mysql-to-d1、`dbTest.ts`に存在する。同じfactoryへ移し、型だけのimportは変更しない。テスト用factory呼出前の`assertTestDatabaseUrl`とETLのsource/target guardを維持する。副作用のあるCLIを動作確認として実行しない。

JestのPrisma mockの既定transaction実装・clearMocksを維持する。adapter導入で実接続を始めるmockへ変更しない。MySQL/D1実結合試験だけがテストDBへ接続する。CommonJSから読み込める実exportsを使い、transformIgnorePatternsの全解除や全node_modules変換はしない。

Dockerはbuilder/runnerとも同じlockで`npm ci`し、postinstallで両Clientを生成する。runtime Prisma CLI依存を勝手にdevへ移さない。D1 configを導入前にCOPYする。新しいMySQL factoryを使うruntime生成物に必要なadapter/driverがstandalone/prod-onlyで解決できることを確認する。CIの通常/デモ/PWA/Worker・schema検査の順序とテストDB分離を維持する。

## 受け入れ基準と中断条件

1. 全依存・omit=devの対象GHSAが実際に消え、deepmerge-tsの解決nodeが修正版である。新規GHSA・脆弱nodeを基準と照合し、新しい警告を黙って導入しない。既存53件の単純減算を保証しない。
2. 両schemaのmodel/enum/index/relationと既存migration SQLが基準と同一。D1 migration diffとテストMySQLのschema差分が空で、新しいmigrationを作らない。
3. factoryのURL・pool/TLS・URL別接続・切断、D1 request scopeのテストが通る。test guardが開発・外部DBを拒否する。
4. MySQL/D1結合、通常/デモの認証E2E、production PWA、Linux Worker build/smoke、Docker両stage/CLI/HTTPが通る。
5. 新generator必須化、広範囲ESM化、DB構造変更、新しい重大な依存警告、未対応TLSが必要なら進行を止め、範囲・代替・分割を判断する。

本変更はDB構造を変えない依存/接続基盤の一つの移行で、各部分だけのデプロイはしない。gateを通れば一つのIssueでまとめて検証可能。gate失敗で新generator/全ESMへ広がる場合は、調査成果を残し実装を別Issueへ分割する。

## ロールバックと資料

統合後の不具合はGit revertでコード・依存・設定を一緒に戻す。DBは変えないためDB rollback/復元を実施しない。反映前に旧buildを保持し、外部反映は別承認の手順に従う。

実装完了時にrequirementsのORM版、CLAUDE/AGENTSの技術スタック記述、test-plan、接続設定の公開example/運用手順を変更結果に同期する。今の設計作成時点では実装済みと書き換えない。対象警告の結果記録は docs/dependency-audit-809.mdへ作成する。
