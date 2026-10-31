import Link from "next/link";
import { cx } from "./ui";

const ITEMS = [
  { href: "/diligence", label: "진행 현황" },
  { href: "/revenue", label: "매출 검증" },
  { href: "/profit", label: "수익성" },
  { href: "/premium", label: "권리금" },
  { href: "/risk", label: "위험도" },
];

/** 실사 현황 하위 탭: 내 매물과 거래 중인 매물의 분석 결과를 한 화면 안에서 전환한다 */
export function DiligenceSubnav({ active }: { active: string }) {
  return (
    <nav className="flex flex-wrap gap-1 rounded-sm border border-neutral-200 bg-white p-1" aria-label="실사 현황 하위 탭">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} className={cx("rounded-sm px-3 py-1.5 text-[13px]", active === i.href ? "bg-neutral-900 font-medium text-white" : "text-neutral-600 hover:bg-neutral-100")}>
          {i.label}
        </Link>
      ))}
      <span className="ml-auto self-center px-2 text-[11px] text-neutral-500">내 매물 + 양수인으로 거래 중인 매물</span>
    </nav>
  );
}
