# Issue #778：Prisma設定依存（deepmerge-ts）の警告の調査

2026-10-27時点。PR #786のマージコミット `7070d23` を基準に調査した。コード・パッケージは変更していない。

## 結論

Prisma 6系のままでは、この警告を解消できない。ユーザーが、Prisma 6.19.3を維持し、残留リスクとして記録する方針を選択した（Prisma 7への移行は、本Issueでは行わない）。

| 受け入れ基準 | 結果 |
| --- | --- |
| Prisma 6維持で修正可能かと、その根拠が明確 | 修正できない。Prisma 6系の最新は6.19.3で、修正版の `deepmerge-ts` を使うのはPrisma 7系の `@prisma/config` だけ |
| 修正できる場合は警告を解消し、MySQL/D1/Worker/Dockerが退行しない | 修正しないため、変更なし |
| Prisma 7への移行が必要な場合は、独断で実施せず、ユーザー判断と後続計画を残す | 移行は実施していない。ユーザーが現状維持を選択した。見直しの条件を下記に残す |

## 対象の警告

[GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)（high）は、`deepmerge-ts` 8.0.0未満で、自己参照する細工されたオブジェクトを統合すると、再帰が止まらずスタックが尽きて落ちる（DoS）。

- 解決経路は `prisma` 6.19.3 → `@prisma/config` 6.19.3 → `deepmerge-ts` 7.1.5（`@prisma/config` が完全固定）。`prisma` と `@prisma/client` と `@prisma/adapter-d1` は、すべて6.19.3。
- npm auditの提案は `prisma@7.10.1`。`@prisma/config` 7.10.1 は `deepmerge-ts` 8.0.2 に依存する。
- Prisma 6系は6.19.3が最新（npmの `prev` タグも6.19.3）。6.19.3より新しい6系の版は存在しない。

## 到達性（コードの読み取りによる評価）

- `deepmerge-ts` は、PrismaのCLIが `prisma.config.ts` を読み込むとき（`@prisma/config` の `loadConfigTsOrJs`）に、`c12` の設定統合として使われるだけ。
- 入力は、このリポジトリの `prisma.config.ts`（固定の単純なオブジェクト）で、外部から細工された入力は通らない。
- Workerのリクエスト処理には含まれない。影響は、CLI（`prisma generate`・`validate`・`migrate`）の異常終了にとどまり、サーバーの乗っ取りではない。
- これはコードの読み取りによる評価で、実際の攻撃の試験は行っていない。

## 実測（2026-10-27）

- 全依存の監査は10件（moderate 2 / high 8）。うちPrisma系は `prisma`・`@prisma/config`・`deepmerge-ts` の3件。残りは、OpenNext系とWrangler系（#772の別の後続）。
- 本番のみの監査（`--omit=dev`）はhigh 3件で、すべてPrisma系の3件。

## 選ばなかった案

- `deepmerge-ts` を8.xへ強制上書き（override）する案：Prisma 6.19.3が想定しない組み合わせで、動作を保証できない。Issue #772の共通制約（制約を無視したoverrideの禁止）に反するため、採用しなかった。
- Prisma 7へ移行する案：D1/wasmのClient生成、`@prisma/adapter-d1`、Dockerのバンドルなど、広範囲に影響する。別Issueで影響調査と計画を立てる必要があり、本Issueでは行わない。実際の影響範囲は、調査していない。

## 見直しの条件

- Prisma 6系に、`deepmerge-ts` 8.x以降を使う修正版が出たとき。
- Prisma 7への移行を計画するとき（この警告は、7系への更新で解消する見込み。ただし、実際の解消は、移行時に確認する）。
- 到達性の前提が変わったとき（たとえば、外部の入力から、Prismaの設定を組み立てるようになったとき）。

## 検証していないこと

- 依存・コードを変更していないため、`npm run check`・E2E・ビルド・Workerの疎通は再実行していない。
- Prisma 7への移行の影響は、評価していない。
