import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 점포 양도양수 실사 에이전트",
  description: "점포 양도양수 매출·수익성·권리금·위험도를 검증하는 AI 실사 플랫폼",
};

// 사이드바 메뉴. href가 없는 항목은 아직 구현 전이라 링크를 걸지 않는다.
const NAV_ITEMS: Array<{ label: string; href?: string; step: number }> = [
  { label: "개발 현황", href: "/", step: 3 },
  { label: "대시보드", step: 11 },
  { label: "매물 관리", step: 4 },
  { label: "매물 등록", step: 4 },
  { label: "문서 업로드", step: 5 },
  { label: "매출 분석", step: 6 },
  { label: "수익성 분석", step: 7 },
  { label: "권리금 분석", step: 8 },
  { label: "위험도 분석", step: 9 },
  { label: "종합 보고서", step: 10 },
  { label: "AI 상담", step: 12 },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-white text-neutral-900">
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="border-b border-neutral-200 md:w-56 md:shrink-0 md:border-b-0 md:border-r">
            <div className="px-4 py-4">
              <p className="text-sm font-semibold">AI 실사 에이전트</p>
              <p className="text-xs text-neutral-500">점포 양도양수 검증</p>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:overflow-visible">
              {NAV_ITEMS.map((item) =>
                item.href ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="whitespace-nowrap rounded px-2 py-1.5 text-sm font-medium hover:bg-neutral-100"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    key={item.label}
                    className="flex items-center justify-between whitespace-nowrap rounded px-2 py-1.5 text-sm text-neutral-400"
                    title={`STEP ${item.step}에서 구현 예정`}
                  >
                    {item.label}
                    <span className="ml-2 text-[10px]">S{item.step}</span>
                  </span>
                ),
              )}
            </nav>
          </aside>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
