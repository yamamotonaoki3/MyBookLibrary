import path from "node:path";

/**
 * 結合テスト用のローカル D1 の保存先。実行ごとに一意のディレクトリで、globalSetup が作って環境変数に設定する
 * （同じ端末で別の worktree などから同時に実行しても、お互いのデータを消さない）。
 * `wrangler d1 migrations apply --persist-to` と `getPlatformProxy` で共有する。
 */
export const D1_TEST_PERSIST_DIR_ENV = "D1_TEST_PERSIST_DIR";

export function getD1TestPersistDir(): string {
  const dir = process.env[D1_TEST_PERSIST_DIR_ENV];
  if (!dir) {
    throw new Error(
      `${D1_TEST_PERSIST_DIR_ENV} が設定されていません。integration-d1 project の globalSetup が実行されていない可能性があります。`
    );
  }
  return dir;
}

/**
 * テスト用の wrangler 設定（リポジトリの wrangler.jsonc のコピー）と空の .dev.vars の置き場所。
 * Jest の実行環境では、存在しない .dev.vars の読み込みを wrangler が正しく扱えないため、
 * 空のファイルを置いたこのディレクトリの設定を使う。
 */
export const getD1TestConfigDir = () => path.join(getD1TestPersistDir(), "config");
export const getD1TestConfigPath = () => path.join(getD1TestConfigDir(), "wrangler.jsonc");
