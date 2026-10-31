"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "../ui";
import { NAV_ITEMS, isActive } from "./nav";

function Links({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="주 메뉴" className="flex gap-0.5 overflow-x-auto px-2 py-2 md:flex-1 md:flex-col md:overflow-y-auto">
      {NAV_ITEMS.map((item, i) => {
        const active = pathname !== null && isActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex h-8 shrink-0 items-center gap-2.5 rounded-sm px-2.5 text-[13px]",
              active ? "bg-white font-semibold text-neutral-900 ring-1 ring-neutral-200" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
            )}
          >
            <span className={cx("w-4 text-right text-[11px] tabular-nums", active ? "text-neutral-900" : "text-neutral-400")}>{i + 1}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ActiveLinks() {
  return <Links pathname={usePathname()} />;
}

/** pathname을 넘기면(대체 화면) 그대로 그리고, 생략하면 현재 경로를 읽어 활성 메뉴를 표시한다. */
export function NavLinks({ pathname }: { pathname?: string | null }) {
  return pathname === undefined ? <ActiveLinks /> : <Links pathname={pathname} />;
}
