# PWA Dependency Fork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. The existing inline execution method is retained; commits require the user's instruction.

**Goal:** #776のPWAビルド依存警告を解消し、本番Service Workerが個人データを再利用しないことを実測する。
**Architecture:** next-pwa 10.2.9の配布物をローカルforkとして管理し、Workbox依存のみ7.4.1へ更新する。npm/Docker導入を再現可能にし、PWA本番E2Eでキャッシュ境界を検証する。
**Tech Stack:** 既存Next.js 16 / React 19 / Prisma 6 / MySQL / OpenNext / Cloudflare D1 / Workbox 7 / Jest / Playwright / Docker。
**Spec:** [設計書](../specs/2026-10-25-pwa-dependency-fork-design.md)、[調査根拠](../../dependency-audit-776.md)、Issue #776。

## Global Constraints

- 作業ブランチはchore/#776-pwa-build-deps。既存の無関係な未追跡ファイルを変更・コミットしない。
- 設計レビューの確認前に依存導入・アプリ実装を始めない（ユーザーの続行指示により確認済み）。
- 外部へのfork/npm公開、本番反映、DBスキーマ変更、強制更新、依存制約を無視したoverrideは行わない。
- 通常E2E・PWA本番E2Eとも.env.testを明示し、実APIを外部スタブへ置き換える。実値はログ・資料へ出さない。
- 新規Node子プロセスにはWindowsでwindowsHide:trueを指定する。全シェル操作はOrca内蔵ターミナルで行う。
- 各タスクの結果・実行コマンド・逸脱を記録する。途中コミットは自動で行わず、ユーザー確認を経る。

## Review Focus

- runtimeには正しいforkが入っていてもDockerのprod-only npm ciでvendorが欠ける条件 → Task 1のクリーン導入・Task 4の両ステージで検証。
- start-urlがカスタムNetworkOnlyより前に登録される条件 → Task 2で生成したSWを実際に制御させ、Task 3で設定を修正。
- ブラウザHTMLだけでなくRSCや一般APIにユーザーAのデータがある条件 → Task 2の実データ・実HTTP・CacheStorage・オフライン検証。
- 旧キャッシュが残る条件、同じoriginの無関係なキャッシュがある条件 → Task 2の移行・保持テスト、Task 3の限定した削除。
- SW判定関数がNext設定の外部変数を参照して生成先で壊れる条件 → Task 2のproduction生成物とTask 4のWorker疎通で確認。

## Task 1: 管理可能なforkと再現可能な導入

**Files:** Create app/vendor/next-pwa/、app/.npmrc。Modify app/package.json、app/package-lock.json、app/Dockerfile、app/eslint.config.mjs。
**Interfaces:** 現在のnext-pwa 10.2.9を入力とし、同じimport/export API・配布物とWorkbox 7.4.1に揃えた依存ツリーを出力する。

- [x] 現行npm auditの対象3 GHSAと依存経路を保存する。Expected: serialize-javascriptの対象警告が存在する（更新前のRED）。
- [x] npm配布版のLICENSE・README・distと元package.jsonを照合してvendorへ配置する。UPSTREAM.mdに取得元・integrity・ハッシュ・差分・再作成手順を記録する。
- [x] バージョン10.2.9-mbl.1・private:trueとWorkbox依存4種類（workbox-build、workbox-core、workbox-webpack-plugin、workbox-window）の7.4.1を設定し、file依存とinstall-links=trueを設定する。Docker両ステージへvendorと.npmrcをnpm ci前に配置する。ESLintの対象外はvendor配布物だけに限定する。
- [x] appでnpm install --package-lock-only --ignore-scripts、npm ci、npm ls --all、npm audit --jsonを実行する。Expected: forkの実体が通常のnode_modulesへ入り、依存不整合と対象3 GHSAがない。無関係な直接依存は変更されない。
- [x] 別の一時領域で同じvendor・package.json・lock・.npmrcからprod-only npm ciを実行する。Expected: ローカルsymlinkや元のnode_modulesがなくても導入できる。

## Task 2: 本番Service Workerを検証するE2E

