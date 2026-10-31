"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "../ui";
import { NAV_ITEMS, activeChild, isActive } from "./nav";

function Links({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="주 메뉴" className="flex gap-0.5 overflow-x-auto px-2 py-2 md:flex-1 md:flex-col md:overflow-y-auto">
      {NAV_ITEMS.map((item) => {
        const active = pathname !== null && isActive(item, pathname);
        const child = pathname !== null ? activeChild(item, pathname) : undefined;
        return (
          <div key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={active && !item.children ? "page" : undefined}
              className={cx(
                "flex h-8 items-center rounded-sm px-2.5 text-[13px]",
                active ? "font-semibold text-neutral-900" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
                active && !item.children && "bg-white ring-1 ring-neutral-200",
              )}
            >
              {item.label}
            </Link>
            {item.children && (
              <ul className={cx("ml-2.5 border-l border-neutral-200 pl-2", active ? "hidden md:block" : "hidden")}>
                {item.children.map((c) => {
                  const on = child?.href === c.href;
                  return (
                    <li key={c.href}>
                      <Link
                        href={c.href}
                        aria-current={on ? "page" : undefined}
                        className={cx(
                          "flex h-7 items-center rounded-sm px-2 text-[12.5px]",
                          on ? "bg-white font-medium text-neutral-900 ring-1 ring-neutral-200" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
                        )}
                      >
                        {c.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
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
