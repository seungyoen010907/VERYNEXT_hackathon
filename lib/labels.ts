// 화면에 보여줄 이름표. 브라우저/서버 공용.

import type { AccessLevel, DocCategory, DocType, TrustLevel, VerificationStatus } from "./types";

export const ACCESS_LABEL: Record<AccessLevel, string> = {
  L0: "L0 공개",
  L1: "L1 NDA 후",
  L2: "L2 승인 후",
  L3: "L3 비공개",
};

export const CATEGORY_LABEL: Record<DocCategory, string> = {
  sales: "매출",
  cost: "비용",
  contract: "계약",
  facility: "시설",
  other: "기타",
};

export const TRUST_LABEL: Record<TrustLevel, string> = {
  owner_stated: "점주 진술",
  submitted: "자료 제출",
  cross_checked: "교차 확인",
  external: "외부 검증",
  ai_estimate: "AI 추정",
};

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  card_sales: "카드매출",
  pos: "POS",
  delivery_app: "배달앱 정산",
  vat_return: "부가세 신고",
  bank_statement: "통장 내역",
  other: "기타",
};

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  submitted: "분석 전",
  analyzed: "AI 분석 완료",
  ai_failed: "AI 분석 실패",
};

// "card_sales.gross_sales" -> "카드매출 월 매출"
export function dataPointLabel(key: string): string {
  const [type, field] = key.split(".");
  const fieldLabel: Record<string, string> = { gross_sales: "월 매출", net_amount: "월 정산액", stated_total: "자료상 합계" };
  return `${DOC_TYPE_LABEL[type as DocType] ?? type} ${fieldLabel[field] ?? field}`;
}
