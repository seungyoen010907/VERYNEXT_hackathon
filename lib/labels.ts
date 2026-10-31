// 화면에 보여줄 이름표. 브라우저/서버 공용.

import { won } from "./format";
import type { AccessLevel, DataPoint, DocCategory, DocType, TrustLevel, VerificationStatus } from "./types";

export const ACCESS_LABEL: Record<AccessLevel, string> = {
  L0: "모두 공개",
  L1: "NDA 후 공개",
  L2: "승인 후 공개",
  L3: "나만 보기",
};

export const CATEGORY_LABEL: Record<DocCategory, string> = {
  sales: "매출",
  cost: "비용",
  contract: "계약",
  facility: "시설",
  other: "기타",
};

export const TRUST_LABEL: Record<TrustLevel, string> = {
  owner_stated: "양도인 입력",
  submitted: "자료 제출",
  cross_checked: "자료끼리 확인됨",
  external: "외부 확인",
  ai_estimate: "AI 추정",
};

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  card_sales: "카드매출",
  pos: "POS",
  delivery_app: "배달앱 정산",
  vat_return: "부가세 신고",
  bank_statement: "사업용 계좌 거래내역",
  cash_receipt: "현금영수증·현금매출",
  claimed_sales: "양도인 주장 월별 매출표",
  cost_statement: "비용 내역",
  lease_contract: "임대차계약서",
  operation: "운영 현황",
  facility: "시설 목록",
  other: "기타",
};

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  submitted: "분석 전",
  analyzed: "AI 분석 완료",
  ai_failed: "AI 분석 실패",
};

const COST_LABEL: Record<string, string> = {
  ingredients: "재료비",
  labor: "인건비",
  utilities: "공과금",
  rent: "임차료",
  fees: "수수료",
  other: "기타 비용",
};

const OTHER_KEY_LABEL: Record<string, string> = {
  "lease.deposit": "임대차 보증금",
  "lease.monthly_rent": "임대차 월세",
  "lease.maintenance_fee": "관리비",
  "lease.start": "임대차 시작",
  "lease.end": "임대차 만료",
  "operation.owner_weekly_hours": "점주 주당 근무시간",
  "operation.staff_count": "직원 수",
  "facility.item": "넘겨받는 시설",
  "input.cost": "월 비용 (양도인 입력)",
  "input.labor": "인력 구성 (양도인 입력)",
  "input.facility": "시설 (양도인 입력)",
};

// 양도인 입력 행은 같은 key가 여러 줄이라 이름(source_note)까지 붙인다
export function pointLabel(p: Pick<DataPoint, "key" | "source_note">): string {
  const base = dataPointLabel(p.key);
  return p.key === "input.cost" || p.key === "input.facility" ? `${base} · ${p.source_note ?? ""}` : base;
}

// "card_sales.gross_sales" -> "카드매출 월 매출"
export function dataPointLabel(key: string): string {
  if (OTHER_KEY_LABEL[key]) return OTHER_KEY_LABEL[key];
  const [type, field] = key.split(".");
  if (type === "cost") return `월 ${COST_LABEL[field] ?? field}`;
  const fieldLabel: Record<string, string> = { gross_sales: "월 매출", net_amount: "월 정산액", stated_total: "자료상 합계" };
  return `${DOC_TYPE_LABEL[type as DocType] ?? type} ${fieldLabel[field] ?? field}`;
}

// 값 표시: 원·시간·명·연월
export function formatPointValue(p: Pick<DataPoint, "value" | "unit" | "period" | "key" | "source_note" | "meta">): string {
  if (p.key === "input.labor") {
    const m = (p.meta ?? {}) as { family?: number; staff?: number };
    return !m.family && !m.staff ? "점주 혼자" : `가족·동업자 ${m.family ?? 0}명, 고용 직원 ${m.staff ?? 0}명`;
  }
  if (p.key === "input.facility" && p.value === null) return "반영 가격 미입력";
  if (p.unit === "month") return p.period ?? "미확인";
  if (p.unit === "item") return p.source_note?.replace(/ \(.*\)$/, "") ?? "-";
  if (p.value === null) return "미확인";
  if (p.unit === "hour") return `주 ${p.value}시간`;
  if (p.unit === "person") return `${p.value}명`;
  return won(p.value);
}

// ---- 에이전트 간 통신 (docs/API.md 10.4) ----

export const TOPIC_LABEL: Record<string, string> = {
  sales: "매출 확인",
  cost: "비용 확인",
  profit: "순수익 확인",
  operation: "운영 조건",
  lease: "임대차 조건",
  facility: "시설·인수인계",
  documents: "자료 추가 요청",
};

export const AGENT_STATUS_LABEL: Record<string, string> = {
  created: "보내는 중",
  queued: "보내는 중",
  answering: "답 쓰는 중",
  pending_approval: "승인 기다리는 중",
  needs_documents: "자료 없음",
  answered: "답변 옴",
  rejected: "거절됨",
  error: "오류",
};

export const ANSWER_TYPE_LABEL: Record<string, string> = {
  auto: "자동 답변",
  needs_approval: "승인 필요",
  needs_documents: "자료 필요",
  no_data: "자료 없음",
  denied: "볼 수 없음",
};

export const AUDIT_LABEL: Record<string, string> = {
  view_dataroom: "자료실 열람",
  download: "원본 내려받기",
  nda_agree: "NDA 동의",
  nda_revoke: "NDA 철회",
  grant_request: "열람 요청",
  grant_approve: "열람 승인",
  grant_reject: "열람 거절",
  grant_revoke: "열람 취소",
  access_change: "공개 범위 변경",
  agent_answer: "양도인 AI 답변",
};
