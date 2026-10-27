# Issue #789：Wrangler・Miniflareのundici修正版への更新

2026-10-27時点。PR #788のマージコミット `cfc300a` を基準に作業した。

## 経緯

#775では、Wrangler → Miniflare → `undici` の警告に対するnpmの提案がダウングレード（Wrangler 4.35.0）だけで、現行の範囲 `^4.149.0` の外だったため、見送った。2026-10-27の再確認で、範囲内の `wrangler 4.153.0` が出ており（`miniflare 5.20261023.0-beta` → `undici 7.30.1`）、`npm audit fix --dry-run` が、`--force` なしの互換更新を提案することを確認した。

## 採用した更新

`npm audit fix --package-lock-only --ignore-scripts` でロックファイルだけを更新し、`npm ci` で反映した。`package.json` は変更していない（直接依存の宣言・範囲は不変）。force・override・ダウングレードは使っていない。

| パッケージ | 更新前 | 更新後 |
| --- | --- | --- |
| `wrangler` | 4.152.0 | 4.153.0 |
| `miniflare` | 5.20261019.2-beta | 5.20261023.0-beta |
| `workerd`（`@cloudflare/workerd-*` 5プラットフォームを含む） | 1.20261019.1 | 1.20261023.1 |
| `undici`（`miniflare` 配下の入れ子） | 7.29.1 | 削除（`miniflare` が、最上位の 7.30.1 を使う） |

解決経路は `wrangler` 4.153.0 → `miniflare` 5.20261023.0-beta → `undici` 7.30.1（修正版）。

## 対象の警告

GHSA-4qv8-2p9j-2685、GHSA-f72v-6w45-q472、GHSA-xjj6-f33q-929c（`undici`：7.x は 7.30.1 未満が対象）は、この更新で消えた。

## 実測（2026-10-27）

- 全依存の監査は10件（moderate 2 / high 8）から7件（moderate 0 / high 7）へ減少。`wrangler`・`miniflare`・`undici` の3件が消えた。件数は依存への伝播を含み、独立した悪用経路の数ではない。
- 本番のみの監査（`--omit=dev`）は、更新の前後ともhigh 3件（Prisma系）で変わらない。今回の対象は、本番の依存に含まれない、ローカルWorker・ビルド用のツールの経路だった。
- `npm ci` と `npm ls` は成功した。

## 残存警告（7件）

| 経路 | 理由・担当 |
| --- | --- |
| `@opennextjs/cloudflare` → `@opennextjs/aws` → `@node-minify/core` → `glob`（4件） | OpenNextのビルド用ツール。GHSA-5j98-mcp5-4vw2 は、攻撃者が影響できるファイル名を、CLIのコマンド実行に渡す場合が対象（#775の記録）。`@opennextjs/cloudflare` は最新の1.20.13で、npmの提案はダウングレード（1.20.9）だけ。互換の修正版は、ない。担当するIssueは、現時点でない。OpenNextに修正版が出たときに、再確認する |
| `prisma` → `@prisma/config` → `deepmerge-ts`（3件） | #778で、Prisma 6.19.3の維持と、残留リスクとしての記録を決定済み（[記録](dependency-audit-778.md)） |

## 検証

- `npm run check`：76 suites、779 tests成功。
- MySQL結合テスト：15 suites、84成功・16スキップ・失敗0。
- Linux（`node:22.23.4-bookworm`、glibc）：`npm ci`、D1結合テスト97成功・3スキップ、`build:worker`（wasm含む）成功、`smoke:worker` 10項目成功（実D1のログイン・保護ページ・Cronを含む）。
- Codexレビュー、CI（通常・デモ・本番PWAのE2Eを含む）は、PRで確認する。
- ステージングの確認、本番・デモへの反映は、別途の承認と検証を経て行う（行っていない）。

## 検証していないこと

- 警告の悪用可能性（到達性）は、評価していない。更新により、警告そのものが消えたため。
