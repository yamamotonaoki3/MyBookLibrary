# AWS 本番データの読み取り専用照合

`npm run audit:production-readonly` は本番 RDS 専用である。`DATABASE_URL` のホストが `PRODUCTION_DB_HOST` と完全一致しない限り、DB 接続前に停止する。

出力は件数、最大 ID、AUTO_INCREMENT、orphan 数、ユニーク制約違反数、`manual` 書籍の所有者有無だけである。メールアドレス、本文、接続文字列、個別 ID は出力しない。実行は AWS SSM の読み取り専用の運用手順で行い、結果は PASS/FAIL と集計値だけを #614 に記録する。

この監査はデータを更新しない。`manual` 書籍の所有者推定・更新は別手順であり、本監査に含めない。
