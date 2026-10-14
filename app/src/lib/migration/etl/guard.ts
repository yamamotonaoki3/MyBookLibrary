/**
 * データ移行ツールの、接続先のガード（誤った DB への読み書きを、接続の前に拒否する）。
 * エラーメッセージには、接続文字列（パスワードを含む）を出さない。
 */

/** 本番の D1 の名前（wrangler.jsonc のトップレベル）。最終投入（#691）以外では、書き込みを拒否する。 */
export const PRODUCTION_D1_NAME = "mybooklibrary-db";
/** 本番の D1 の ID（wrangler.jsonc のトップレベル。秘密情報ではない）。名前を変えて指定されても、本番として扱うため。 */
export const PRODUCTION_D1_ID = "dd2f0ed7-5d12-4d7d-8722-97765ff4089b";

/** デモ環境の D1 の名前と ID（wrangler.jsonc の env.demo。秘密情報ではない）。デモ用のプロファイルは、この D1 にしか書き込まない。 */
export const DEMO_D1_NAME = "mybooklibrary-demo-db";
export const DEMO_D1_ID = "9db6893d-38e3-4795-b24d-1901d6a929ad";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 移行元は、取得済みのダンプを復元した、ローカルの MySQL だけを許可する（本番・共有の DB に接続しない）。 */
export function assertSourceUrlIsLocal(url: string | undefined): asserts url is string {
  if (!url) throw new Error("MIGRATION_SOURCE_DATABASE_URL が未設定です（ダンプを復元した、ローカルの MySQL の接続文字列）。");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("MIGRATION_SOURCE_DATABASE_URL が URL として不正です。");
  }
  if (parsed.protocol !== "mysql:") throw new Error("MIGRATION_SOURCE_DATABASE_URL は mysql:// で始まる必要があります。");
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error("移行元は、ローカル（localhost / 127.0.0.1）の MySQL だけを許可します。ダンプをローカルへ復元してから実行してください。");
  }
}

export type TargetArgs = {
  local: boolean;
  remote: boolean;
  d1Name?: string;
  d1Id?: string;
  confirmProduction?: string;
};

export type WritableTarget = { remote: boolean; name: string; id: string };

/** 移行先を検証して返す。リモートは名前と ID の両方が必要で、本番の D1 は、確認の指定がなければ拒否する。 */
export function assertWritableTarget(args: TargetArgs): WritableTarget {
  if (args.local === args.remote) throw new Error("移行先は、--local か --remote のどちらか一方を指定してください。");
  if (args.local) {
    if (args.d1Name || args.d1Id) throw new Error("--local では --d1-name / --d1-id は指定できません。");
    return { remote: false, name: "mybooklibrary-local", id: "00000000-0000-0000-0000-000000000000" };
  }
  if (!args.d1Name || !args.d1Id) throw new Error("--remote には、--d1-name と --d1-id の両方が必要です。");
  if (!UUID.test(args.d1Id)) throw new Error("--d1-id は UUID の形式で指定してください。");
  const isProduction = args.d1Name === PRODUCTION_D1_NAME || args.d1Id.toLowerCase() === PRODUCTION_D1_ID;
  if (isProduction && args.confirmProduction !== PRODUCTION_D1_NAME) {
    throw new Error(`名前が ${PRODUCTION_D1_NAME}、または ID が本番の D1 です。本番への投入は、最終投入の手順（#691）で、--confirm-production ${PRODUCTION_D1_NAME} を付けて行ってください。`);
  }
  return { remote: true, name: args.d1Name, id: args.d1Id };
}

export type MigrationProfile = "full" | "demo";

/**
 * 投入の種類（プロファイル）と、移行先の組み合わせを検証する。
 * - demo（マスターデータだけ）: 名前と ID がデモの D1 と一致するリモート、またはローカルだけ。本番・ステージングなど、他の D1 へは書き込まない。
 * - full（全テーブル）: デモの D1 は拒否する（ユーザーなどの実データを、公開するデモに入れないため）。
 */
export function assertProfileMatchesTarget(profile: MigrationProfile, target: WritableTarget): void {
  if (profile === "demo") {
    if (target.remote && (target.name !== DEMO_D1_NAME || target.id.toLowerCase() !== DEMO_D1_ID)) {
      throw new Error(`--profile demo の移行先は、デモの D1（${DEMO_D1_NAME}）だけです。名前と ID の両方がデモの D1 と一致する必要があります。`);
    }
    return;
  }
  if (target.name === DEMO_D1_NAME || target.id.toLowerCase() === DEMO_D1_ID) {
    throw new Error("デモの D1 には、全テーブルの移行はできません。--profile demo を付けて、マスターデータだけを投入してください。");
  }
}

/**
 * エラーを、画面に出して安全な文字列にする。Prisma のエラーのメッセージには、書き込もうとした値（メールアドレス・本文・
 * トークンなど）が含まれ得る（最初の行を含む）ため、種類（名前・コード）と、操作の名前（`prisma.<モデル>.<操作>`）だけを返す。
 * このツール自身が投げるエラーのメッセージは、値を含まないため、そのまま返す。
 */
export function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "不明なエラーです。";
  const code = (error as { code?: unknown }).code;
  const isPrisma = error.name.startsWith("PrismaClient") || (typeof code === "string" && /^P\d{4}$/.test(code));
  if (!isPrisma) return error.message;
  // 操作の名前は、`Invalid `prisma.user.createMany()` invocation` の形のときだけ取り出す（値を含む部分は出さない）
  const operation = /`(prisma\.[A-Za-z]+\.[A-Za-z]+)\(/.exec(error.message)?.[1];
  return `${error.name}${typeof code === "string" ? `（${code}）` : ""}${operation ? ` / ${operation}` : ""}（詳細は、値を含むため表示しません）`;
}
