import { render, screen } from "@testing-library/react";
import { BookReviewCount } from "@/frontend/books/BookReviewCount";
test.each([0, 2, 1234])("shows the public count including zero: %i", count => {
  render(<BookReviewCount count={count} />);
  expect(screen.getByText(`公開レビュー ${count}件`)).toBeVisible();
});
