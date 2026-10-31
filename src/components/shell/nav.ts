export interface NavChild {
  label: string;
  href: string;
  match: string[];
}

export interface NavItem {
  label: string;
  href: string;
  /** 이 경로로 시작하면 활성 표시 */
  match: string[];
  children?: NavChild[];
}

/**
 * 상위 메뉴는 4개로 유지한다. 세부 기능은 하위 메뉴와 매물·거래 화면의 탭으로 들어간다.
 * 기존 화면(실사 현황, 자료 제출 현황, 보고서, 데이터 비교, 분석별 목록)은 거래 관리 아래에서 계속 접근할 수 있다.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "대시보드", href: "/", match: ["/"] },
  {
    label: "매물 둘러보기",
    href: "/listings",
    match: ["/listings", "/stores"],
    children: [
      { label: "매물 검색", href: "/listings", match: ["/listings"] },
      { label: "내 매물", href: "/stores", match: ["/stores"] },
      { label: "매물 등록", href: "/stores/new", match: ["/stores/new"] },
    ],
  },
  {
    label: "거래 관리",
    href: "/deals",
    match: ["/deals", "/diligence", "/documents", "/reports", "/compare", "/revenue", "/profit", "/premium", "/risk"],
    children: [
      { label: "거래 및 대화", href: "/deals", match: ["/deals"] },
      { label: "실사 현황", href: "/diligence", match: ["/diligence", "/revenue", "/profit", "/premium", "/risk"] },
      { label: "자료 제출 현황", href: "/documents", match: ["/documents"] },
      { label: "실사 보고서", href: "/reports", match: ["/reports"] },
      { label: "매물 비교", href: "/compare", match: ["/compare"] },
    ],
  },
  { label: "내 계정", href: "/account", match: ["/account"] },
];

function matches(match: string[], pathname: string): boolean {
  return match.some((m) => (m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(`${m}/`)));
}

export function isActive(item: { match: string[] }, pathname: string): boolean {
  return matches(item.match, pathname);
}

/** 하위 메뉴 중 가장 구체적으로 일치하는 항목 (예: /stores/new는 '내 매물'이 아니라 '매물 등록') */
export function activeChild(item: NavItem, pathname: string): NavChild | undefined {
  const hits = (item.children ?? []).filter((c) => matches(c.match, pathname));
  return hits.sort((a, b) => Math.max(...b.match.filter((m) => matches([m], pathname)).map((m) => m.length)) - Math.max(...a.match.filter((m) => matches([m], pathname)).map((m) => m.length)))[0];
}

const EXTRA_TITLES: Array<[RegExp, string]> = [
  [/^\/stores\/new$/, "매물 등록"],
  [/^\/stores\/[^/]+\/edit$/, "매물 수정"],
  [/^\/stores\/[^/]+$/, "내 매물 관리"],
  [/^\/stores$/, "내 매물"],
  [/^\/listings\/[^/]+$/, "매물 상세"],
  [/^\/listings$/, "매물 둘러보기"],
  [/^\/deals\/[^/]+\/report$/, "거래 실사 보고서"],
  [/^\/deals\/[^/]+$/, "거래 워크스페이스"],
  [/^\/deals$/, "거래 및 대화"],
  [/^\/diligence$/, "실사 현황"],
  [/^\/(revenue|profit|premium|risk)$/, "실사 현황"],
  [/^\/documents$/, "자료 제출 현황"],
  [/^\/reports/, "실사 보고서"],
  [/^\/compare$/, "매물 비교"],
  [/^\/dev\/schema$/, "개발 현황"],
];

export function pageTitle(pathname: string): string {
  for (const [re, title] of EXTRA_TITLES) if (re.test(pathname)) return title;
  return NAV_ITEMS.find((i) => isActive(i, pathname))?.label ?? "";
}
