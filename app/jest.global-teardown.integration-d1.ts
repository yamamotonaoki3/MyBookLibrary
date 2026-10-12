/** integration-d1 project 専用の globalTeardown。globalSetup が作った一時ディレクトリ（ローカル D1）を削除する。 */
import { rmSync } from "node:fs";
import { D1_TEST_PERSIST_DIR_ENV } from "./src/__tests__/helpers/d1TestConfig";

export default async function globalTeardown(): Promise<void> {
  const dir = process.env[D1_TEST_PERSIST_DIR_ENV];
  // 想定外の場所を消さないよう、globalSetup が作った名前の一時ディレクトリだけを対象にする
  if (dir && /mbl-d1-itest-/.test(dir)) rmSync(dir, { recursive: true, force: true });
}
