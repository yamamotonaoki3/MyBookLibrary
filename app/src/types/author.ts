export type AuthorItem = {
  id: number;
  name: string;
  bookCount: number;
  isFavorite: boolean;
};

export type AuthorSearchResult = {
  name: string;
  isFavorite: boolean;
};

export type AuthorBook = {
  title: string;
  author: string;
  isbn: string;
  coverImageUrl: string | null;
  publisherName: string;
  salesDate: string;
  bookId: number | null;
  status: "unread" | "want_to_read" | "reading" | "read";
  awards: { name: string; year: number; type: string }[];
};

export type FavoriteAuthorItem = {
  id: number;
  authorId: number;
  authorName: string;
  bookCount: number;
  readingCount: number;
  readCount: number;
  notify: boolean;
};
