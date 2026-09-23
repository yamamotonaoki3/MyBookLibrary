import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("シードデータの投入を開始します...");

  // 文学賞マスターデータ
  await Promise.all([
    prisma.award.upsert({
      where: { name: "直木賞" },
      update: {},
      create: { name: "直木賞" },
    }),
    prisma.award.upsert({
      where: { name: "芥川賞" },
      update: {},
      create: { name: "芥川賞" },
    }),
    prisma.award.upsert({
      where: { name: "本屋大賞" },
      update: {},
      create: { name: "本屋大賞" },
    }),
    prisma.award.upsert({
      where: { name: "このミステリーがすごい！" },
      update: {},
      create: { name: "このミステリーがすごい！" },
    }),
  ]);

  console.log("文学賞を登録しました");

  // 管理者ユーザー
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminRawPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminRawPassword) {
    throw new Error(
      "環境変数 SEED_ADMIN_EMAIL と SEED_ADMIN_PASSWORD の設定が必要です"
    );
  }
  const adminPassword = await bcrypt.hash(adminRawPassword, 12);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "管理者",
      email: adminEmail,
      password: adminPassword,
      role: "admin",
    },
  });

  console.log("ユーザーを登録しました");
  console.log(`  管理者: ${adminEmail}`);
  console.log("シードデータの投入が完了しました！");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
