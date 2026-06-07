export type AwardItem = {
  id: number;
  name: string;
};

export type ReadingStatus = "unread" | "want_to_read" | "reading" | "read";

export type BookWithAwardEntry = {
  awardEntryId: number;
  year: number;
  type: string;
  status: ReadingStatus;
  book: {
    id: number;
    title: string;
    coverImageUrl: string | null;
    publishedAt: string;
    author: {
      id: number;
      name: string;
    };
  };
};

export type AwardsResponse = AwardItem[];
export type AwardBooksResponse = BookWithAwardEntry[];
