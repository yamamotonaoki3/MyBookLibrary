import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LibraryAvailabilityButton from "@/components/ui/LibraryAvailabilityButton";

describe("貸出チェック", () => {
  afterEach(() => jest.restoreAllMocks());

  it("共通ボタンから本の全版をモーダルに表示する", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: { "9784101010014": [], "9784000000001": [] } }) });
    render(<LibraryAvailabilityButton bookId={42} bookTitle="[E2E_TEST] 本" />);
    fireEvent.click(screen.getByRole("button", { name: "貸出チェック" }));
    expect(await screen.findByText("ISBN: 9784101010014")).toBeVisible();
    expect(screen.getByText("ISBN: 9784000000001")).toBeVisible();
    expect(global.fetch).toHaveBeenCalledWith("/api/calil/check-book?bookId=42");
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(screen.queryByText("版ごとの在庫状況")).not.toBeInTheDocument());
  });

  it("本IDがない検索結果はISBNで共通APIを呼ぶ", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: { "9784101010014": [] } }) });
    render(<LibraryAvailabilityButton isbn="9784101010014" bookTitle="[E2E_TEST] 未登録" />);
    fireEvent.click(screen.getByRole("button", { name: "貸出チェック" }));
    expect(await screen.findByText("ISBN: 9784101010014")).toBeVisible();
    expect(global.fetch).toHaveBeenCalledWith("/api/calil/check-book?isbn=9784101010014");
  });

  it("失敗後も閉じて再確認できる", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    render(<LibraryAvailabilityButton bookId={42} bookTitle="[E2E_TEST] 本" />);
    fireEvent.click(screen.getByRole("button", { name: "貸出チェック" }));
    expect(await screen.findByText("確認に失敗しました")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    fireEvent.click(screen.getByRole("button", { name: "貸出チェック" }));
    expect(await screen.findByText("確認に失敗しました")).toBeVisible();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
