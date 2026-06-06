import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import ReviewForm from "./_components/ReviewForm";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const book = await prisma.book.findUnique({
    where: { id: Number(id) },
    select: { title: true },
  });
  return {
    title: book ? `${book.title} の感想を投稿 | MyBookLibrary` : "Not Found",
  };
}

export default async function NewReviewPage({ params }: Props) {
  const { id } = await params;
  const bookId = Number(id);

  if (isNaN(bookId)) notFound();

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: { id: true, title: true },
  });

  if (!book) notFound();

  return <ReviewForm bookId={book.id} bookTitle={book.title} />;
}
