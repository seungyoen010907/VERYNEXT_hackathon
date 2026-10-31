/**
 * 누락 자료 자동 체크리스트
 *
 * 업종에 따라 필요한 증빙 자료 목록을 만들고, 업로드된 문서와 정규화된 데이터를 대조해
 * 항목별 제출 상태를 계산한다. 체크리스트 상태는 저장하지 않고 매번 계산한다.
 */
import type { DocumentStatus, DocumentType, ExpenseCategory, NormalizedPayload } from "@/types/domain";

export type ChecklistState = "complete" | "submitted" | "failed" | "missing";

export interface ChecklistItemDef {
  key: string;
  label: string;
  documentType: DocumentType;
  /** 비용 자료 항목이면 확인해야 하는 비용 항목 */
  expenseCategories?: ExpenseCategory[];
  required: boolean;
  reason: string;
  /** 자료가 없으면 확인할 수 없는 분석 */
  blockedAnalyses: string[];
  /** 요청 문구에 쓰는 자료 설명 */
  requestText: string;
}

export interface ChecklistItem extends ChecklistItemDef {
  state: ChecklistState;
  documentIds: string[];
  note: string | null;
}

export interface Checklist {
  items: ChecklistItem[];
  requiredCount: number;
  /** 필수 항목 중 제출된(분석 대기 포함) 수 */
  submittedCount: number;
  /** 필수 항목 중 분석까지 끝난 수 */
  completeCount: number;
  missing: ChecklistItem[];
}

/** 배달 매출이 흔한 업종. 이 업종은 배달앱 자료를 필수로 요청한다. */
const DELIVERY_INDUSTRIES = ["카페", "디저트", "베이커리", "한식", "중식", "일식", "양식", "분식", "치킨", "피자", "족발", "보쌈", "도시락", "음식", "식당", "패스트푸드", "버거"];

export function isDeliveryIndustry(industry: string): boolean {
  return DELIVERY_INDUSTRIES.some((k) => industry.includes(k));
}

export function checklistDefinition(industry: string, hasDeliveryData: boolean): ChecklistItemDef[] {
  const delivery = isDeliveryIndustry(industry) || hasDeliveryData;
  return [
    {
      key: "pos_sales",
      label: "POS 매출 자료",
      documentType: "pos_sales",
      required: true,
      reason: "점포의 실제 총매출을 확인하는 기본 자료입니다.",
      blockedAnalyses: ["양도인 주장 매출 검증", "POS↔카드 교차 검증", "수익성 분석(정확한 총매출)", "투자금 회수 기간"],
      requestText: "POS 월별 매출 자료 (최근 6개월 이상, 카드·현금·배달 구분 포함)",
    },
    {
      key: "card_sales",
      label: "카드 매출 자료",
      documentType: "card_sales",
      required: true,
      reason: "POS 매출을 카드사(제3자) 자료로 교차 확인합니다.",
      blockedAnalyses: ["POS↔카드 교차 검증", "현금 매출 추정"],
      requestText: "카드사 매출 승인 내역 또는 여신금융협회 매출 조회 자료 (POS와 같은 기간)",
    },
    {
      key: "delivery_sales",
      label: "배달앱 정산 자료",
      documentType: "delivery_sales",
      required: delivery,
      reason: delivery
        ? "배달 매출 규모와 배달 수수료를 확인합니다."
        : "배달 영업을 하는 경우에만 필요합니다.",
      blockedAnalyses: ["배달 주문액↔정산액 검증", "배달 수수료(비용)"],
      requestText: "배달앱별 월 정산서 (주문액·수수료·정산액 포함)",
    },
    {
      key: "lease_contract",
      label: "임대차 계약서",
      documentType: "lease_contract",
      required: true,
      reason: "월세·보증금·계약 기간·특약을 확인합니다.",
      blockedAnalyses: ["임대료 검증", "계약 잔여 기간", "계약 특약 위험"],
      requestText: "임대차 계약서 사본 (특약 포함 전체 페이지)",
    },
    {
      key: "expense_material",
      label: "재료비 자료",
      documentType: "expense",
      expenseCategories: ["material"],
      required: true,
      reason: "가장 큰 변동비로, 없으면 영업이익을 계산할 수 없습니다.",
      blockedAnalyses: ["영업이익", "영업이익률", "투자금 회수 기간"],
      requestText: "재료 매입 내역 (세금계산서 또는 거래처 명세서)",
    },
    {
      key: "expense_labor",
      label: "인건비 자료",
      documentType: "expense",
      expenseCategories: ["labor"],
      required: true,
      reason: "인건비가 빠지면 순수익이 크게 부풀려집니다.",
      blockedAnalyses: ["영업이익", "영업이익률", "투자금 회수 기간"],
      requestText: "급여 이체 내역 또는 원천징수 내역 (아르바이트 포함)",
    },
    {
      key: "expense_overhead",
      label: "관리비·공과금 자료",
      documentType: "expense",
      expenseCategories: ["maintenance", "utilities"],
      required: true,
      reason: "고정비 확인에 필요합니다.",
      blockedAnalyses: ["영업이익", "영업이익률"],
      requestText: "관리비 고지서와 전기·가스·수도 요금 내역",
    },
    {
      key: "expense_other",
      label: "광고비·기타 비용 자료",
      documentType: "expense",
      expenseCategories: ["advertising", "other"],
      required: false,
      reason: "없으면 영업이익이 상한값으로 계산됩니다.",
      blockedAnalyses: ["영업이익 확정(상한값 해제)"],
      requestText: "광고비·소모품비 등 기타 지출 내역",
    },
  ];
}

