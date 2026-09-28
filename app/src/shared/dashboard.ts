import type { ReadingStatus } from "./readingStatus";

/** Serializable data required to render one recent reading record. */
export type RecentRead = {
  id: number;
  status: ReadingStatus;
  book: {
    id: number;
    title: string;
    authorName: string;
    isbn: string | null;
    coverImageUrl: string | null;
    publishedAt: string;
  };
};
