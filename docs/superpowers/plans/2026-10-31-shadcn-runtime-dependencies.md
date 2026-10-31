# shadcnの実行用依存からの分離 Implementation Plan

**Goal:** Issue #806として、CSSの供給元と見た目を維持し、Docker実行イメージから本番不要のshadcn CLI依存を除く。

**Architecture:** shadcnの依存区分だけを開発用へ移す。全依存を導入するbuilderで従来の`shadcn/tailwind.css`を処理し、完成したCSSを配信するrunnerではCLIを導入しない。変更前後の実際の導入内容・ビルド成果物・HTTP応答を比較する。

**Tech Stack:** npm、Next.js 16、Tailwind CSS v4、shadcn 4.22.1（現在のlock）、Docker、Prisma 6、OpenNext、Playwright。

**Spec:** [Issue #806](https://github.com/yamamotonaoki3/MyBookLibrary/issues/806)、[要件定義](../../requirements.md)、[テスト計画](../../test-plan.md)。

## 制約と変更範囲

- `app/package.json`のshadcnの`^4.10.0`をそのままdevDependenciesへ移す。lockの解決版・integrity・依存エッジは維持し、区分変更に必要な差分だけを残す。
- `app/src/app/globals.css`の`@import "shadcn/tailwind.css"`、CSSの供給元・順序・内容、UI実装、components設定を変更しない。CSSのコピー・新しいforkは作らない。
- [#777の判断](../../dependency-audit-777.md)はCSSコピー・供給元変更の案を現状維持としたもの。今回は同じパッケージのCSSをビルド時に使い続ける別案である。
- next-pwa、Prisma、その他の依存区分・版は変えない。force・override・RCへの置換を行わない。
- 目的は実行イメージへの不要CLI導入削減であり、残存GHSAの修正ではない。全依存auditが変わらないことや、共有依存の警告が残ることを隠さない。
- 検証は秘密設定・既存node_modules・生成物を持ち込まない隔離コピーを使う。file依存のvendor・`.npmrc`とPrisma設定・両schemaを含める。check:docsを実行するコピーは一時Git repoとして初期化し、基準追跡ソースだけをindexへ登録する。remote設定・commitは不要。
- シェルはOrca内蔵ターミナルで実行し、WindowsのNode子プロセスには`windowsHide: true`を指定する。既存DBや本番・デモ・ステージングを変更しない。
- 既存コンテナ・volume・imageを削除しない。Docker検証には固有名の一時コンテナと架空のテスト設定だけを使い、既存DBへ接続しない。scratchへ秘密設定を持ち込まない。

変更予定: `app/package.json`、`app/package-lock.json`、`docs/test-plan.md`、結果記録 docs/shadcn-runtime-dependencies.md。新たな再発防止規則が生じた場合だけ`docs/lessons-learned.md`へ追記する。Dockerfile・アプリコードの変更は予定しない。

## 確認を重点化する条件

1. 依存区分だけ変えても共有経路が残る場合がある。prod-onlyの実導入と`npm explain`で除外されたパッケージを特定する。
2. lock再生成で無関係な更新が起きる場合がある。全nodeの版・integrity・依存宣言を基準と比較する。
3. next devではCSSや実行イメージの成立を証明できない。production CSS・next start・standaloneの実物を確認する。
4. runnerのpostinstallはPrismaを生成する。shadcnなしのclean導入と完成イメージで生成・CLIを確認する。
5. WorkerにはCLIが従来から含まれない可能性がある。Workerサイズ削減を仮定せず、ビルド・疎通の維持を確認する。

### Task 1: 実行用導入の基準と失敗するassertを取得する

**Files:** 読み取り: `app/Dockerfile`、`app/package.json`、`app/package-lock.json`、`app/src/app/globals.css`。一時出力: 導入一覧・容量・CSS・HTTP結果と検証スクリプト（Git管理外）。

**入力:** main `a4911740bb560ea4c970e8e4ae4081421b66d135`。**成果物:** 比較用基準と、変更後に通す同一の実導入assert。

- [x] 基準HEAD・manifest/lockのhash、Node/npm版、DockerのNode版を記録する。`git grep`でshadcnの利用がglobals.cssのCSS importであり、src・worker・scripts・設定にCLIやJSのruntime importがないことを再確認する。
- [x] 一時領域に、インストール先の絶対パスを受け取るNode検証スクリプトを作る。`node_modules/shadcn/package.json`が存在しないことを`node:assert/strict`でassertする。manifest文字列を検査するテストにはしない。同じassertをprod-onlyコピーと完成コンテナ内で使う。
- [x] 基準の空コピーで`npm ci --omit=dev`をpostinstall有効で実行する。上記assertがshadcnの存在を理由に失敗することを記録する。基準Docker完成イメージ内でも同じ失敗を確認する。インストール失敗を期待したREDと混同しない。
- [x] 基準の実導入パッケージ一覧・node_modulesの容量を取得し、shadcnに付随するMCP/Express等の経路を`npm explain`で記録する。基準の全依存・omit=dev auditも保存する。
- [x] 同条件のproductionビルドを用意し、`.next/static`配下のCSSを相対パスと内容hashで記録する。後の比較ではファイル名だけに頼らずCSS内容を照合する。テスト用設定・固定されたソース・同じ依存版を使い、秘密設定をコピーしない。

### Task 2: 同じ版のshadcnを開発用区分へ移す

**Files:** 更新: `app/package.json`、`app/package-lock.json`。**入力:** Task 1の基準。**成果物:** 最小の区分変更とGREENの実導入assert。

- [x] `package.json`でshadcnの既存範囲`^4.10.0`をdependenciesからdevDependenciesへ移す。通常の`npm install --package-lock-only --ignore-scripts`でlockを整合させる。最新版への再解決が起きたら基準の解決版を維持する方法でやり直し、不要更新を採用しない。
- [x] 基準と候補の全lock nodeについて、版・resolved・integrity・依存エッジが同一で、ルート区分と派生するdev属性等だけが変わったことを確認する。共有nodeがdev専用にならないことも確認する。
- [x] 候補の別の空コピーで`npm ci`と`npm ls --all`を通し、開発用導入にはshadcn 4.22.1と同じCSS実体が存在することを確認する。`npm run check`を実行する。
- [x] 別の空コピーで`npm ci --omit=dev`をpostinstall有効で通す。Task 1と同一のassertが成功し、両Prisma Client生成・`prisma --version`が成功することを確認する。`npm ls --omit=dev --all`と導入一覧で、実際に除外されたパッケージ・残った共有依存を特定する。

### Task 3: production CSS・Next実行・Docker・Workerを確認する

**Files:** 既存検証対象: `app/e2e/admin-visual-check.spec.ts`、`app/e2e-pwa/cache-isolation.spec.ts`、`app/scripts/build-worker.mjs`、`app/scripts/smoke-worker.mjs`、`app/Dockerfile`。

**入力:** Task 2の候補。**成果物:** CLIなしの実行物でもCSS・Prisma・HTTPが成立する証拠。

- [x] `npm run build`を同じ条件で実行し、基準とCSS内容hashを比較する。差があれば依存区分以外の入力差・非決定性を調べ、未説明のCSS差分を残さない。
- [x] ビルド済みの隔離コピーからshadcnがないprod-only環境を作り、`next start`で`/login`の200とHTMLが参照する`/_next/static/...css`の200・内容を確認する。Next設定読込で失敗した場合は無関係な依存移動で迂回せず原因と採否を報告する。
- [x] 実際のDockerfileのbuilder/runnerをビルドする。完成イメージ内でTask 1のassertが成功し、両Prisma生成物・CLIの版が維持されることを確認する。ローカル専用ポートでstandaloneの`server.js`を起動し、`/login` 200、未認証`/books`のログイン転送、`/api/auth/providers`、`/api/version`、HTML参照のCSS 200を確認する。DBへ書き込まない。
- [x] 基準／候補のDocker builder CSSパス・内容hashの完全一致と、prod-only `next start`・standaloneのHTML/CSS HTTPを確認し、依存区分がCSS成果物や配信に影響しない根拠を[結果記録](../../dependency-runtime-806.md)へ記載する。
- [ ] production UIのブラウザー視覚比較とPlaywright E2Eは未実施。既存の管理画面E2E本文は3タブと選択状態を検査し、CSS完全一致やprod dependency treeは保証しない。今回の依存区分を直接検証するシナリオがなく、CSS hashとproduction HTTPを代替根拠にした。実ブラウザー表示は未検証。
- [x] Linux/glibc環境でclean導入後、`npm run build:worker`と`npm run smoke:worker`を実行する。Workerのwasm、ローカルD1でのログイン・保護ページ・Cronが維持されることを確認する。リモートのD1や本番へ接続しない。

依存区分以外に業務ロジック・schemaは変更しないため、全MySQL/D1結合テストを一律には追加しない。clean導入・Prisma生成・完成物HTTP・Worker smokeを直接の検証とする。新規のmanifestテストや既存実装をなぞる単体テストは作らず、実導入assertのRED/GREENを証拠とする。

### Task 4: 実際の削減効果と制約を記録する

**Files:** 作成: docs/shadcn-runtime-dependencies.md。更新: `docs/test-plan.md`。条件付き: `docs/lessons-learned.md`。

**入力:** Task 1〜3の結果。**成果物:** 不要CLI導入削減を説明できる最小差分。

- [x] 基準／変更後のprod-only・Docker内の実導入一覧、パッケージ数、node_modules容量を比較する。イメージ全体容量はレイヤーやキャッシュの影響と区別する。shadcn本体が外れなければ、audit数だけを根拠に採用しない。
- [x] 全依存・omit=devのauditを同時期に再取得し、同じGHSAが開発依存には残ることを明記する。共有経路で残る警告も記録し、脆弱性修正・Worker攻撃面削減を実測なしに主張しない。
- [x] 結果記録に依存の版・integrity維持、CSS比較、next start／standalone／Prisma／Worker、実導入assertの変更前失敗と変更後成功、未検証事項を記載する。テスト計画へ結果と実行方法をリンクし、必要な学びだけを追記する。
- [x] 最終差分で`npm run check`、`npm run check:docs`、`git diff --check`を確認する。新規文書がリンク検査の対象に含まれるよう一時index等を使う。既存のローカル専用変更を成果物へ混ぜない。

## 完了条件

- shadcnは同じ版・integrity・CSS供給元で全依存導入に存在し、prod-only導入とDocker runnerには存在しない。
- npm ciのpostinstall、両Prisma生成、CLI、next start、Docker standalone HTTP/CSS、Worker build/smokeが成功する。
- production CSSと主要UIが維持され、実行イメージの導入内容削減を実測で示せる。
- 全依存の残存警告と区分変更の効果を区別し、無関係な版更新・機能変更・DB変更を含まない。

## 参照

- [shadcnの既存利用と過去の判断](../../dependency-audit-777.md)
- [互換更新の検証結果](../../dependency-audit-804.md)
- [PWAとfile依存の検証](../../dependency-audit-776.md)
- [Docker導入等の学び](../../lessons-learned.md)
