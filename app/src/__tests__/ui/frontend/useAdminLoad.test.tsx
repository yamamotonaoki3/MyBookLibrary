import { act, renderHook } from "@testing-library/react";
import { useAdminLoad } from "@/app/admin/_components/useAdminLoad";

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe("useAdminLoad", () => {
  it("成功したときだけ、データを反映する", async () => {
    const fetcher = jest.fn().mockResolvedValue(json(200, [1, 2]));
    const apply = jest.fn();
    const { result } = renderHook(() => useAdminLoad(fetcher));

    await act(() => result.current.load("/api/admin/users", "ユーザー", apply));

    expect(apply).toHaveBeenCalledWith([1, 2]);
    expect(result.current.failedLoads).toEqual([]);
  });

  it("HTTP エラー（500 の { error }）は、データに反映せず、失敗として覚える", async () => {
    const fetcher = jest.fn().mockResolvedValue(json(500, { error: "サーバーエラーが発生しました。" }));
    const apply = jest.fn();
    const { result } = renderHook(() => useAdminLoad(fetcher));

    await act(() => result.current.load("/api/admin/award-entries", "受賞登録", apply));

    expect(apply).not.toHaveBeenCalled();
    expect(result.current.failedLoads).toEqual(["受賞登録"]);
  });

  it("通信の失敗（fetch の reject）も、失敗として覚える", async () => {
    const fetcher = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const apply = jest.fn();
    const { result } = renderHook(() => useAdminLoad(fetcher));

    await act(() => result.current.load("/api/admin/users", "ユーザー", apply));

    expect(apply).not.toHaveBeenCalled();
    expect(result.current.failedLoads).toEqual(["ユーザー"]);
  });

  it("JSON の解析に失敗しても、失敗として覚える（成功の扱いにしない）", async () => {
    const broken = { ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token"); } } as unknown as Response;
    const fetcher = jest.fn().mockResolvedValue(broken);
    const apply = jest.fn();
    const { result } = renderHook(() => useAdminLoad(fetcher));

    await act(() => result.current.load("/api/admin/users", "ユーザー", apply));

    expect(apply).not.toHaveBeenCalled();
    expect(result.current.failedLoads).toEqual(["ユーザー"]);
  });

  it("同じ読み込みが再び成功すれば、失敗の表示は消える。複数の失敗は重複せず覚える", async () => {
    const fetcher = jest.fn().mockResolvedValue(json(500, {}));
    const { result } = renderHook(() => useAdminLoad(fetcher));

    await act(async () => {
      await result.current.load("/a", "受賞登録", jest.fn());
      await result.current.load("/a", "受賞登録", jest.fn());
      await result.current.load("/b", "ユーザー", jest.fn());
    });
    expect(result.current.failedLoads).toEqual(["受賞登録", "ユーザー"]);

    fetcher.mockResolvedValue(json(200, []));
    await act(() => result.current.load("/a", "受賞登録", jest.fn()));
    expect(result.current.failedLoads).toEqual(["ユーザー"]);
  });
});
