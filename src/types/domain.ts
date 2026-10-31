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

export const DOCUMENT_REQUEST_STATUSES = ["open", "fulfilled", "cancelled"] as const;
export type DocumentRequestStatus = (typeof DOCUMENT_REQUEST_STATUSES)[number];

export const ACTIVITY_TYPES = [
  "store_created",
  "store_updated",
  "document_uploaded",
  "document_reuploaded",
  "document_analyzed",
  "document_failed",
  "analysis_completed",
  "risk_detected",
  "documents_requested",
  "report_generated",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

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

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  uploaded: "분석 대기",
  analyzing: "분석 중",
  analyzed: "분석 완료",
  failed: "분석 실패",
};

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  verified: "일치",
  mismatch: "불일치",
  unverifiable: "검증 불가",
  insufficient_data: "자료 부족",
};

export const REVENUE_CHECK_TYPE_LABELS: Record<RevenueCheckType, string> = {
  pos_vs_card: "POS ↔ 카드 매출",
  pos_vs_cash: "POS ↔ 현금 매출",
  delivery_order_vs_settlement: "배달 주문액 ↔ 정산액",
  claimed_vs_evidence: "양도인 주장 ↔ 증빙 매출",
  monthly_change: "월별 매출 변화",
  data_completeness: "자료 누락·기간",
};

export const VERIFICATION_LEVEL_LABELS: Record<VerificationLevel, string> = {
  unverified: "미검증",
  partial: "부분 검증",
  verified: "검증됨",
};

export const PAYBACK_STATUS_LABELS: Record<PaybackStatus, string> = {
  calculable: "계산 가능",
  not_recoverable: "회수 불가",
  not_calculable: "계산 불가",
};

export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
  pending: "대기",
  running: "진행 중",
  completed: "완료",
  failed: "실패",
};

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  store_created: "점포 등록",
  store_updated: "점포 정보 수정",
  document_uploaded: "자료 업로드",
  document_reuploaded: "자료 재업로드",
  document_analyzed: "문서 분석 완료",
  document_failed: "문서 분석 실패",
  analysis_completed: "실사 분석 완료",
  risk_detected: "위험 탐지",
  documents_requested: "추가 자료 요청",
  report_generated: "보고서 생성",
};

