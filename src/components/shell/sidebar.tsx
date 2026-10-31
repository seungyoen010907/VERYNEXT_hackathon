import Link from "next/link";
import { Suspense } from "react";
import { NavLinks } from "./nav-links";

/** 왼쪽 고정 사이드바. 메뉴는 먼저 그리고, 현재 위치 표시는 요청 URL을 읽은 뒤 채운다. */
export function Sidebar() {
  return (
    <aside className="app-sidebar flex w-full shrink-0 flex-col border-b border-neutral-200 bg-neutral-50 md:fixed md:inset-y-0 md:left-0 md:w-56 md:border-b-0 md:border-r">
      <div className="flex h-14 items-center border-b border-neutral-200 px-4">
        <Link href="/" className="leading-tight">
          <span className="block text-[13px] font-semibold tracking-tight text-neutral-900">점포 실사 플랫폼</span>
          <span className="block text-[11px] text-neutral-500">양도양수 매출·수익성 검증</span>
        </Link>
      </div>
      <Suspense fallback={<NavLinks pathname={null} />}>
        <NavLinks />
      </Suspense>
      <div className="hidden border-t border-neutral-200 px-4 py-3 text-[11px] text-neutral-500 md:block">
        <Link href="/dev/schema" className="hover:text-neutral-800">
          개발 현황 · DB 스키마
        </Link>
        <p className="mt-1">로컬 DB 모드 (Supabase 미연결)</p>
      </div>
    </aside>
  );
}
