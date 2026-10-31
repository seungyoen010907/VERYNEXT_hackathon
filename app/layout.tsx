import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import MainNav from "@/components/MainNav";
import RoleSwitch, { RoleProvider } from "@/components/RoleSwitch";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "AI 점포 양도양수 에이전트",
  description: "점포를 넘기고 인수할 때, AI가 매출 자료를 먼저 확인해 드려요",
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
                <p className="font-bold">AI 점포 양도양수 에이전트</p>
                <p className="text-xs text-muted">매출 자료는 AI가 먼저 확인해요</p>
              </Link>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 whitespace-nowrap">
                {/* 주소(usePathname)를 읽는 메뉴라 <Suspense>로 감싼다 (cacheComponents 규칙) */}
                <Suspense fallback={<span className="w-64" />}>
                  <MainNav />
                </Suspense>
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
