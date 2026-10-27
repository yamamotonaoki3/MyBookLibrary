# Issue #772：依存関係の監査警告の段階的解消（集約）

2026-10-28時点。PR #790のマージコミット `54efcbb` を基準に、子Issueの結果と残存警告を集約した。件数は `npm audit` の依存への伝播を含むパッケージ単位で、独立した悪用経路の数ではない。npm auditの結果は、パッケージを変更しなくても、アドバイザリDBの更新で増減する。

## 結論

- 開始時点（2026-10-23）の全依存42件・本番32件（critical 5 / high 19 / moderate 7 / low 1）から、現在は全依存7件（high 7）・本番3件（high 3）になった。critical・moderateは0件。
- 認証（Auth.js）、Next.js / OpenNext、PWA、shadcn、Wrangler経路の警告は解消または解消済みと確認した。残る7件は、OpenNext系4件とPrisma系3件。
- 本番のみの3件は、すべてPrisma系で、#778でPrisma 6.19.3の維持と残留リスクとしての記録を決定済み。
- ステージング・本番・デモへの反映は、まだ行っていない（下記「受け入れ基準の状況」）。

## 件数の推移

| 時点 | 全依存 | 本番のみ | 出典 |
| --- | --- | --- | --- |
| 開始（2026-10-23） | 42 | 32（critical 5 / high 19 / moderate 7 / low 1） | Issue #772 |
| #773・#774 のマージ後、#775 の前 | 33（moderate 11 / high 20 / critical 2） | 24 | [#775の記録](dependency-audit-775.md) |
| #775 の後 | 15（moderate 6 / high 9） | 8 | [#775の記録](dependency-audit-775.md) |
| #776 の後 | 10（moderate 2 / high 8） | 3 | [#776の記録](dependency-audit-776.md) |
| #777・#778 の後（変更なし） | 10 | 3 | [#777](dependency-audit-777.md)・[#778](dependency-audit-778.md) |
| #789 の後（現在） | 7（high 7） | 3（high 3） | [#789の記録](dependency-audit-789.md) |

#773と#774の個別の件数は、記録がないため、上の表では1行にまとめている。

## 子Issueの結果

| Issue | PR | 内容と結果 | 記録 |
| --- | --- | --- | --- |
| #773 Auth.js・Prisma Adapter | #779 | `next-auth` 5.0.0-beta.32、`@auth/prisma-adapter` 2.11.3、`@auth/core` 0.41.3へ更新。Auth関連3パッケージの警告が解消。既存のログインとセッション期限（保持なし8時間・保持あり30日・デモ15分）を維持する回帰テストとE2Eを追加 | PR #779、[test-plan](test-plan.md) |
| #774 Next.js・OpenNext | #780 | Next.jsを16.4.3、OpenNext Cloudflareを1.20.13へ更新。LinuxでのWorkerビルドと疎通10項目を確認 | PR #780、[lessons-learned](lessons-learned.md) |
| #775 互換範囲の間接依存 | #781 | `npm audit fix`（`--force` なし）で、ロックファイルのみ更新。全依存33件から15件、本番24件から8件 | [#775の記録](dependency-audit-775.md) |
| #776 PWAビルド依存 | #783 | `@ducanh2912/next-pwa` 10.2.9をローカルforkし、Workbox直接依存のみ7.4.1へ。`serialize-javascript` の3 GHSAが消失（全依存15件から10件）。PWAのキャッシュ対象を保護し、本番PWAのE2Eを追加 | [#776の記録](dependency-audit-776.md) |
| #777 shadcn経由のMCP・Express | #787 | #775の更新で、対象の警告（`proxy-addr` など）は解消済みと確認。依存の変更なし | [#777の記録](dependency-audit-777.md) |
| #778 Prisma設定依存 | #788 | Prisma 6系の最新6.19.3では、修正版の `deepmerge-ts` を使えない。6.19.3を維持し、残留リスクとして記録（強制overrideとPrisma 7移行は採用せず） | [#778の記録](dependency-audit-778.md) |
| #789 Wrangler・Miniflare（追加の子Issue） | #790 | #775で見送った `undici` 経路が、範囲内の `wrangler` 4.153.0で解消できることを再確認し、ロックファイルのみ更新。全依存10件から7件 | [#789の記録](dependency-audit-789.md) |

## 残存警告（7件）

| 経路 | 件数 | 理由 | 次の対応 |
| --- | ---: | --- | --- |
| `@opennextjs/cloudflare` → `@opennextjs/aws` → `@node-minify/core` → `glob`（GHSA-5j98-mcp5-4vw2） | 4 | OpenNextのビルド用ツール。攻撃者が影響できるファイル名を、CLIのコマンド実行に渡す場合が対象で、パッケージが存在するだけでは、CLIの利用を意味しない（#775の記録）。`@opennextjs/cloudflare` は最新の1.20.13で、npmの提案はダウングレード（1.20.9）だけ。互換の修正版はない | 担当するIssueはない。OpenNextに修正版が出たとき、またはOpenNextを更新するときに、再確認する（ユーザー判断が必要。下記） |
| `prisma` → `@prisma/config` → `deepmerge-ts`（GHSA-ggr8-5vv4-36mx） | 3 | Prisma 6系の最新は6.19.3で、修正版を使うのはPrisma 7系だけ。Prismaの設定の統合にだけ使われ、入力はリポジトリ内の固定の設定。Workerのリクエストには含まれない（#778の評価） | 6系に修正版が出たとき、またはPrisma 7への移行を計画するときに、再確認する。Prisma 7の影響調査のIssueは、起票していない（ユーザー判断が必要。下記） |

本番のみの3件は、すべてPrisma系。OpenNext系4件は、本番の依存に含まれない、ビルド用ツールの経路。

## 受け入れ基準の状況

| 基準 | 状況 |
| --- | --- |
| 各子Issueの結果と残存GHSAを集約する | この記録で集約した |
| 認証・Next.jsの優先警告を解消し、Cloudflareステージングで検証する | 警告は解消した（#773・#774）。ステージングでの検証は、この記録に確認の事実がなく、未確認。#773のPRは、実Googleアカウントでのログインを、ステージングで、ユーザーが確認する項目として残している |
| 未解消の警告は根拠・残留リスク・次の対応を記録し、ユーザーの判断を得る | 上の表に記録した。次の2点が、ユーザーの判断待ち（下記） |
| 本番・デモへの反映は、別途の明示承認と検証を経て行う | 行っていない |

## ユーザーの判断が必要なこと

1. OpenNext系4件：現状維持（修正版が出るまで残す）で良いか。担当Issueを立てて、定期的に再確認するか。
2. Prisma系3件：Prisma 7への移行の影響調査を、別Issueとして起票するか。
3. ステージングの確認（実Googleアカウントでのログインを含む）と、本番・デモへの反映の時期。

## 関連して見つかった別件（#772の範囲外）

依存更新の検証の過程で、アプリ自体の問題が見つかり、別Issueで修正した。

- #782（ログイン保持なしで、ブラウザを閉じて再訪問すると、ログイン画面がちらつく）：PR #785で修正。
- #784（ログアウト直後に、セッションCookieが復活することがある）：PR #786で修正。
