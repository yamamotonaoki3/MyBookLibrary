/**
 * メールアドレスの小文字正規化（#651）の事前検査。読み取り専用で、メールアドレス自体は出力せず、件数だけを表示する。
 *
 * - normalizeNeeded: 小文字化で値が変わるユーザー数（マイグレーションで更新される対象）
 * - collisions: 小文字化すると他のユーザーと重複するグループ数（MySQL では 0 のはず）
 * - whitespaceCollisions: 前後の空白を除いて小文字化すると重複するグループ数。0 でなければ、D1 への移行（ETL）前に手動で確認する
 *
 * 実行: npm run audit:email-normalization （DATABASE_URL の接続先に対して実行される）
 */
import "dotenv/config";
import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();

async function scalar(sql: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, number | bigint>>>(sql);
  return Number(rows[0]?.value ?? 0);
}

async function main(): Promise<void> {
  const total = await scalar("SELECT COUNT(*) AS value FROM users");
  // BINARY で比較し、MySQL の大文字小文字を区別しない照合順序の影響を受けないようにする
  const normalizeNeeded = await scalar(
    "SELECT COUNT(*) AS value FROM users WHERE BINARY email <> LOWER(email)"
  );
  const collisions = await scalar(
    "SELECT COUNT(*) AS value FROM (SELECT LOWER(email) AS e FROM users GROUP BY LOWER(email) HAVING COUNT(*) > 1) x"
  );
  const whitespaceCollisions = await scalar(
    "SELECT COUNT(*) AS value FROM (SELECT LOWER(TRIM(email)) AS e FROM users GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1) x"
  );
  console.log(JSON.stringify({ total, normalizeNeeded, collisions, whitespaceCollisions }, null, 2));
  if (collisions > 0 || whitespaceCollisions > 0) {
    console.error("重複するグループがあります。マイグレーション前に手動で確認してください。");
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
