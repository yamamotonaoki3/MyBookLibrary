# Issue #777：shadcn経由のMCP・Express依存の警告の再確認

2026-10-27時点。PR #786のマージコミット `7070d23` を基準に再確認した。コード・パッケージは変更していない。

## 結論

対象の警告は、#775の互換範囲の更新ですでに消えていた。#777では依存を変更しない。受け入れ基準を、現在のmainで次のとおり確認した。

| 受け入れ基準 | 確認結果 |
| --- | --- |
| 対象警告が解消、または残存する経路と理由が明確 | 解消済み。下記の「対象の警告」を参照 |
| MCP/Expressサーバーをアプリが意図せず公開しない | アプリのコード（`src`・`worker`・Next/OpenNextの設定）は、`shadcn`・MCP SDK・`express`・`hono` を読み込まない。使うのは `globals.css` の `@import "shadcn/tailwind.css"`（16KBのCSS）だけで、サーバーが起動する経路はない |
| Tailwind/CSS生成と主要UIが退行せず、依存の移動だけで警告を隠さない | コード・依存を変更していないため、退行しない。依存の移動・置換は行っていない |

## 対象の警告

[GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)は、`proxy-addr`（2.0.8未満）のIPv4-mapped IPv6の信頼サブネットによるIP偽装。Expressが依存する。

- 現在の `proxy-addr` は 2.0.8（修正版）。
- 解決経路は `express` 5.2.1 → `proxy-addr` 2.0.8。`shadcn` 4.22.1 → `@modelcontextprotocol/sdk` 1.32.2 → `express` 5.2.1 / `hono` 4.13.13 / `@hono/node-server` 2.1.5 / `express-rate-limit` 8.7.1 も、すべて修正後の版。
- `npm audit`（全依存・本番のみ）に、shadcn・MCP・Express・Hono・proxy-addr の警告はない。

## 実測（2026-10-27）

- 全依存の監査は10件（moderate 2 / high 8）。内訳は、OpenNext系（`@opennextjs/cloudflare`・`@opennextjs/aws`・`@node-minify/core`・`glob`）、Wrangler系（`wrangler`・`miniflare`・`undici`）、Prisma系（`prisma`・`@prisma/config`・`deepmerge-ts`）。
- 元の `node_modules` を使わない一時領域で、`npm ci --omit=dev --ignore-scripts` を実行した（680パッケージ）。本番のみの監査は high 3件で、すべてPrisma系（`prisma`・`@prisma/config`・`deepmerge-ts`）。後続の #778 で扱う。
- 本番のみの導入でも、`shadcn` はMCP SDK・Express・Hono を含めて導入される（`shadcn` が `dependencies` にあるため）。これらは上記のとおり修正後の版で、アプリは読み込まない。

## 残る論点（別判断）

`shadcn` 本体（CLI・MCP SDK・Express・Hono を含む）が、`globals.css` の16KBのCSSのためだけに、本番の依存に入っている。現在は警告がないが、将来、この経路に警告が出る可能性がある。

- 案：CSSをアプリ内にコピーし、`shadcn` を開発依存へ移す。本番の依存は減るが、CSSの供給元の変更にあたり、`shadcn` の更新に追従しなくなる。
- #777の方針（UIライブラリやCSS供給元の置換は、実装前にユーザーへ判断を求める）に従い、ユーザーが、現状維持（この記録のみ）を選択した。必要になれば、別Issueで検討する。

## 検証していないこと

- 依存・コードを変更していないため、`npm run check`・E2E・ビルド・Workerの疎通は再実行していない（直前の #786 のCIで成功している）。
- 警告の悪用可能性（`proxy-addr` に、Workerのリクエストから到達するか）は、評価していない。Expressをアプリが実行しないことを、コードの読み込みの確認で示したのみ。
