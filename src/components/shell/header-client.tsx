"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../ui";
import { pageTitle } from "./nav";

export function PageTitle() {
  const pathname = usePathname();
  return <h1 className="truncate text-[15px] font-semibold text-neutral-900">{pageTitle(pathname)}</h1>;
}

export function HeaderSearch() {
  const params = useSearchParams();
  const pathname = usePathname();
  const current = pathname === "/stores" ? params.get("q") ?? "" : "";
  return (
    <form action="/stores" role="search" className="hidden sm:block">
      <label className="sr-only" htmlFor="global-search">
        매물 검색
      </label>
      <input
        id="global-search"
        key={current}
        name="q"
        defaultValue={current}
        placeholder="매물명·주소·업종 검색"
        className="h-8 w-64 rounded-sm border border-neutral-300 bg-white px-2.5 text-[13px] placeholder:text-neutral-400 focus:border-blue-700 focus:outline-none"
      />
    </form>
  );
}

/** 헤더 드롭다운 공통 (바깥 클릭·Esc로 닫힘) */
export function Dropdown({ label, badge, children, align = "right" }: { label: ReactNode; badge?: number; children: ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-neutral-300 bg-white px-2.5 text-[13px] text-neutral-700 hover:bg-neutral-50"
      >
        {label}
        {badge !== undefined && badge > 0 && (
          <span className="min-w-4 rounded-sm bg-red-700 px-1 text-center text-[10px] font-semibold leading-4 text-white">{badge}</span>
        )}
      </button>
      {open && (
        <div
          className={cx(
            "absolute z-30 mt-1 w-80 rounded-sm border border-neutral-300 bg-white",
            align === "right" ? "right-0" : "left-0",
          )}
          onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export interface NotificationItem {
  id: string;
  title: string;
  storeName: string;
  href: string;
  at: string;
  kind: "risk" | "request";
}

export function Notifications({ items }: { items: NotificationItem[] }) {
  return (
    <Dropdown label="알림" badge={items.length}>
      <div className="border-b border-neutral-200 px-3 py-2 text-[12px] font-semibold">최근 위험 탐지 · 열린 자료 요청</div>
      {items.length === 0 ? (
        <p className="px-3 py-6 text-center text-[12px] text-neutral-500">새 알림이 없습니다.</p>
      ) : (
        <ul className="max-h-80 overflow-y-auto">
          {items.map((n) => (
            <li key={n.id} className="border-b border-neutral-100 last:border-b-0">
              <Link href={n.href} className="block px-3 py-2 hover:bg-neutral-50">
                <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                  <span className={n.kind === "risk" ? "text-red-700" : "text-amber-700"}>{n.kind === "risk" ? "위험" : "자료 요청"}</span>
                  <span>·</span>
                  <span className="truncate">{n.storeName}</span>
                  <span className="ml-auto whitespace-nowrap">{n.at}</span>
                </span>
                <span className="mt-0.5 block text-[12px] text-neutral-900">{n.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Dropdown>
  );
}

export function UserMenu({ name, role }: { name: string; role: "seller" | "buyer" | "admin" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function switchTo(user: "seller" | "buyer") {
    setPending(true);
    await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user }) });
    setPending(false);
    router.refresh();
  }
  const roleLabel = role === "seller" ? "양도인" : role === "buyer" ? "양수인" : "관리자";
  return (
    <Dropdown label={<span className="max-w-40 truncate">{name}</span>}>
      <div className="border-b border-neutral-200 px-3 py-2">
        <p className="text-[12px] font-semibold text-neutral-900">{name}</p>
        <p className="text-[11px] text-neutral-500">역할: {roleLabel} · 데모 계정 (Supabase Auth 연동 전)</p>
      </div>
      <div className="p-2">
        <p className="px-1 pb-1 text-[11px] text-neutral-500">계정 전환</p>
        {(["seller", "buyer"] as const).map((u) => (
          <button
            key={u}
            type="button"
            disabled={pending || role === u}
            onClick={() => switchTo(u)}
            className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-[12px] hover:bg-neutral-50 disabled:text-neutral-400"
          >
            {u === "seller" ? "양도인 (매물 소유자)" : "양수인 (인수 검토자)"}
            {role === u && <span className="text-[11px]">사용 중</span>}
          </button>
        ))}
      </div>
    </Dropdown>
  );
}
