# #776 PWA依存forkの設計

## 決定済みの方針と確認範囲

ユーザーは[調査資料](../../dependency-audit-776.md)の方針1「現行PWAライブラリの変更版を管理し、固定依存を修正する」を選択した。next-pwaを別の製品へ置き換えず、10.2.9を基準に小さなローカルforkを管理する。

この文書は具体的な配置・導入・キャッシュ分離・検証の設計。ユーザーの続行指示に基づき実装中。後述するキャッシュ保護の明示化は調査中に必要性が分かった追加の設定変更である。

## 目的と変更しない範囲

- Workbox固定依存から伝播するserialize-javascriptの対象GHSAを解消し、既存Next.js 16・React 19・Prisma 6・OpenNextとCloudflare D1を維持する。
- PWAインストール、スタンドアロン起動、通知バッジ、公開静的資産のオフライン利用を維持する。
- 認証API・ユーザー別API・HTML・RSCをService Workerから再利用しない。個人画面のオフライン表示は提供しない。
- DBスキーマ・業務API・認証の有効期間・本番環境は変更しない。外部forkやnpmパッケージの公開は含めない。

## 比較した案

| 案 | 利点 | 制約・判断 |
| --- | --- | --- |
| next-pwaの小さなfork | 既存ラッパー・設定・登録処理を基準にできる | 変更版の保守責任が増える。ユーザーが選択 |
| 現状維持で上流修正待ち | アプリの変更なし | 警告が残るため今回は選択しない |
| Serwist安定版9.5.13へ置換 | 既存の別PWA製品として統合可能 | zod 4.6.5の固定依存が別の対象警告を持ち、現在の単純な置換先として選択しない |

## forkの管理と導入

- app/vendor/next-pwa/ に、npm配布版10.2.9のpackage.json・LICENSE・README・distを保持する。バージョンは10.2.9-mbl.1とする。
- 配布物のJavaScript・型定義は変更せず、package.jsonのWorkbox依存4種類（workbox-build、workbox-core、workbox-webpack-plugin、workbox-window）だけを7.4.1に揃える。forkのversionとprivate:trueも明示する。fast-glob・semverなど無関係な指定は変えない。
- MITライセンス、取得元tarball・integrity、各ファイルのSHA-256、元の依存宣言と差分、再作成手順をapp/vendor/next-pwa/UPSTREAM.mdに記録する。
- app/package.jsonの依存先をfile:vendor/next-pwaにする。app/.npmrcのinstall-links=trueで通常のパッケージとして導入し、ローカルsymlinkへの依存を避ける。グローバルnpm設定は変えない。
- Dockerのbuild/runtime両ステージで、各npm ciの前に同じvendorと.npmrcを配置する。現行のlockfile・postinstall・Node.js 22.23.4・秘密設定の除外を維持する。
- 新しい依存ツリーに対象GHSAや依存不整合が残る場合は、成功とせず原因を調べる。override・強制更新はしない。
- ESLintではvendor配布物だけを対象外にし、アプリ独自のPWA設定・移行SW・テストは検査対象にする。vendorの検証は元配布物とのハッシュ・差分照合と実際の導入・ビルドで行う。

## キャッシュ保護の明示化

現行ラッパーのソースでは、dynamicStartUrlが有効だとstart-urlのNetworkFirstをルートの先頭へ追加する。既定ルールにはapis・pages-rsc・pages-rsc-prefetch等もある。現在のnext.config.tsのnavigateと/api/auth/のNetworkOnlyだけで、すべての個人データの分離が確認できたとは扱えない。

- cacheStartUrlとdynamicStartUrlをともにfalse、extendDefaultRuntimeCachingをfalseにする。独自ルールに既定の個人データ用キャッシュを混ぜない。
- 同一originの画面ナビゲーション、全/api/、RSCヘッダーまたは_rscクエリ、/_next/data/はNetworkOnlyを優先する。判定関数はSWへシリアライズされても動くよう、外部変数へ依存しない。
- キャッシュを許可するのは同一originの/_next/static/、/icons/、/icon.png、/manifest.json等の明示した公開静的資産。任意のURLを拡張子だけで許可しない。
- app/pwa-worker/index.jsにSWのactivate時の移行処理を置く。Cloudflare用app/worker/index.mjsは変更せず、customWorkerSrcで別ディレクトリを指定する。
- 移行処理は現行next-pwa既定ルールの既知のキャッシュ名（start-url、apis、pages、pages-rsc、pages-rsc-prefetch、next-data、static-data-assets、cross-origin）だけを削除する。無関係な名前のCacheStorageは保持し、処理を再実行しても成立させる。
- 実際の生成物・ブラウザでルート順序と移行を確認する。上流コードの読み取りだけで実動作が保証されたとは扱わない。

## 本番モードで検証すること

開発用next devはPWAを無効にするため、通常E2Eと別にproductionビルド＋next startのPlaywrightプロジェクトを用意する。ポート3200、.env.testの専用MySQL、外部APIスタブ3999を使い、既存のテストDBガードとseedを共用する。

架空の2ユーザーと個別の読書データを使い、実際にService Workerを有効にして次を確認する。

1. 実ログイン、画面・RSC・認証API・一般APIを取得した後も、それらのURLとユーザー識別用文字列がCacheStorageへ残らない。
2. ログアウトして別ユーザーでログインしたとき、前のユーザーのデータが表示されない。
3. オフラインでは保護画面・API・RSCのネットワークアクセスが失敗し、既に取得した公開静的資産は取得できる。
4. 旧start-url等へ架空の個人データを入れてからSWを有効にすると旧キャッシュが消える。同時に置いた無関係な名前のキャッシュは残る。
5. npm ci、prod-only導入、通常ビルド、Docker、Linux WorkerビルドとD1・Cron疎通が成功する。

Docker Desktopはユーザーが起動済み。実DB・Linuxの検証はこの環境で行い、未実行の検証を成功とは記録しない。
