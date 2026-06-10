"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { Header } from "./Header";

const AUTH_PATHS = ["/login", "/register"];

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.includes(pathname);

  if (isAuthPage) {
    return (
      <div className="fixed inset-0 overflow-y-auto bg-gray-50">
        <div className="flex min-h-full items-center justify-center p-4">
          {children}
        </div>
      </div>
    );
  }

  return (
    <>
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex flex-1 flex-col pb-16 pt-14 lg:overflow-hidden lg:pb-0 lg:pt-0">
          <div className="mx-auto flex w-full max-w-5xl flex-col lg:flex-1 lg:overflow-hidden">
            {children}
          </div>
        </main>
      </div>
      <BottomNav />
    </>
  );
}