export interface ChecklistDocument {
  id: string;
  documentType: DocumentType;
  status: DocumentStatus;
  superseded: boolean;
}

export function computeChecklist(
  industry: string,
  documents: ChecklistDocument[],
  payloads: NormalizedPayload[],
): Checklist {
  const active = documents.filter((d) => !d.superseded);
  const hasDeliveryData = payloads.some((p) => p.revenues.some((r) => r.source.startsWith("delivery")));
  const coveredCategories = new Set(payloads.flatMap((p) => p.expenses.map((e) => e.category)));
  const importedTypes = new Set(payloads.map((p) => p.documentType));

  const items: ChecklistItem[] = checklistDefinition(industry, hasDeliveryData).map((def) => {
    const docs = active.filter((d) => d.documentType === def.documentType);
    const documentIds = docs.map((d) => d.id);
    let state: ChecklistState = "missing";
    let note: string | null = null;

    if (def.expenseCategories) {
      const found = def.expenseCategories.filter((c) => coveredCategories.has(c));
      if (found.length === def.expenseCategories.length) state = "complete";
      else if (docs.some((d) => d.status === "uploaded" || d.status === "analyzing")) {
        state = "submitted";
        note = "비용 자료 분석 대기 중";
      } else if (found.length > 0) {
        note = `일부만 확인됨`;
      } else if (docs.some((d) => d.status === "analyzed")) {
        note = "제출된 비용 자료에 해당 항목이 없음";
      }
    } else if (docs.some((d) => d.status === "analyzed") || importedTypes.has(def.documentType)) {
      state = "complete";
    } else if (docs.some((d) => d.status === "uploaded" || d.status === "analyzing")) {
      state = "submitted";
      note = "분석 대기 중";
    } else if (docs.some((d) => d.status === "failed")) {
      state = "failed";
      note = "분석 실패: 다시 업로드하거나 분석 결과를 가져오세요";
    }
    return { ...def, state, documentIds, note };
  });

  const required = items.filter((i) => i.required);
  return {
    items,
    requiredCount: required.length,
    submittedCount: required.filter((i) => i.state === "complete" || i.state === "submitted").length,
    completeCount: required.filter((i) => i.state === "complete").length,
    missing: items.filter((i) => i.state === "missing" || i.state === "failed"),
  };
}

/** 양도인에게 보낼 추가 자료 요청 문구 */
export function buildRequestMessage(storeName: string, items: ChecklistItemDef[]): string {
  const lines = items.map((i, n) => `${n + 1}. ${i.requestText}\n   - 필요한 이유: ${i.reason}`);
  return [
    `안녕하세요. ${storeName} 양수 검토를 위해 아래 자료를 추가로 요청드립니다.`,
    "",
    ...lines,
    "",
    "자료는 PDF, 엑셀(XLS/XLSX), 이미지(JPG/PNG) 형식으로 보내주시면 됩니다.",
    "제출해 주신 자료는 매출·수익성 검증 목적으로만 사용합니다. 감사합니다.",
  ].join("\n");
}
