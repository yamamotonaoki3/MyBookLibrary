import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { searchBooksByIsbn } from "@/lib/rakuten";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ isbn: string }>;
};

function parseSalesDate(salesDate: string): Date {
  const match = salesDate.match(/(\d{4})年(\d{2})月(?:(\d{2})日)?/);
  if (!match) return new Date();
  const year = parseInt(match[1]);
  const month = parseInt(match[2]) - 1;
  const day = match[3] ? parseInt(match[3]) : 1;
  return new Date(year, month, day);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { isbn } = await params;
  const book = await prisma.book.findUnique({ where: { isbn }, select: { title: true } });
  if (book) return { title: `${book.title} | MyBookLibrary` };
  const rakutenBook = await searchBooksByIsbn(isbn);
  return { title: rakutenBook ? `${rakutenBook.title} | MyBookLibrary` : "本の詳細" };
}

export default async function BookIsbnPage({ params }: Props) {
  await auth();
  const { isbn } = await params;

  // DB にある場合はそのまま本詳細へ
  const dbBook = await prisma.book.findUnique({ where: { isbn } });
  if (dbBook) {
    redirect(`/books/${dbBook.id}`);
  }

  // DB にない場合は楽天APIで取得して自動登録してからリダイレクト
  const rakutenBook = await searchBooksByIsbn(isbn);
  if (!rakutenBook) notFound();

  const normalizedAuthorName = normalizeAuthorName(rakutenBook.author);
  let authorRecord = await prisma.author.findFirst({
    where: { name: normalizedAuthorName },
  });
  if (!authorRecord) {
    authorRecord = await prisma.author.create({ data: { name: normalizedAuthorName } });
  }

  const newBook = await prisma.book.create({
    data: {
      title: rakutenBook.title,
      authorId: authorRecord.id,
      isbn: rakutenBook.isbn || isbn,
      coverImageUrl: rakutenBook.largeImageUrl || null,
      publishedAt: rakutenBook.salesDate ? parseSalesDate(rakutenBook.salesDate) : new Date(),
    },
  });

  redirect(`/books/${newBook.id}`);
}
