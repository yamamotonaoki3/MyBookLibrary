/**
 * `ky`（ESM 専用）のスタブ。`@prisma/adapter-d1` は HTTP 版のために `ky` を読み込むが、
 * 結合テストが使うのはバインディング版（PrismaD1）だけで、`ky` は呼ばれない。
 * Jest（CommonJS）で `ky` を読み込めないため、integration-d1 project でこのスタブに差し替える。
 */
const ky = () => {
  throw new Error("ky はテストでは使えません（D1 の HTTP 版アダプタは対象外です）。");
};
export default ky;
export const HTTPError = class extends Error {};
