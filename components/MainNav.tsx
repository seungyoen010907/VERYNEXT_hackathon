"use client";

// 역할별 메뉴 (docs/DESIGN.md 10.2). 지금 역할에 필요 없는 메뉴는 보이지 않는다.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRole } from "@/components/RoleSwitch";

const MENUS = {
  buyer: [
    { href: "/", label: "홈" },
    { href: "/listings", label: "매물 찾기" },
    { href: "/diligence", label: "AI 실사" },
    { href: "/compare", label: "비교" },
    { href: "/deals", label: "거래방" },
  ],
  seller: [
    { href: "/", label: "홈" },
    { href: "/listings", label: "내 매물" },
    { href: "/requests", label: "요청함" },
    { href: "/deals", label: "거래방" },
  ],
};

export default function MainNav() {
  const role = useRole();
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <nav className="flex items-center gap-1" aria-label="주 메뉴">
      {MENUS[role].map((m) => (
        <Link
          key={m.href}
          href={m.href}
          aria-current={active(m.href) ? "page" : undefined}
          className={"relative rounded-lg px-2.5 py-1.5 text-sm transition-colors " + (active(m.href) ? "font-medium text-text" : "text-muted hover:text-text")}
        >
          {m.label}
          {active(m.href) && <span className="viz-grow-x absolute inset-x-2.5 -bottom-0.5 h-0.5 rounded-full bg-accent" aria-hidden />}
        </Link>
      ))}
    </nav>
  );
}
