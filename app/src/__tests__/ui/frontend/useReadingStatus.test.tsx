import { act, renderHook, waitFor } from "@testing-library/react";
import { useReadingStatus } from "@/frontend/readingStatus/useReadingStatus";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

type Deferred = { resolve: (res: Partial<Response>) => void };

function mockFetchWithDeferred() {
  const calls: { status: string; deferred: Deferred }[] = [];
  global.fetch = jest.fn((_url: string, init: RequestInit) => {
    return new Promise((resolve) => {
      calls.push({
        status: JSON.parse(init.body as string).status,
        deferred: { resolve: (res) => resolve(res as Response) },
      });
    });
  }) as unknown as typeof fetch;
  return calls;
}

const ok = (bookId = 1) => ({ ok: true, json: async () => ({ bookId }) });
const ng = () => ({ ok: false, json: async () => ({}) });

function setup() {
  return renderHook(() =>
    useReadingStatus({
      initialStatus: "unread",
      initialBookId: null,
      buildBody: () => ({ title: "[TEST] 本", author: "testuser_001" }),
    })
  );
}

beforeEach(() => refresh.mockClear());

describe("useReadingStatus", () => {
  it("楽観的に表示を更新し、保存完了後に bookId を反映して refresh を1回呼ぶ", async () => {
    const calls = mockFetchWithDeferred();
    const { result } = setup();

    act(() => result.current.changeStatus("want_to_read"));
    expect(result.current.status).toBe("want_to_read");
    expect(result.current.busy).toBe(true);

    await act(async () => calls[0].deferred.resolve(ok(42)));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.bookId).toBe(42);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("送信中の連打は直列化し、最後に押した値だけを追加で送る", async () => {
    const calls = mockFetchWithDeferred();
    const { result } = setup();

    act(() => result.current.changeStatus("want_to_read"));
    act(() => result.current.changeStatus("reading"));
    act(() => result.current.changeStatus("read"));
    expect(calls).toHaveLength(1);

    await act(async () => calls[0].deferred.resolve(ok()));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].status).toBe("read");

    await act(async () => calls[1].deferred.resolve(ok()));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.status).toBe("read");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("保存に失敗したら最後に保存できた値へ巻き戻し、エラーを返す", async () => {
    const calls = mockFetchWithDeferred();
    const { result } = setup();

    act(() => result.current.changeStatus("reading"));
    await act(async () => calls[0].deferred.resolve(ng()));
    await waitFor(() => expect(result.current.busy).toBe(false));

    expect(result.current.status).toBe("unread");
    expect(result.current.error).not.toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("通信エラーでも保存中表示が解除される", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network"));
    const { result } = setup();

    act(() => result.current.changeStatus("read"));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.status).toBe("unread");
    expect(result.current.error).not.toBeNull();
  });

  it("次の操作でエラー表示が消える", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(ng()).mockResolvedValue(ok());
    const { result } = setup();

    act(() => result.current.changeStatus("reading"));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    act(() => result.current.changeStatus("read"));
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.status).toBe("read");
  });
});
