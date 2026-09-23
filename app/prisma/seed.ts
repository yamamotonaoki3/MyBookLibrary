import "dotenv/config";
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
