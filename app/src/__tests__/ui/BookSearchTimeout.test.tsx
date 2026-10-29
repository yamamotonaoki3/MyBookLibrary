import { act, fireEvent, render, screen } from "@testing-library/react";
import BookSearchPage from "@/app/books/search/page";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams("q=test&type=title"),
}));
jest.mock("@/app/books/search/_components/BarcodeScannerModal", () => () => null);
jest.mock("@/app/books/search/_components/ManualBookRegisterModal", () => () => null);
const message = "検索に時間がかかっています。もう一度お試しください。";
const response = (title: string) => ({ ok: true, json: async () => ({ items: [{
  title, author: "test author", isbn: null, awards: [], publicReviewCount: 0,
  status: "unread", coverImageUrl: null, publisherName: "", salesDate: "",
}], totalPages: 1, currentPage: 1 }) });
beforeEach(() => { jest.useFakeTimers(); jest.spyOn(globalThis, "clearTimeout"); });
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
it("stalled fetch stops loading, retries successfully, and ignores its late response", async () => {
  let release!: (value: unknown) => void;
  global.fetch = jest.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
    .mockResolvedValueOnce(response("new result"));
  render(<BookSearchPage />);
  await act(async () => { await jest.advanceTimersByTimeAsync(15000); });
  expect(screen.queryByText("検索中…")).not.toBeInTheDocument();
  expect(screen.getByText(message)).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "再試行" })); });
  expect(screen.getByText("new result")).toBeInTheDocument();
  await act(async () => { release(response("old result")); });
  expect(screen.queryByText("old result")).not.toBeInTheDocument();
  expect(clearTimeout).toHaveBeenCalled();
});
it("504 shows the same timeout message and retry", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 504,
    json: async () => ({ code: "SEARCH_TIMEOUT", error: "server timeout" }) });
  await act(async () => { render(<BookSearchPage />); });
  expect(screen.getByText(message)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
  expect(clearTimeout).toHaveBeenCalled();
});

it("additional page timeout keeps results and offers a forced retry", async () => {
  let intersect!: IntersectionObserverCallback;
  const originalObserver = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = jest.fn().mockImplementation((callback) => {
    intersect = callback;
    return { observe: jest.fn(), disconnect: jest.fn() };
  });
  const first = response("first page");
  global.fetch = jest.fn().mockResolvedValueOnce({ ...first,
    json: async () => ({ ...await first.json(), totalPages: 2 }),
  }).mockImplementationOnce(() => new Promise(() => {}))
    .mockResolvedValueOnce(response("second page"));
  try {
    await act(async () => { render(<BookSearchPage />); });
    await act(async () => {
      intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      await jest.advanceTimersByTimeAsync(15600);
    });
    expect(screen.queryByText("読み込み中...")).not.toBeInTheDocument();
    expect(screen.getByText("first page")).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "再試行" })); });
    expect(screen.getByText("second page")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining("page=2"), expect.anything());
  } finally {
    globalThis.IntersectionObserver = originalObserver;
  }
});
