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

export type FavoriteAuthorItem = {
  id: number;
  authorId: number;
  authorName: string;
  bookCount: number;
  notify: boolean;
};
