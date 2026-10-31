export interface NavItem {
  label: string;
  href: string;
  /** 이 경로로 시작하면 활성 표시 */
  match: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "대시보드", href: "/", match: ["/"] },
  { label: "매물 관리", href: "/stores", match: ["/stores"] },
  { label: "실사 관리", href: "/diligence", match: ["/diligence"] },
  { label: "증빙 자료", href: "/documents", match: ["/documents"] },
  { label: "매출 검증", href: "/revenue", match: ["/revenue"] },
  { label: "수익성 분석", href: "/profit", match: ["/profit"] },
  { label: "권리금 분석", href: "/premium", match: ["/premium"] },
  { label: "위험도 분석", href: "/risk", match: ["/risk"] },
  { label: "데이터 비교", href: "/compare", match: ["/compare"] },
  { label: "실사 보고서", href: "/reports", match: ["/reports"] },
];

export function isActive(item: NavItem, pathname: string): boolean {
  return item.match.some((m) => (m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(`${m}/`)));
}

const EXTRA_TITLES: Array<[RegExp, string]> = [
  [/^\/stores\/new$/, "매물 등록"],
  [/^\/stores\/[^/]+\/edit$/, "매물 수정"],
  [/^\/stores\/[^/]+$/, "매물 상세"],
  [/^\/dev\/schema$/, "개발 현황"],
];

export function pageTitle(pathname: string): string {
  for (const [re, title] of EXTRA_TITLES) if (re.test(pathname)) return title;
  return NAV_ITEMS.find((i) => isActive(i, pathname))?.label ?? "";
}
