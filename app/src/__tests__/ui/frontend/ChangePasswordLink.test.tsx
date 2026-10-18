import { render, screen } from "@testing-library/react";
import { ChangePasswordLink } from "@/app/settings/_components/ChangePasswordLink";

describe("ChangePasswordLink", () => {
  it("パスワード変更画面へのリンクを表示する", () => {
    render(<ChangePasswordLink />);
    const link = screen.getByRole("link", { name: "パスワードを変更する" });
    expect(link.getAttribute("href")).toBe("/settings/change-password");
  });
});
