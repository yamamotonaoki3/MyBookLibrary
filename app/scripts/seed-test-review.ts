import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // テストユーザーを作成（存在しなければ）
  const testUser = await prisma.user.upsert({
    where: { email: "testuser@example.com" },
    update: {},
    create: {
      name: "テストユーザー",
      email: "testuser@example.com",
      role: "user",
    },
  });
  console.log(`テストユーザー: id=${testUser.id}, name=${testUser.name}`);

  // 本が存在するか確認
  const books = await prisma.book.findMany({ take: 3, select: { id: true, title: true } });
  if (books.length === 0) {
    console.log("本が登録されていません。先に本を登録してください。");
    return;
  }

  // 各本にテストレビューを作成
  for (const book of books) {
    const existing = await prisma.review.findFirst({
      where: { userId: testUser.id, bookId: book.id },
    });
    if (existing) {
      console.log(`スキップ（既存）: 「${book.title}」のレビューは既に存在します`);
      continue;
    }
    const review = await prisma.review.create({
      data: {
        userId: testUser.id,
        bookId: book.id,
        body: `「${book.title}」のテストレビューです。これはテスト用に作成されたレビューです。通報機能の動作確認にご利用ください。`,
        isSpoiler: false,
      },
    });
    console.log(`作成: 「${book.title}」(bookId=${book.id}) のレビュー id=${review.id}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
