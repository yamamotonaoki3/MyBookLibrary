import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("開発用シードデータの投入を開始します...");

  // 著者
  const authors = await Promise.all([
    prisma.author.upsert({
      where: { id: 1 },
      update: { name: "池井戸潤" },
      create: { name: "池井戸潤" },
    }),
    prisma.author.upsert({
      where: { id: 2 },
      update: { name: "東野圭吾" },
      create: { name: "東野圭吾" },
    }),
    prisma.author.upsert({
      where: { id: 3 },
      update: { name: "湊かなえ" },
      create: { name: "湊かなえ" },
    }),
    prisma.author.upsert({
      where: { id: 4 },
      update: { name: "又吉直樹" },
      create: { name: "又吉直樹" },
    }),
    prisma.author.upsert({
      where: { id: 5 },
      update: { name: "辻村深月" },
      create: { name: "辻村深月" },
    }),
    prisma.author.upsert({
      where: { id: 6 },
      update: { name: "宮部みゆき" },
      create: { name: "宮部みゆき" },
    }),
  ]);

  const [ikeido, higashino, minato, matayoshi, tsujimura, miyabe] = authors;

  console.log("著者を登録しました");

  // 書籍
  const books = await Promise.all([
    prisma.book.upsert({
      where: { id: 1 },
      update: {},
      create: {
        authorId: ikeido.id,
        title: "下町ロケット",
        publishedAt: new Date("2010-11-24"),
      },
    }),
    prisma.book.upsert({
      where: { id: 2 },
      update: {},
      create: {
        authorId: higashino.id,
        title: "容疑者Xの献身",
        publishedAt: new Date("2005-08-25"),
      },
    }),
    prisma.book.upsert({
      where: { id: 3 },
      update: {},
      create: {
        authorId: tsujimura.id,
        title: "鍵のない夢を見る",
        publishedAt: new Date("2012-05-30"),
      },
    }),
    prisma.book.upsert({
      where: { id: 4 },
      update: {},
      create: {
        authorId: matayoshi.id,
        title: "火花",
        publishedAt: new Date("2015-03-11"),
      },
    }),
    prisma.book.upsert({
      where: { id: 5 },
      update: {},
      create: {
        authorId: tsujimura.id,
        title: "かがみの孤城",
        publishedAt: new Date("2017-05-12"),
      },
    }),
    prisma.book.upsert({
      where: { id: 6 },
      update: {},
      create: {
        authorId: higashino.id,
        title: "夜明けのすべて",
        publishedAt: new Date("2019-11-28"),
      },
    }),
    prisma.book.upsert({
      where: { id: 7 },
      update: {},
      create: {
        authorId: minato.id,
        title: "告白",
        publishedAt: new Date("2008-08-05"),
      },
    }),
    prisma.book.upsert({
      where: { id: 8 },
      update: {},
      create: {
        authorId: miyabe.id,
        title: "ソロモンの偽証",
        publishedAt: new Date("2012-10-11"),
      },
    }),
  ]);

  const [book1, book2, book3, book4, book5, book6, book7, book8] = books;

  console.log("書籍を登録しました");

  // 受賞・ノミネート情報（文学賞マスターは seed.ts で投入済み前提）
  const [naoki, akutagawa, honya, konomys] = await Promise.all([
    prisma.award.findFirstOrThrow({ where: { name: "直木賞" } }),
    prisma.award.findFirstOrThrow({ where: { name: "芥川賞" } }),
    prisma.award.findFirstOrThrow({ where: { name: "本屋大賞" } }),
    prisma.award.findFirstOrThrow({ where: { name: "このミステリーがすごい！" } }),
  ]);

  const awardEntries = [
    { bookId: book1.id, awardId: naoki.id, year: 2011, type: "winner" },
    { bookId: book2.id, awardId: naoki.id, year: 2006, type: "nominee" },
    { bookId: book3.id, awardId: naoki.id, year: 2012, type: "winner" },
    { bookId: book4.id, awardId: akutagawa.id, year: 2015, type: "winner" },
    { bookId: book5.id, awardId: honya.id, year: 2018, type: "winner" },
    { bookId: book6.id, awardId: honya.id, year: 2020, type: "nominee" },
    { bookId: book7.id, awardId: konomys.id, year: 2009, type: "winner" },
    { bookId: book8.id, awardId: konomys.id, year: 2013, type: "nominee" },
  ];

  for (const entry of awardEntries) {
    await prisma.awardEntry.upsert({
      where: {
        bookId_awardId_year: {
          bookId: entry.bookId,
          awardId: entry.awardId,
          year: entry.year,
        },
      },
      update: {},
      create: entry,
    });
  }

  console.log("受賞・ノミネート情報を登録しました");

  // テストユーザー
  const testEmail = process.env.SEED_TEST_EMAIL;
  const testRawPassword = process.env.SEED_TEST_PASSWORD;
  if (!testEmail || !testRawPassword) {
    throw new Error(
      "環境変数 SEED_TEST_EMAIL と SEED_TEST_PASSWORD の設定が必要です"
    );
  }
  const testPassword = await bcrypt.hash(testRawPassword, 12);
  await prisma.user.upsert({
    where: { email: testEmail },
    update: { password: testPassword },
    create: {
      name: "テストユーザー",
      email: testEmail,
      password: testPassword,
      role: "user",
    },
  });

  console.log("テストユーザーを登録しました");
  console.log(`  テスト: ${testEmail}`);
  console.log("開発用シードデータの投入が完了しました！");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
