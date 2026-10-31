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
          {/* 데스크톱 헤더 높이는 4rem(h-16)으로 고정. 거래방이 이 값을 빼고 화면 높이를 채운다. */}
          <header className="bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:h-16 md:py-0 md:px-6">
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
          <main className="px-4 py-6 md:px-6">{children}</main>
        </RoleProvider>
      </body>
    </html>
  );
}
