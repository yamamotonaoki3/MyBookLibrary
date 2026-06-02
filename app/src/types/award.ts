export type AwardItem = {
  id: number;
  name: string;
};

export type BookWithAwardEntry = {
  awardEntryId: number;
  year: number;
  type: string;
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
