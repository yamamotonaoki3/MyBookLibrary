import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "./_components/Sidebar";
import { BottomNav } from "./_components/BottomNav";
import { Header } from "./_components/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MyBookLibrary",
  description: "本の管理・記録アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-screen bg-gray-50 lg:h-screen lg:overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex flex-1 flex-col overflow-hidden pb-16 pt-10 lg:pb-0 lg:pt-0">
            <div className="mx-auto w-full max-w-5xl">
              {children}
            </div>
          </main>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
