import { canChangeOwnPassword } from "@/lib/accountPolicy";

describe("canChangeOwnPassword", () => {
  it("パスワードでログインしていて、デモ環境でなければ、変更できる", () => {
    expect(canChangeOwnPassword({ hasPasswordLogin: true, demoMode: false })).toBe(true);
  });

  it("Google ログインだけ（パスワードなし）なら、変更できない", () => {
    expect(canChangeOwnPassword({ hasPasswordLogin: false, demoMode: false })).toBe(false);
  });

  it("デモ環境では、変更できない", () => {
    expect(canChangeOwnPassword({ hasPasswordLogin: true, demoMode: true })).toBe(false);
  });

  it("パスワードなしで、デモ環境でも、変更できない", () => {
    expect(canChangeOwnPassword({ hasPasswordLogin: false, demoMode: true })).toBe(false);
  });
});
