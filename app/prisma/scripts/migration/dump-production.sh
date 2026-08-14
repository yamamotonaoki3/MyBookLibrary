#!/usr/bin/env bash
# 本番DBのdumpを取得する（Issue #478 / docs/data-migration-spec-481.md準拠）。
#
# 使い方:
#   cd app
#   set -a; source .env.migration-source; set +a
#   ./prisma/scripts/migration/dump-production.sh ./prisma/scripts/migration/dumps
#
# 必須環境変数（.env.migration-source等、gitignore対象のファイルから読み込む。
# このスクリプト自身には接続情報を一切ハードコードしない）:
#   SOURCE_DB_HOST, SOURCE_DB_PORT, SOURCE_DB_USER, SOURCE_DB_PASSWORD, SOURCE_DB_NAME
#
# オプション:
#   --skip-extended-insert : 1行1 INSERT文にする（照合ツールの件数パースに必須。既定で有効）
#   --single-transaction   : 読み取り一貫性を保証（既定で有効）
#   --default-character-set=utf8mb4 : 文字コードを明示（既定で有効）
set -euo pipefail

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

# パスワード等の秘密情報を標準出力・ログに残さないよう、
# コマンドラインではなく MYSQL_PWD 環境変数で渡す。
MYSQL_PWD="${SOURCE_DB_PASSWORD}" mysqldump \
  --single-transaction \
  --default-character-set=utf8mb4 \
  --skip-extended-insert \
  --no-tablespaces \
  --routines \
  --triggers \
  -h "${SOURCE_DB_HOST}" \
  -P "${SOURCE_DB_PORT:-3306}" \
  -u "${SOURCE_DB_USER}" \
  "${SOURCE_DB_NAME}" > "${TMP_FILE}"

mv "${TMP_FILE}" "${OUTPUT_FILE}"
trap - EXIT

echo "dump取得完了: ${OUTPUT_FILE}"
echo "続けて 'npx tsx prisma/scripts/migration/dump-checksum.ts ${OUTPUT_FILE}' を実行してください。"
