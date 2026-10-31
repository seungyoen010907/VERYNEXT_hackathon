// 계약 단계 목록 + 단계별 체크리스트 템플릿 + 자료 발급처 안내.
// 거래방을 만들 때 CHECKLIST_TEMPLATE을 checklist_items에 넣고, guide는 DB가 아니라 여기서 붙인다.

import type { ChecklistItem, Role, RoadmapStep, StageKey } from "./types";

export const STAGES: { key: StageKey; title: string }[] = [
  { key: "consent", title: "자료 공개 동의" },
  { key: "documents", title: "자료 제출" },
  { key: "verify", title: "매출 검증" },
  { key: "terms", title: "조건 합의" },
  { key: "contract", title: "권리금 계약" },
  { key: "lease", title: "임대차 계약" },
  { key: "closing", title: "잔금·신고" },
  { key: "handover", title: "인수인계" },
];

export type ChecklistTemplateItem = {
  stage: StageKey;
  role: Role;
  key: string;
  title: string;
  guide: string | null;
  upload?: boolean; // 파일을 올려서 끝내는 자료 항목
  confirm?: boolean; // 상대 역할이 '확인 완료'로 받아주는 항목 (인수인계)
};

export const CHECKLIST_TEMPLATE: ChecklistTemplateItem[] = [
  // 1. 자료 공개 동의
  {
    stage: "consent",
    role: "seller",
    key: "seller_consent",
    title: "매출 자료 공개·AI 분석 동의",
    guide: "동의하면 양수인이 올린 자료를 볼 수 있고 AI가 매출을 판독해요. 동의는 언제든 철회할 수 있어요.",
  },

  // 2. 자료 제출
  {
    stage: "documents",
    role: "seller",
    key: "card_sales",
    title: "카드매출 내역 (최근 6~12개월)",
    upload: true,
    guide: "여신금융협회 카드매출조회 사이트(cardsales.or.kr)에 가맹점으로 로그인 → 매출거래정보 통합조회에서 월별 매출을 엑셀로 내려받아요.",
  },
  {
    stage: "documents",
    role: "seller",
    key: "delivery_sales",
    title: "배달앱 정산 내역",
    upload: true,
    guide: "사용 중인 배달앱 사장님 사이트에 로그인 → 정산 내역에서 기간을 정해 엑셀이나 CSV로 내려받아요. 앱이 여러 개면 모두 올려요.",
  },
  {
    stage: "documents",
    role: "seller",
    key: "pos_report",
    title: "POS 월별 매출 리포트",
    upload: true,
    guide: "POS 관리자 화면(또는 POS사 웹사이트)의 매출 리포트에서 월별 매출 화면을 내려받거나 캡처해요. 현금 매출이 포함된 자료예요.",
  },
  {
    stage: "documents",
    role: "seller",
    key: "vat_return",
    title: "부가가치세 신고서",
    upload: true,
    guide: "홈택스 로그인 → 부가가치세 신고내역 조회에서 최근 신고서를 PDF로 출력해요. 국세청에 신고한 매출이라 가장 믿을 만한 기준이에요.",
  },
  {
    stage: "documents",
    role: "buyer",
    key: "building_registry",
    title: "건물 등기부등본 확인",
    guide: "대법원 인터넷등기소(iros.go.kr)에서 점포 주소로 열람해요. 건물주(임대인)가 누구인지, 근저당·압류가 있는지 봐요.",
  },
  {
    stage: "documents",
    role: "buyer",
    key: "building_ledger",
    title: "건축물대장 확인",
    guide: "정부24에서 건축물대장을 발급해요. 점포 용도가 음식점 영업이 가능한 용도인지, 위반건축물 표시가 없는지 봐요.",
  },

  // 3. 매출 검증
  {
    stage: "verify",
    role: "buyer",
    key: "review_report",
    title: "검증 리포트 확인",
    guide: "자료가 모두 올라오면 검증 리포트가 만들어져요. '확인 필요' 항목은 양도인에게 소명을 요청해요.",
  },

  // 4. 조건 합의
  {
    stage: "terms",
    role: "buyer",
    key: "agree_terms_buyer",
    title: "권리금·넘겨받는 시설·인수 날짜 합의",
    guide: "검증 결과를 근거로 권리금을 협상하고, 넘겨받을 시설과 인수 날짜를 정해요.",
  },
  {
    stage: "terms",
    role: "seller",
    key: "agree_terms_seller",
    title: "권리금·넘겨받는 시설·인수 날짜 합의",
    guide: "양수인과 조건을 정하고, 넘길 시설 목록을 확정해요.",
  },

  // 5. 권리금 계약
  {
    stage: "contract",
    role: "buyer",
    key: "premium_contract_buyer",
    title: "권리금 계약서 확인",
    guide: "국토교통부 표준권리금계약서 양식에 합의 조건을 넣어 확인해요. 법률 판단이 필요하면 전문가 검토를 받아요.",
  },
  {
    stage: "contract",
    role: "seller",
    key: "premium_contract_seller",
    title: "권리금 계약서 확인",
    guide: "국토교통부 표준권리금계약서 양식에 합의 조건을 넣어 확인해요.",
  },

  // 6. 임대차 계약
  {
    stage: "lease",
    role: "seller",
    key: "landlord_notice",
    title: "임대인에게 양도 사실 알리기",
    guide: "새 임차인(양수인)을 임대인에게 소개하고 새 임대차계약 의사를 확인해요.",
  },
  {
    stage: "lease",
    role: "buyer",
    key: "new_lease",
    title: "임대인과 새 임대차계약",
    guide: "임대차계약은 공인중개사가 진행해요. 보증금·월세·계약 기간이 기존 조건과 같은지 확인해요.",
  },

  // 7. 잔금·신고
  {
    stage: "closing",
    role: "buyer",
    key: "balance_payment",
    title: "권리금 잔금 지급",
    guide: "계약서에 적은 날짜에 잔금을 보내고, 영수증이나 이체 기록을 거래방에 남겨요.",
  },
  {
    stage: "closing",
    role: "buyer",
    key: "status_succession",
    title: "영업자 지위승계 신고",
    guide: "점포 관할 시·군·구청 위생 담당 부서나 정부24에서 신고해요. 양수한 날부터 1개월 안에 해야 해요.",
  },
  {
    stage: "closing",
    role: "buyer",
    key: "business_registration",
    title: "사업자등록",
    guide: "홈택스에서 신청해요. 사업을 시작한 날부터 20일 안에 해야 해요.",
  },
  {
    stage: "closing",
    role: "seller",
    key: "closure_report",
    title: "폐업 신고",
    guide: "홈택스에서 폐업 신고를 해요. 마지막 부가세 신고도 잊지 마세요.",
  },

  // 8. 인수인계 (양도인이 넘기고 → 양수인이 확인)
  {
    stage: "handover",
    role: "seller",
    key: "pos_delivery_accounts",
    title: "POS·배달앱 계정 넘기기",
    confirm: true,
    guide: "POS와 배달앱 계정 명의 변경 방법은 각 회사 고객센터에 문의해요.",
  },
  {
    stage: "handover",
    role: "seller",
    key: "utilities",
    title: "공과금 명의 변경 (전기·가스·수도)",
    confirm: true,
    guide: "한국전력, 도시가스사, 관할 수도사업소에 명의 변경을 신청해요.",
  },
  {
    stage: "handover",
    role: "seller",
    key: "suppliers_recipes",
    title: "거래처 목록·레시피 넘기기",
    confirm: true,
    guide: "식자재 거래처 연락처와 결제 조건, 메뉴 레시피를 정리해서 넘겨요.",
  },
];

export function stageTitle(key: StageKey): string {
  return STAGES.find((s) => s.key === key)?.title ?? key;
}

export function getRoadmap(current: StageKey): RoadmapStep[] {
  const currentIndex = STAGES.findIndex((s) => s.key === current);
  return STAGES.map((s, i) => ({
    key: s.key,
    title: s.title,
    status: i < currentIndex ? "done" : i === currentIndex ? "current" : "todo",
  }));
}

export function templateFor(key: string): ChecklistTemplateItem | undefined {
  return CHECKLIST_TEMPLATE.find((t) => t.key === key);
}

// 템플릿 -> 체크리스트 항목 (Step 3에서는 DB가 id와 status를 준다)
export function buildChecklist(): Omit<ChecklistItem, "id">[] {
  return CHECKLIST_TEMPLATE.map((t, i) => ({
    stage: t.stage,
    role: t.role,
    key: t.key,
    title: t.title,
    status: "todo",
    sort: i,
    guide: t.guide,
  }));
}
