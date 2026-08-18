import { notFound, redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { searchBooksByIsbn } from "@/lib/rakuten";
import { resolvePreferringHardcover } from "@/lib/editionResolver";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";
import { parseSalesDateToUtcDate } from "@/lib/dateParsing";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ isbn: string }>;
};

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

  // 絶版等で楽天に単行本が無くこのISBN（文庫等）しか見つからなかった場合でも、
  // NDL・楽天を横断して単行本があればそちらを優先登録する。
  const resolved = await resolvePreferringHardcover({
    title: rakutenBook.title,
    author: rakutenBook.author,
    fallback: {
      title: rakutenBook.title,
      author: rakutenBook.author,
      isbn: rakutenBook.isbn || isbn,
      publisherName: rakutenBook.publisherName,
      salesDate: rakutenBook.salesDate,
      largeImageUrl: rakutenBook.largeImageUrl,
    },
  });

  // 解決したISBNがアクセスされたISBNと異なる（単行本が優先された）場合、
  // そちらが既にDB登録済みでないか確認する（Unique制約に抵触しないためのガード）。
  if (resolved.isbn && resolved.isbn !== isbn) {
    const existingByResolvedIsbn = await prisma.book.findUnique({ where: { isbn: resolved.isbn } });
    if (existingByResolvedIsbn) {
      redirect(`/books/${existingByResolvedIsbn.id}`);
    }
  }

  const normalizedAuthorName = normalizeAuthorName(resolved.author);
  let authorRecord = await prisma.author.findFirst({
    where: { name: normalizedAuthorName },
  });
  if (!authorRecord) {
    authorRecord = await prisma.author.create({ data: { name: normalizedAuthorName } });
  }

  const newBook = await prisma.book
    .create({
      data: {
        title: resolved.title,
        authorId: authorRecord.id,
        isbn: resolved.isbn || isbn,
        coverImageUrl: resolved.largeImageUrl || null,
        publishedAt: resolved.salesDate
          ? (parseSalesDateToUtcDate(resolved.salesDate) ?? new Date())
          : new Date(),
      },
    })
    .catch(async (err) => {
      // 同時リクエスト等でUnique制約に抵触した場合は、既存レコードを使う
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await prisma.book.findUnique({ where: { isbn: resolved.isbn || isbn } });
        if (existing) return existing;
      }
      throw err;
    });

  redirect(`/books/${newBook.id}`);
}
