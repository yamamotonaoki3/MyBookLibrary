import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MaskedEmail, REVEAL_VISIBLE_MS } from "@/app/admin/_components/MaskedEmail";

const adminFetch = jest.fn();
jest.mock("@/lib/adminFetch", () => ({ useAdminFetch: () => adminFetch }));

const target = { kind: "user", id: 7 } as const;
const revealOk = (email: string) => ({ ok: true, status: 200, json: async () => ({ email }) });

beforeEach(() => adminFetch.mockReset());

function setup() {
  return render(<MaskedEmail masked="de***@e***.com" target={target} />);
}

describe("MaskedEmail", () => {
  it("最初はマスクだけを表示し、API は呼ばない", () => {
    setup();
    expect(screen.getByTestId("masked-email").textContent).toBe("de***@e***.com");
    expect(adminFetch).not.toHaveBeenCalled();
  });

  it("「表示」を押すと API から全体を取得して表示し、「隠す」でマスクに戻る", async () => {
    adminFetch.mockResolvedValue(revealOk("demo_mio@example.com"));
    setup();

    fireEvent.click(screen.getByRole("button", { name: "表示" }));
    await waitFor(() => expect(screen.getByTestId("masked-email").textContent).toBe("demo_mio@example.com"));
    expect(adminFetch).toHaveBeenCalledWith(
      "/api/admin/email-reveal",
      expect.objectContaining({ method: "POST", body: JSON.stringify(target) })
    );

    fireEvent.click(screen.getByRole("button", { name: "隠す" }));
    expect(screen.getByTestId("masked-email").textContent).toBe("de***@e***.com");
  });

  it("一定時間が過ぎると、自動でマスクに戻る", async () => {
    jest.useFakeTimers();
    try {
      adminFetch.mockResolvedValue(revealOk("demo_mio@example.com"));
      setup();
      fireEvent.click(screen.getByRole("button", { name: "表示" }));
      await act(async () => {});
      expect(screen.getByTestId("masked-email").textContent).toBe("demo_mio@example.com");

      act(() => {
        jest.advanceTimersByTime(REVEAL_VISIBLE_MS);
      });
      expect(screen.getByTestId("masked-email").textContent).toBe("de***@e***.com");
    } finally {
      jest.useRealTimers();
    }
  });

  it("取得に失敗したら、マスクのままエラーを表示する", async () => {
    adminFetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: "短時間に表示しすぎです。" }) });
    setup();
    fireEvent.click(screen.getByRole("button", { name: "表示" }));
    await waitFor(() => expect(screen.getByText("短時間に表示しすぎです。")).toBeTruthy());
    expect(screen.getByTestId("masked-email").textContent).toBe("de***@e***.com");
  });
});
