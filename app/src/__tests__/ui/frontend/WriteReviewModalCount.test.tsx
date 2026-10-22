import { fireEvent, render, screen } from "@testing-library/react";
import { WriteReviewModal } from "@/app/my-reviews/_components/WriteReviewModal";
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
beforeEach(() => { global.fetch = jest.fn(); });
test("count lookup failure shows an error instead of zero or an empty success", async () => {
  jest.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: "unavailable" }) } as Response);
  render(<WriteReviewModal />); fireEvent.click(screen.getByRole("button", { name: "感想を書く" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("本の一覧を取得できませんでした");
  expect(screen.queryByText("該当する本が見つかりませんでした")).not.toBeInTheDocument();
  expect(screen.queryByText("公開レビュー 0件")).not.toBeInTheDocument();
});
