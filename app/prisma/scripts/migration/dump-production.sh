#!/usr/bin/env bash
# 本番DBのdumpを取得する（Issue #478 / docs/data-migration-spec-481.md準拠）。
#
# 使い方:
#   cd app
#   npx dotenv -e .env.migration-source -o --no-expand -- ./prisma/scripts/migration/dump-production.sh ./prisma/scripts/migration/dumps
#
# 注意: `set -a; source .env.migration-source; set +a` のようにシェルの`source`で
# 読み込んではいけない。パスワードに`$`やバッククォート等のシェル特殊文字が含まれる場合、
# 値がシェルコードとして展開・実行されてしまう危険がある。
#
# 必須環境変数（.env.migration-source等、gitignore対象のファイルから読み込む。
# このスクリプト自身には接続情報を一切ハードコードしない）:
#   SOURCE_DB_HOST, SOURCE_DB_PORT, SOURCE_DB_USER, SOURCE_DB_PASSWORD, SOURCE_DB_NAME
#
# 任意環境変数:
#   SOURCE_DB_SSL_CA : 移行元DB（RDS等）のCA証明書ファイルへのパス。
#     指定した場合、TLSでサーバー証明書を検証したうえで接続する
#     （--ssl-mode=VERIFY_IDENTITY --ssl-ca=<path>）。ネットワーク経由で本番へ
#     接続する場合、中間者攻撃による認証情報・dumpの窃取を防ぐため指定を強く推奨する。
#
# オプション:
#   --skip-extended-insert : 1行1 INSERT文にする（照合ツールの件数パースに必須。既定で有効）
#   --single-transaction   : 読み取り一貫性を保証（既定で有効）
#   --default-character-set=utf8mb4 : 文字コードを明示（既定で有効）
set -euo pipefail

# dumpにはパスワードハッシュ・OAuthトークン等の機密情報が含まれる。マルチユーザー環境で
# 他のローカルユーザーから読み取られないよう、作成するファイルの権限を所有者のみに絞る
# （既定のumaskのままだと0644で作成され、dump-checksum.tsが権限を絞るまでの間、
# 他ユーザーから読める状態になってしまう）。
umask 077

OUTPUT_DIR="${1:?出力先ディレクトリを指定してください（例: ./prisma/scripts/migration/dumps）}"

for var in SOURCE_DB_HOST SOURCE_DB_USER SOURCE_DB_PASSWORD SOURCE_DB_NAME; do
  if [ -z "${!var:-}" ]; then
    echo "エラー: 環境変数 ${var} が設定されていません。" >&2
    exit 1
  fi
done

mkdir -p "$OUTPUT_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_FILE="${OUTPUT_DIR}/dump_${TIMESTAMP}.sql"
TMP_FILE="${OUTPUT_FILE}.tmp"

# mysqldumpが失敗した場合に不完全なdumpファイルを残さないよう、
# 一時ファイルへ書き出してから、成功時のみ最終ファイル名へ改名する（アトミックな公開）。
# 失敗時はtrapで一時ファイルを削除する。
cleanup_tmp_file() {
  rm -f "${TMP_FILE}"
}
trap cleanup_tmp_file EXIT

# --set-gtid-purged=OFF: RDS等GTIDが有効なソースの場合、既定の--set-gtid-purged=AUTOだと
# dumpにGTID_PURGED/SQL_LOG_BIN文が出力される。今回は異なるインスタンス（Aiven）への
# 論理移行であり、Aiven側の管理ユーザーは通常これらの文を実行する権限を持たないため、
# 復元時（既にDROP済みの状態）にエラーになってしまう。GTID関連の文を出力しないようにする。
SSL_ARGS=()
if [ -n "${SOURCE_DB_SSL_CA:-}" ]; then
  SSL_ARGS=(--ssl-mode=VERIFY_IDENTITY "--ssl-ca=${SOURCE_DB_SSL_CA}")
fi

# パスワード等の秘密情報を標準出力・ログに残さないよう、
# コマンドラインではなく MYSQL_PWD 環境変数で渡す。
MYSQL_PWD="${SOURCE_DB_PASSWORD}" mysqldump \
  --single-transaction \
  --default-character-set=utf8mb4 \
  --skip-extended-insert \
  --no-tablespaces \
  --routines \
  --triggers \
  --set-gtid-purged=OFF \
  "${SSL_ARGS[@]}" \
  -h "${SOURCE_DB_HOST}" \
  -P "${SOURCE_DB_PORT:-3306}" \
  -u "${SOURCE_DB_USER}" \
  "${SOURCE_DB_NAME}" > "${TMP_FILE}"

mv "${TMP_FILE}" "${OUTPUT_FILE}"
trap - EXIT

echo "dump取得完了: ${OUTPUT_FILE}"
echo "続けて 'npx tsx prisma/scripts/migration/dump-checksum.ts ${OUTPUT_FILE}' を実行してください。"
