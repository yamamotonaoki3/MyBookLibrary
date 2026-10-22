export type SearchResult = {
  publicReviewCount: number;
  id?: number;
  title: string;
  author: string;
  isbn: string | null;
  publisherName: string;
  salesDate: string;
  size: string;
  coverImageUrl: string | null;
  awards: { name: string; year: number; type: string }[];
  status: string;
  source?: "manual" | "rakuten";
};

export type SearchResponse = {
  items: SearchResult[];
  totalPages: number;
  currentPage: number;
};
