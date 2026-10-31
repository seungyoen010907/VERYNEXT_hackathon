/**
 * 도메인 데이터 모델
 *
 * supabase/migrations/0001_initial_schema.sql 과 1:1로 대응한다.
 * - 열거형 값은 SQL enum과 같아야 한다. (src/types/domain.test.ts 가 검사)
 * - 금액은 원(KRW) 단위 정수(number)다.
 * - `null` 은 "확인되지 않은 값"이다. 0으로 바꿔 계산하지 않는다.
 * - 날짜는 ISO 문자열이다. 월 단위 값(yearMonth)은 "YYYY-MM-01" 형식이다.
 */

// -----------------------------------------------------------------------------
// 열거형
// -----------------------------------------------------------------------------
export const USER_ROLES = ["seller", "buyer", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const STORE_STATUSES = [
  "draft",
  "pending_verification",
  "verifying",
  "verified",
  "needs_more_documents",
] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export const DOCUMENT_TYPES = [
  "pos_sales",
  "card_sales",
  "delivery_sales",
  "expense",
  "lease_contract",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = ["uploaded", "analyzing", "analyzed", "failed"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const ANALYSIS_STATUSES = ["pending", "running", "completed", "failed"] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_CATEGORIES = [
  "revenue_mismatch",
  "insufficient_revenue_evidence",
  "missing_costs",
  "profit_exaggeration",
  "abnormal_monthly_change",
  "period_mismatch",
  "lease_contract_caution",
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const VERIFICATION_STATUSES = [
  "verified",
  "mismatch",
  "unverifiable",
  "insufficient_data",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const REVENUE_CHECK_TYPES = [
  "pos_vs_card",
  "pos_vs_cash",
  "delivery_order_vs_settlement",
  "claimed_vs_evidence",
  "monthly_change",
  "data_completeness",
] as const;
export type RevenueCheckType = (typeof REVENUE_CHECK_TYPES)[number];

export const REVENUE_SOURCES = [
  "claimed",
  "pos",
  "card",
  "cash",
  "delivery_order",
  "delivery_settlement",
] as const;
export type RevenueSource = (typeof REVENUE_SOURCES)[number];

export const AGGREGATION_BASES = [
  "gross_sales",
  "net_sales",
  "order_amount",
  "settlement_amount",
  "unknown",
] as const;
export type AggregationBasis = (typeof AGGREGATION_BASES)[number];

export const EXPENSE_CATEGORIES = [
  "material",
  "labor",
  "rent",
  "maintenance",
  "utilities",
  "delivery_fee",
  "advertising",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const VERIFICATION_LEVELS = ["unverified", "partial", "verified"] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

export const PROFIT_PERIOD_TYPES = ["monthly", "average"] as const;
export type ProfitPeriodType = (typeof PROFIT_PERIOD_TYPES)[number];

export const PAYBACK_STATUSES = ["calculable", "not_recoverable", "not_calculable"] as const;
export type PaybackStatus = (typeof PAYBACK_STATUSES)[number];

export const CHAT_ROLES = ["user", "assistant"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

// -----------------------------------------------------------------------------
// 화면 표시용 한글 라벨
// -----------------------------------------------------------------------------
export const STORE_STATUS_LABELS: Record<StoreStatus, string> = {
  draft: "작성 중",
  pending_verification: "검증 신청",
  verifying: "검증 진행 중",
  verified: "검증 완료",
  needs_more_documents: "추가 자료 요청",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  pos_sales: "POS 매출 자료",
  card_sales: "카드 매출 자료",
  delivery_sales: "배달앱 매출 및 정산 자료",
  expense: "비용 및 지출 자료",
  lease_contract: "임대차 계약서",
  other: "기타 자료",
};

export const RISK_CATEGORY_LABELS: Record<RiskCategory, string> = {
  revenue_mismatch: "매출 불일치",
  insufficient_revenue_evidence: "매출 증빙 부족",
  missing_costs: "비용 누락",
  profit_exaggeration: "수익성 과장 가능성",
  abnormal_monthly_change: "특정 월 매출 급변",
  period_mismatch: "자료 기간 불일치",
  lease_contract_caution: "계약서상 주의 사항",
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  material: "재료비",
  labor: "인건비",
  rent: "임대료",
  maintenance: "관리비",
  utilities: "공과금",
  delivery_fee: "배달 수수료",
  advertising: "광고비",
  other: "기타 비용",
};

export const REVENUE_SOURCE_LABELS: Record<RevenueSource, string> = {
  claimed: "양도인 주장 매출",
  pos: "POS 매출",
  card: "카드 매출",
  cash: "현금 매출",
  delivery_order: "배달앱 주문액",
  delivery_settlement: "배달앱 정산액",
};

// -----------------------------------------------------------------------------
// 공통 타입
// -----------------------------------------------------------------------------
/** 원(KRW) 단위 정수 */
export type Won = number;
/** "YYYY-MM-01" */
export type YearMonth = string;
/** ISO 8601 timestamp */
export type Timestamp = string;
export type Uuid = string;

/** 판정 근거. 어떤 자료의 어떤 값을 근거로 삼았는지 기록한다. */
export interface Evidence {
  source: RevenueSource | ExpenseCategory | DocumentType | "store";
  description: string;
  documentId?: Uuid | null;
  normalizedDataId?: Uuid | null;
  yearMonth?: YearMonth | null;
  value?: number | null;
}

// -----------------------------------------------------------------------------
// 테이블 행 타입 (camelCase)
// -----------------------------------------------------------------------------
export interface User {
  id: Uuid;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Store {
  id: Uuid;
  ownerId: Uuid;
  name: string;
  industry: string;
  address: string;
  region: string;
  businessPeriodMonths: number | null;
  deposit: Won;
  monthlyRent: Won;
  premium: Won;
  claimedMonthlyRevenue: Won | null;
  claimedMonthlyNetProfit: Won | null;
  facilityInvestment: Won | null;
  otherInitialCost: Won | null;
  description: string;
  status: StoreStatus;
  isPublished: boolean;
  isTestData: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Document {
  id: Uuid;
  storeId: Uuid;
  uploadedBy: Uuid | null;
  documentType: DocumentType;
  fileName: string;
  storagePath: string;
  mimeType: AllowedMimeType;
  fileSize: number;
  status: DocumentStatus;
  periodStart: string | null;
  periodEnd: string | null;
  errorMessage: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ExtractedData {
  id: Uuid;
  storeId: Uuid;
  documentId: Uuid | null;
  provider: string;
  providerVersion: string | null;
  schemaVersion: string;
  /** 외부 AI 분석 결과 원본. 형식을 가정하지 않는다. */
  rawPayload: unknown;
  receivedAt: Timestamp;
}

export interface NormalizedData {
  id: Uuid;
  storeId: Uuid;
  extractedDataId: Uuid;
  schemaVersion: string;
  payload: NormalizedPayload;
  warnings: string[];
  createdAt: Timestamp;
}

/** 정규화된 데이터의 공통 형식. 어댑터가 외부 형식을 이 형식으로 변환한다. */
export interface NormalizedPayload {
  documentType: DocumentType;
  periodStart: YearMonth | null;
  periodEnd: YearMonth | null;
  revenues: Array<Omit<MonthlyRevenue, "id" | "storeId" | "normalizedDataId" | "createdAt">>;
  expenses: Array<Omit<MonthlyExpense, "id" | "storeId" | "normalizedDataId" | "createdAt">>;
  /** 계약서 등에서 추출한 텍스트 항목 (특약, 계약 기간 등) */
  notes: Array<{ key: string; value: string }>;
}

export interface MonthlyRevenue {
  id: Uuid;
  storeId: Uuid;
  /** null 이면 증빙 없이 양도인이 직접 입력한 값 */
  normalizedDataId: Uuid | null;
  source: RevenueSource;
  platform: string | null;
  yearMonth: YearMonth;
  amount: Won;
  aggregationBasis: AggregationBasis;
  vatIncluded: boolean | null;
  includesCard: boolean | null;
  includesDelivery: boolean | null;
  orderCount: number | null;
  createdAt: Timestamp;
}

export interface MonthlyExpense {
  id: Uuid;
  storeId: Uuid;
  normalizedDataId: Uuid | null;
  category: ExpenseCategory;
  yearMonth: YearMonth;
  amount: Won;
  isVerified: boolean;
  note: string | null;
  createdAt: Timestamp;
}

export interface Analysis {
  id: Uuid;
  storeId: Uuid;
  requestedBy: Uuid | null;
  status: AnalysisStatus;
  engineVersion: string;
  inputSnapshot: Record<string, unknown>;
  basis: Record<string, unknown>;
  verificationLevel: VerificationLevel | null;
  missingData: string[];
  summary: string | null;
  aiOpinion: string | null;
  errorMessage: string | null;
  startedAt: Timestamp | null;
  completedAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface RevenueVerification {
  id: Uuid;
  analysisId: Uuid;
  storeId: Uuid;
  checkType: RevenueCheckType;
  status: VerificationStatus;
  yearMonth: YearMonth | null;
  expectedAmount: Won | null;
  actualAmount: Won | null;
  differenceAmount: Won | null;
  /** 0.1234 = 12.34% */
  differenceRate: number | null;
  basis: string;
  evidence: Evidence[];
  createdAt: Timestamp;
}

export interface ProfitAnalysis {
  id: Uuid;
  analysisId: Uuid;
  storeId: Uuid;
  periodType: ProfitPeriodType;
  yearMonth: YearMonth | null;
  totalRevenue: Won | null;
  revenueBasis: string;
  materialCost: Won | null;
  laborCost: Won | null;
  rentCost: Won | null;
  maintenanceCost: Won | null;
  utilitiesCost: Won | null;
  deliveryFee: Won | null;
  advertisingCost: Won | null;
  otherCost: Won | null;
  totalOperatingCost: Won | null;
  operatingProfit: Won | null;
  /** 퍼센트 값 (12.34 = 12.34%) */
  operatingMargin: number | null;
  missingCostCategories: ExpenseCategory[];
  isComplete: boolean;
  createdAt: Timestamp;
}

export interface PremiumAnalysis {
  id: Uuid;
  analysisId: Uuid;
  storeId: Uuid;
  deposit: Won;
  premium: Won;
  facilityInvestment: Won | null;
  otherInitialCost: Won | null;
  totalInitialInvestment: Won | null;
  monthlyCashFlow: Won | null;
  paybackMonths: number | null;
  paybackStatus: PaybackStatus;
  marketDataAvailable: boolean;
  basis: string;
  notes: string[];
  createdAt: Timestamp;
}

export interface RiskAssessment {
  id: Uuid;
  analysisId: Uuid;
  storeId: Uuid;
  ruleId: string;
  category: RiskCategory;
  level: RiskLevel;
  title: string;
  cause: string;
  evidence: Evidence[];
  requiredDocuments: string[];
  recommendedAction: string;
  aiExplanation: string | null;
  createdAt: Timestamp;
}

export interface Report {
  id: Uuid;
  analysisId: Uuid;
  storeId: Uuid;
  content: Record<string, unknown>;
  generatedBy: Uuid | null;
  createdAt: Timestamp;
}

export interface ChatMessage {
  id: Uuid;
  analysisId: Uuid;
  storeId: Uuid;
  userId: Uuid;
  role: ChatRole;
  content: string;
  citedSources: Uuid[];
  createdAt: Timestamp;
}

// -----------------------------------------------------------------------------
// API 공통 응답 형식
// -----------------------------------------------------------------------------
export type ApiResponse<T> =
  | { data: T; error: null }
  | { data: null; error: { code: string; message: string; details?: unknown } };
