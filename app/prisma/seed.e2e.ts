/**
 * E2E（Playwright）専用のシードスクリプト。
 *
 * `prisma/seed.dev.ts`（開発用）とは意図的に分離している。開発用シードは
 * 今後も変更されうるため、E2Eが依存する固定データ（既知ユーザー・特定の
 * ISBN・書籍タイトル等）が意図せず壊れるのを防ぐため。
 *
 * 実行前に `resetDb()` 相当のクリーンな状態を前提とする
 * （`playwright.config.ts` の `globalSetup` で db-test に対して呼び出す）。
 */
import { PrismaClient } from "../src/generated/prisma";
import { assertTestDatabaseUrl } from "../src/__tests__/helpers/testDbGuard";

export const E2E_USER = {
  email: "e2e-test@example.com",
  password: "E2ETestPass123!",
  name: "E2Eテストユーザー",
};

/**
 * E2E用シードを投入する。呼び出し元（CLI実行／`e2e/global-setup.ts`からの
 * import 実行のいずれか）が事前に `DATABASE_URL` をE2E用DBへ設定し、
 * 安全性を確認していることを前提とする。
 */
export async function seedE2e(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(E2E_USER.password, 12);

    await prisma.user.upsert({
      where: { email: E2E_USER.email },
      update: { password: passwordHash },
      create: {
        name: E2E_USER.name,
        email: E2E_USER.email,
        password: passwordHash,
        role: "user",
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  // CLI実行（`npx tsx prisma/seed.e2e.ts`）の場合のみ .env.test を読み込む。
  // import実行（e2e/global-setup.ts経由）では呼び出し元が読み込み済みの
  // 環境変数を使う。
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config({ path: ".env.test", override: true });
  assertTestDatabaseUrl(process.env.DATABASE_URL);
  seedE2e()
    .then(() => console.log("E2E用シードデータの投入が完了しました"))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
