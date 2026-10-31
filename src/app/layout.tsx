import type { Metadata } from "next";
import { Header } from "@/components/shell/header";
import { Sidebar } from "@/components/shell/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "점포 실사 플랫폼 | AI 점포 양도양수 실사 에이전트",
  description: "점포 양도양수 매출·수익성·권리금·위험도를 검증하는 실사 플랫폼",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-neutral-100/60 text-neutral-900">
        <div className="flex min-h-screen flex-col md:block">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col md:pl-56">
            <Header />
            <main className="min-w-0 flex-1 px-4 py-5 md:px-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