export const RISK_LEVEL_ORDER: Record<RiskLevel, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  UNKNOWN: 0,
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
  listingStatus: ListingStatus;
  facilityDescription: string;
  dealConditions: string;
  /** 매출·수익 정보와 검증 상태를 매물 상세에 공개할지 */
  discloseFinancials: boolean;
  coverImagePath: string | null;
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
  /** 파일 내용의 SHA-256. 같은 점포에 같은 값이 있으면 중복 업로드 가능성 */
  contentHash: string | null;
  /** 재업로드한 경우 이전 문서 ID */
  replacesDocumentId: Uuid | null;
  /** 거래 메신저에서 공유한 파일이면 거래 ID */
  dealId: Uuid | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DocumentRequest {
  id: Uuid;
  storeId: Uuid;
  requestedBy: Uuid | null;
  checklistKeys: string[];
  message: string;
  status: DocumentRequestStatus;
  fulfilledAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface Activity {
  id: Uuid;
  storeId: Uuid;
  actorId: Uuid | null;
  type: ActivityType;
  title: string;
  detail: Record<string, unknown>;
  documentId: Uuid | null;
  analysisId: Uuid | null;
  createdAt: Timestamp;
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

// =============================================================================
// 매물 탐색 · 거래 워크스페이스 (0003)
// =============================================================================
export const LISTING_STATUSES = ["open", "negotiating", "closed"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  open: "거래 가능",
  negotiating: "협의 중",
  closed: "거래 완료",
};

export const DEAL_STAGES = [
  "inquiry",
  "negotiation",
  "collecting",
  "diligence",
  "terms",
  "contract",
  "completed",
  "cancelled",
] as const;
export type DealStage = (typeof DEAL_STAGES)[number];
export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  inquiry: "문의",
  negotiation: "거래 협의",
  collecting: "자료 수집",
  diligence: "실사 및 검증",
  terms: "조건 협상",
  contract: "계약 진행",
  completed: "거래 완료",
  cancelled: "거래 중단",
};
/** 진행 순서 (완료·중단 제외) */
export const DEAL_STAGE_FLOW: DealStage[] = ["inquiry", "negotiation", "collecting", "diligence", "terms", "contract", "completed"];

export const DEAL_MESSAGE_KINDS = ["text", "file", "request", "system"] as const;
export type DealMessageKind = (typeof DEAL_MESSAGE_KINDS)[number];

export const PARTY_ROLES = ["seller", "buyer"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];
export const PARTY_ROLE_LABELS: Record<PartyRole, string> = { seller: "양도인", buyer: "양수인" };

export const DEAL_TASK_GROUPS = ["revenue", "cost", "contract", "operation"] as const;
export type DealTaskGroup = (typeof DEAL_TASK_GROUPS)[number];
export const DEAL_TASK_GROUP_LABELS: Record<DealTaskGroup, string> = {
  revenue: "매출",
  cost: "비용",
  contract: "계약",
  operation: "운영",
};

export const DEAL_TASK_STATUSES = ["not_requested", "requested", "submitted", "reviewing", "needs_more", "done"] as const;
export type DealTaskStatus = (typeof DEAL_TASK_STATUSES)[number];
export const DEAL_TASK_STATUS_LABELS: Record<DealTaskStatus, string> = {
  not_requested: "미요청",
  requested: "요청 완료",
  submitted: "제출 완료",
  reviewing: "검토 중",
  needs_more: "추가 자료 필요",
  done: "완료",
};

export const DEAL_TASK_SOURCES = ["template", "ai", "user"] as const;
export type DealTaskSource = (typeof DEAL_TASK_SOURCES)[number];

export const ACTOR_KINDS = ["user", "ai", "system"] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export const AI_RUN_TRIGGERS = ["messages", "documents", "both"] as const;
export type AiRunTrigger = (typeof AI_RUN_TRIGGERS)[number];

export const FINDING_STATUSES = ["open", "resolved"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export type FindingCertainty = "fact" | "suspicion" | "needs_check";
export const FINDING_CERTAINTY_LABELS: Record<FindingCertainty, string> = {
  fact: "확인된 사실",
  suspicion: "의심되는 부분",
  needs_check: "추가 확인 필요",
};

export const DEAL_EVENT_TYPES = [
  "deal_started",
  "stage_changed",
  "task_status_changed",
  "request_sent",
  "file_shared",
  "document_analyzed",
  "ai_analysis_completed",
  "ai_risk_found",
  "ai_risk_resolved",
  "terms_changed",
  "report_generated",
] as const;
export type DealEventType = (typeof DEAL_EVENT_TYPES)[number];
export const DEAL_EVENT_TYPE_LABELS: Record<DealEventType, string> = {
  deal_started: "거래 시작",
  stage_changed: "거래 단계 변경",
  task_status_changed: "체크리스트 변경",
  request_sent: "자료 요청",
  file_shared: "파일 공유",
  document_analyzed: "문서 분석 완료",
  ai_analysis_completed: "AI 분석",
  ai_risk_found: "AI 위험 발견",
  ai_risk_resolved: "위험 해결",
  terms_changed: "조건 변경",
  report_generated: "보고서 생성",
};

/** 거래 메신저·AI 근거 연결 */
export interface DealEvidence {
  kind: "message" | "document" | "analysis" | "task" | "store";
  id?: string | null;
  label: string;
  /** 메시지 순번 (메시지 근거일 때) */
  seq?: number | null;
}

export interface DealTerms {
  premium: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  handoverDate: string | null;
  includedAssets: string | null;
  other: string | null;
}
export const DEAL_TERM_LABELS: Record<keyof DealTerms, string> = {
  premium: "희망 권리금",
  deposit: "보증금",
  monthlyRent: "월세",
  handoverDate: "인수 희망일",
  includedAssets: "인수 대상 시설·집기",
  other: "기타 조건",
};

export interface Deal {
  id: Uuid;
  storeId: Uuid;
  sellerId: Uuid;
  buyerId: Uuid;
  stage: DealStage;
  terms: DealTerms;
  aiAutoRun: boolean;
  lastMessageAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DealMessage {
  id: Uuid;
  seq: number;
  dealId: Uuid;
  senderId: Uuid | null;
  kind: DealMessageKind;
  body: string;
  documentId: Uuid | null;
  createdAt: Timestamp;
}

export interface DealTask {
  id: Uuid;
  dealId: Uuid;
  key: string;
  taskGroup: DealTaskGroup;
  title: string;
  assigneeRole: PartyRole;
  requestTargetRole: PartyRole | null;
  status: DealTaskStatus;
  dueDate: string | null;
  reason: string;
  source: DealTaskSource;
  documentType: DocumentType | null;
  evidence: DealEvidence[];
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DealTaskEvent {
  id: Uuid;
  taskId: Uuid;
  dealId: Uuid;
  actorKind: ActorKind;
  actorId: Uuid | null;
  fromStatus: DealTaskStatus | null;
  toStatus: DealTaskStatus | null;
  note: string;
  evidence: DealEvidence[];
  createdAt: Timestamp;
}

export interface DealAiFinding {
  id: Uuid;
  dealId: Uuid;
  key: string;
  level: RiskLevel;
  category: string;
  title: string;
  detail: string;
  certainty: FindingCertainty;
  evidence: DealEvidence[];
  status: FindingStatus;
  firstRunId: Uuid;
  lastRunId: Uuid;
  resolvedRunId: Uuid | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DealEvent {
  id: Uuid;
  dealId: Uuid;
  actorKind: ActorKind;
  actorId: Uuid | null;
  type: DealEventType;
  title: string;
  detail: Record<string, unknown>;
  createdAt: Timestamp;
}

export interface DealTermChange {
  id: Uuid;
  dealId: Uuid;
  field: keyof DealTerms;
  oldValue: unknown;
  newValue: unknown;
  changedBy: Uuid | null;
  createdAt: Timestamp;
}
