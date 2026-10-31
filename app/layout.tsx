import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import Link from "next/link";
import RoleSwitch, { RoleProvider } from "@/components/RoleSwitch";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "점포 양도양수 에이전트",
  description: "양도인 매출 자료를 검증하고 계약 절차를 안내하는 거래방",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <RoleProvider>
          <header className="border-b border-border bg-card">
            <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-3">
              <Link href="/" className="min-w-0">
                <p className="font-bold">점포 양도양수 에이전트</p>
                <p className="text-xs text-muted">매출 검증부터 계약까지 한 거래방에서</p>
              </Link>
              <div className="flex items-center gap-3">
                <Link href="/deals" className="text-sm text-muted hover:text-text">
                  내 거래방 목록
                </Link>
                <RoleSwitch />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
        </RoleProvider>
      </body>
    </html>
  );
}
