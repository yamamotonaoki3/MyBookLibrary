import { render } from "@testing-library/react";
import { Providers } from "@/app/_components/Providers";

const useSession = jest.fn();
const usePathname = jest.fn();
const replace = jest.fn();

jest.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSession: () => useSession(),
}));
jest.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
  useRouter: () => ({ replace }),
}));

const authenticatedMustChange = { status: "authenticated", data: { user: { mustChangePassword: true } } };

describe("パスワード変更の強制リダイレクトと、ログイン画面（ブラウザを閉じたあとの古いトークン。#782）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePathname.mockReturnValue("/login");
  });

  it("パスワード変更が必要でも、ログイン画面では変更画面へ移さない（ログイン画面に戻れなくなるのを防ぐ）", () => {
    useSession.mockReturnValue(authenticatedMustChange);
    render(<Providers>x</Providers>);
    expect(replace).not.toHaveBeenCalled();
  });

  it.each(["/register", "/forgot-password"])("パスワード変更が必要でも、公開認証画面 %s では変更画面へ移さない", (pathname) => {
    usePathname.mockReturnValue(pathname);
    useSession.mockReturnValue(authenticatedMustChange);
    render(<Providers>x</Providers>);
    expect(replace).not.toHaveBeenCalled();
  });

  it("公開認証画面以外では、パスワード変更が必要なら変更画面へ移す（従来どおり）", () => {
    usePathname.mockReturnValue("/books");
    useSession.mockReturnValue(authenticatedMustChange);
    render(<Providers>x</Providers>);
    expect(replace).toHaveBeenCalledWith("/settings/change-password");
  });
});
