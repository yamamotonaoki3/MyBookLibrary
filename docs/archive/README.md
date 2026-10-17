# アーカイブ（作業が完了した記録）

移行や調査などの作業が完了したときの記録。**現状の説明ではない**ため、現在の構成・手順は、[索引](../README.md) の現役の文書を参照する。

ソースコードのコメントが、これらの文書の節（例: `§5-3`）を参照している。移動に合わせて、コメント中のパスは更新した。節の番号は変えない。

| 文書 | 内容 |
| --- | --- |
| [cloudflare-d1-migration-plan.md](cloudflare-d1-migration-plan.md) | Cloudflare Workers + D1 への移行計画と、実装メモ（#609）。**2026-10-17 に本番へ切り替え済み**（[切り替え手順書](../d1-cutover-runbook.md)） |
| [data-migration-spec-481.md](data-migration-spec-481.md) | 旧本番 DB から現行スキーマへの、データ変換仕様（#481） |
| [schema-diff-482.md](schema-diff-482.md) | 本番環境の実態・スキーマ差分の棚卸し（#482）。取りやめた移行方針の時点の記録 |
| [production-data-audit.md](production-data-audit.md) | AWS 本番データの読み取り専用照合（`npm run audit:production-readonly`。AWS 本番 RDS 専用） |
| [unused-api-audit-611.md](unused-api-audit-611.md) | 未使用 API の監査記録（#611） |