**Files:** Create app/playwright.pwa.config.ts、app/e2e-pwa/cache-isolation.spec.ts。Modify app/package.json、.github/workflows/ci.yml。
**Interfaces:** Task 1のproductionビルドを入力とし、実SW・実ログイン・CacheStorage・実データの観測結果を出力する。アプリの成功応答をモックしない。

- [x] test:e2e:pwaを追加する。設定はポート3200のnext start、.env.test＋既存外部スタブ、既存globalSetupのテストDBガード・seedを利用する。通常E2Eと同時に同じテストDBを使わない。
- [x] 2人の架空ユーザーと、それぞれだけに見える読書データを用意する。SWのreadyとcontrollerを待ってから画面・RSC・/api/auth/session・一般APIを取得する。
- [x] CacheStorage内に個人URL/識別文字列がない、ユーザー切替でAのデータがBへ出ない、オフラインでは保護データを取得できず公開静的資産は取得できる、というケースを実装する。
- [x] SW未登録の同一originページで旧start-url等と無関係な名前のキャッシュを作り、その後のSW登録で旧キャッシュだけ消えるケースを実装する。
- [x] .env.testを明示したproductionビルド後、追加E2Eを実行する。Expected: 現行キャッシュ設定で該当する非キャッシュ/旧キャッシュ移行のケースが失敗することを観測する。失敗理由がDBや起動エラーならREDと扱わない。
- [x] CIの既存通常E2E・デモE2Eの後にproductionビルドとtest:e2e:pwaを追加する。Expected: ローカルとCIで同じガード・スタブ・順序が使われる。

## Task 3: 個人データを再利用しないキャッシュ設定

**Files:** Create app/src/lib/pwaRuntimeCaching.ts、app/src/__tests__/node/lib/pwaRuntimeCaching.test.ts、app/pwa-worker/index.js。Modify app/next.config.ts。
**Interfaces:** pwaRuntimeCachingというルート配列をNext設定へ渡す。判定関数は自己完結し、SWへ文字列化されても実行可能であること。移行SWはCloudflare用workerと別ディレクトリに置く。

- [x] 同一originのnavigate・全/api/・RSC・_rsc・/_next/data/をNetworkOnlyにし、公開静的資産だけを許可する境界値テストを書く。悪意ある類似パス・別origin・単に.pngで終わる個人URLを許可しないケースを含め、まず失敗を確認する。
- [x] 設計書のcacheStartUrl:false・dynamicStartUrl:false・extendDefaultRuntimeCaching:falseと優先ルートを実装する。
- [x] customWorkerSrcをpwa-workerへ設定し、activate時に設計書の既知の旧データキャッシュ名だけを削除する処理を追加する。無関係なキャッシュは削除しない。
- [x] 境界値テストとTask 2の本番E2Eを再実行する。Expected: REDで観測したケースと、元のインベントリ・ログイン・オフライン静的資産のケースが全て成功する。

## Task 4: 統合検証・記録・レビュー

**Files:** Modify docs/dependency-audit-776.md、docs/test-plan.md、docs/requirements.md（PWAパッケージの管理方法のみ）、docs/lessons-learned.md（採用した知見がある場合）。
**Interfaces:** Tasks 1–3のコード・テスト・生成物を入力とし、Issueの受け入れ基準と未解消警告を追跡できる記録を出力する。

- [x] appでnpm run check、test:integration、test:integration:d1、.env.test明示の通常・デモ・PWA本番E2E、npm run buildを実行する。Expected: 全対象ケース成功、スキップやリトライは区別して記録。
- [x] glibc環境のLinuxでnpm ci・build:worker・smoke:workerを実行する。Expected: wasm・D1・認証・Cronを含む疎通成功。
- [x] Docker両ステージをビルドし、完成イメージのPrisma CLIと未認証HTTP疎通を確認する。Expected: vendorがlockから導入され、秘密設定は同梱されない。
- [x] 更新前後の対象GHSA・残存依存経路・forkの保守手順・実際にPWAを検証したE2Eを資料へ記録し、codex review --uncommittedを実行する。指摘は既存ルールどおりcodex execで修正・再検証する。
- [x] ユーザー確認前にコミット・push・PR作成を行わない。未実行・残存事項があれば具体的に報告する。
