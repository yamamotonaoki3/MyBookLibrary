# 依存監査の互換更新 Implementation Plan

**Goal:** Issue #804として、通常の互換更新を隔離環境で検証し、対象警告を減らす更新だけを採用する。採用可能な更新がなければ、依存を変えず根拠を記録する。

**Architecture:** 作業ブランチ上のソースと、依存解決を試す一時クリーンコピーを分離する。候補ごとに同じ基準lockから解決し、監査・依存グラフ・互換性の証拠をそろえてから必要な差分だけを作業ブランチへ反映する。アプリの機能やDBスキーマは変更しない。

**Tech Stack:** Node.js 22以上、npm、Next.js 16 / React 19、Prisma 6、OpenNext、Workbox、Jest、Playwright。

**Spec:** [Issue #804](https://github.com/yamamotonaoki3/MyBookLibrary/issues/804)、[要件定義](../../requirements.md)、[テスト計画](../../test-plan.md)。

## 制約

- 既存の直接依存宣言と、親パッケージが許容する依存制約を守る。`--force`、override、ダウングレード、追加fork、Prisma 7移行、RCへの置換は行わない。
- 対象はglobのGHSA-5j98-mcp5-4vw2 / GHSA-3g3m-2fjr-6pw4、minimatchのGHSA-g3hv-75wg-m249、deepmergeのGHSA-gcqx-w48m-w2h4、deepmerge-tsのGHSA-ggr8-5vv4-36mx。
- 53件すべての解消や互換修正版の存在を保証しない。警告数は依存への伝播を含み、独立した攻撃経路の数ではない。
- 一時コピーへ既存のnode_modules、生成物、`.env*`、`.dev.vars*`、実データ、ローカル専用設定を持ち込まない。file依存に必要な`app/vendor/next-pwa`と`app/.npmrc`は含める。
- シェル操作はOrca内蔵ターミナルで行う。WindowsでNode.jsから子プロセスを起動する場合は`windowsHide: true`を指定する。
- テストはローカルまたはテスト専用DB・架空データ・外部APIスタブだけを使う。秘密の値をログへ出さない。
- コミット・push・PR作成・外部環境への反映は、この計画の実装作業に含めない。

## 変更予定ファイル

| ファイル | 役割・変更条件 |
| --- | --- |
| docs/dependency-audit-804.md | 新規作成。基準・候補・監査比較・採否・残存リスク・検証結果を記録 |
| `app/package-lock.json` | 対象警告を減らし検証を通る互換更新がある場合だけ変更 |
| `docs/test-plan.md` | 新しい監査記録へのリンクを追加 |
| `docs/lessons-learned.md` | 新たな再発防止規則に該当する学びが実際にある場合だけ追記 |

`app/package.json`、vendorの実装・依存宣言、アプリコードの変更は予定しない。それらの変更が必要になったら、本計画で黙って範囲を広げない。

## 確認を重点化する条件

1. アドバイザリDBの更新だけでも件数は変わる。基準lockと候補lockを近接した時刻に再監査し、対象GHSA・版・パスで効果を判定する（Task 1・2）。
2. 修正版が公開されても親制約を満たすとは限らない。親の宣言と`npm ls --all`の両方で確認する（Task 2・3）。
3. lock更新で無関係な依存が動くことがある。候補ごとのクリーンコピーと差分確認で混入を防ぐ（Task 2）。
4. `--omit=dev`の警告はWorkerリクエストからの到達性を示さない。導入区分・静的な呼び出し経路・未検証事項を分けて記録する（Task 4）。
5. next devのE2Eは本番SWやWorkerビルドを検証しない。変更した依存経路ごとに実行する検証を選ぶ（Task 3）。

### Task 1: 基準と候補検証環境を固定する

**Files:** 読み取り: `app/package.json`、`app/package-lock.json`、`app/.npmrc`、`app/vendor/next-pwa/UPSTREAM.md`。一時出力: 監査JSONと環境情報（Git管理外）。

**入力:** Issue #804の作業ブランチと現在の追跡済みソース。**成果物:** 基準lockのコピー、再現可能な環境情報、基準audit。

- [ ] `git status --short --branch`、`git rev-parse HEAD`、`git hash-object app/package-lock.json`、`node --version`、`npm --version`を記録する。開始基準はHEAD `5d4d927b770220d9ce88128f176808eaa31a8589`、lock blob `5d4fa15b4631710bed051523bbe05a3e6f882daa`。異なる場合は差分を調べ、基準を確定してから続ける。
- [ ] 一意な一時ディレクトリを用意し、追跡済みの依存マニフェスト・npm設定・vendorだけをコピーする。コピー後に秘密設定・node_modulesが存在しないことを確認する。既存の作業変更を上書きしない。
- [ ] 一時コピーの`app/`で`npm audit --package-lock-only --json`と`npm audit --package-lock-only --omit=dev --json`を実行し、出力と終了コード・取得日時を保存する。脆弱性ありの終了コードと通信・認証エラーを区別し、JSONの`metadata`・`vulnerabilities`を確認する。
- [ ] 開始時点の全依存53件（low 3 / moderate 43 / high 7）、omit=dev 18件（low 3 / moderate 12 / high 3）と再取得結果を比較する。差があれば新しい基準値を記録し、数値だけで更新の効果を判断しない。

### Task 2: 通常の互換解決を試し、効果を選別する

**Files:** 変更は候補用一時コピーの`app/package-lock.json`だけ。**入力:** Task 1の基準。**成果物:** 経路ごとの候補・採否表と、採用候補lock（存在する場合）。

- [ ] 一時コピーで`npm audit fix --dry-run --ignore-scripts --json`を確認する。対象経路の公開版・依存宣言は`npm view <package>@<version> dependencies --json`で再確認する。dry-runの提案をそのまま採用せず、版・親制約・変更範囲を読む。
- [ ] glob／minimatch、OpenNext／node-minify、Workbox／Rollup、Jest、deepmerge、Prisma／deepmerge-tsの経路について、基準lockの親・版・制約と修正版を対応付ける。glob 14.0.2以上、minimatch 11.0.1以上、deepmerge-ts 8以上へ通常解決できるかを確認する。deepmergeに修正版が出たかも再確認する。
- [ ] 各有望候補について新しい基準コピーから開始し、`npm audit fix --package-lock-only --ignore-scripts`または対象経路に絞った`npm update <package> --package-lock-only --ignore-scripts`を試す。manifestと親制約を維持し、lockのJSONを手編集して解決版を強制しない。固定版の親を変更しないと解消できない候補は見送る。
- [ ] 候補と基準の両lockを同時期に再監査し、対象GHSA、影響パス、全依存／omit=dev件数、追加警告の有無を比較する。過去に解消したserialize-javascriptの3 GHSAも再導入していないことを確認する。
- [ ] lock差分に対象経路の解決に不要な更新がある候補は、より狭い通常解決で再生成する。分離できなければ混在したまま採用しない。対象警告が減らない候補は採用しない。

現時点では、OpenNextの新版にもnode-minify経由のglob固定が残り、WorkboxやJestの最新宣言も修正版globのmajorと一致しない可能性がある。Prisma 6の固定deepmerge-tsとdeepmergeの未修正状況も制約になる。これらは試験前の見通しとして扱い、当日の公開定義と監査結果で結論を出す。

### Task 3: 採用候補の導入・互換性を確認する

**Files:** 採用する場合だけ`app/package-lock.json`。テストは既存の`app/e2e/`、`app/e2e-pwa/`、`app/src/__tests__/`とビルドスクリプトを使う。

**入力:** Task 2で効果が認められた候補。**成果物:** 検証済みの最小lock差分、または採用見送りの理由。

- [ ] 候補がなければ依存更新を省略しTask 4へ進む。候補があれば、秘密設定を除いた追跡済みソースの一時クリーンコピーへ候補lockを配置し、`npm ci`と`npm ls --all`を実行する。両Prisma Clientの生成・file依存導入が成功し、invalid／extraneousがないことを確認する。install scriptの新たな包括許可は追加しない。
- [ ] 検証用の一時クリーンコピーのルートで`git init`を実行し、コピー元の基準追跡ファイル一覧にあるソースだけをindexへ登録する。node_modules・秘密設定・生成物は登録せず、remote設定・commitは不要。`check:docs`が使う`git rev-parse`と`git ls-files`がコピー内のソースを参照できることを確認する。
- [ ] 一時コピーで`npm run check`を実行する。Jest経路が変わる場合はCI相当の`npm run test -- --coverage`も実行し、文字列化するPWA関数のテストが計測付きでも通ることを確認する。
- [ ] 変更経路に沿って次の回帰検証を選び、実行したコマンド・結果と省略理由を記録する。テストの名前だけでなく本文を読み、今回の互換性を何で確認できるかを説明する。

| 変更経路 | 必要な追加検証 |
| --- | --- |
| OpenNext／ビルド用glob | `npm run build`。Linux/glibc 2.35以上のクリーン環境で`npm run build:worker`と`npm run smoke:worker`（ローカルD1・架空設定） |
| Workbox／Rollup／PWA生成 | `npm run build:test:pwa`と`.env.test`明示の`npm run test:e2e:pwa`。実SW・2ユーザー分離・オフライン拒否・公開資産を確認。Linux Workerビルド／smokeも実行 |
| Jestだけ | coverageを含む単体テスト。アプリの実行依存・生成物が変わらない根拠があればDB/E2Eの追加実行は不要 |
| アプリの実行依存 | 関連する通常E2E／デモE2Eを`.env.test`明示で実行。DBクライアント・アダプタに影響する場合はMySQL／D1結合テストを追加 |
| prod-only導入やDocker内の導入に影響 | 別の空コピーでprod-only導入と`npm ls`を確認。Docker両ステージ・完成イメージのPrisma CLIと未認証HTTP疎通を確認 |

- [ ] 失敗は実行環境による起動失敗とアプリの退行を区別する。失敗を成功扱いせず、無関係な機能修正を混ぜない。意味のある検証を満たせない候補は、未検証のまま採用しない。
- [ ] 通過した候補lockだけを作業ブランチへ反映する。最終lockを再監査し、`npm ls`の解決結果と照合する。manifest不変・対象経路の最小差分・新規警告なしを確認する。

### Task 4: 結果と残留リスクを記録する

**Files:** 作成: docs/dependency-audit-804.md。更新: `docs/test-plan.md`。条件付き更新: `docs/lessons-learned.md`。

**入力:** Task 1〜3の証拠。**成果物:** 採用の有無にかかわらず、再確認できる監査記録。

- [ ] 監査記録に、基準・日時・実行環境、対象5 GHSA、親制約と解決版、候補別の採否、全依存／omit=devの前後比較、実行した検証を記載する。修正版の公開情報と導入後の実測を分ける。
- [ ] 残存警告には、確認した用途・入力・呼び出し元、判断の根拠、未検証事項、再確認条件を記載する。`--omit=dev`だけからWorkerへの同梱や到達性を断定しない。既存の[Prisma調査](../../dependency-audit-778.md)などの静的評価と今回の確認範囲を区別する。
- [ ] 採用候補がなければ、依存ファイルが基準と同一であることを確認する。記録のみの結果にも`app/`で`npm run check`と`npm run check:docs`を実行し、依存・アプリコード不変のため重いDB/E2E／ビルドを再実行しない旨を記載する。過去の成功を今回の実行結果と混同しない。
- [ ] `docs/test-plan.md`へ新しい記録のリンクを追加する。新たな再発防止規則があれば既存基準に沿ってlessons-learnedへ記録する。`git diff --check`と対象ファイルの差分を確認し、受け入れ基準に対応する証拠と未解決事項を報告する。

## 完了条件

- 対象GHSA・版・依存経路で比較でき、採用更新は警告削減と互換性の両方を満たす。
- 更新がない場合も、試した候補・阻害制約・残留リスク・再確認条件が明確で、依存ファイルは不変。
- 採否に寄与しない更新や機能変更が差分に含まれず、必要な検証の未実行・失敗が隠されていない。

## 参照

- [前回集約 #772](../../dependency-audit-772.md)
- [互換更新 #775](../../dependency-audit-775.md)
- [PWA依存 #776](../../dependency-audit-776.md)
- [Prisma設定依存 #778](../../dependency-audit-778.md)
- [Wrangler更新 #789](../../dependency-audit-789.md)
- [学び・過去の手直し](../../lessons-learned.md)
