// docs/API.md 5번(DB), 6번(AI 출력)을 그대로 옮긴 타입. 브라우저/서버 공용.

export type Role = "buyer" | "seller";
export type MessageRole = Role | "agent";

export type StageKey =
  | "consent"
  | "documents"
  | "verify"
  | "terms"
  | "contract"
  | "lease"
  | "closing"
  | "handover";

export const BUSINESS_TYPES = [
  "음식점",
  "카페",
  "서비스업",
  "도·소매업",
  "예술·스포츠·시설업",
  "교육·학원업",
  "숙박업",
  "기타",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

// deals 테이블
export type Deal = {
  id: string;
  created_at: string;
  address: string;
  business_type: BusinessType;
  premium: number;
  deposit: number;
  monthly_rent: number;
  claimed_monthly_sales: number;
  claimed_monthly_profit: number | null;
  stage: StageKey;
  seller_consent: boolean;
  consent_at: string | null;
};

export type ChecklistStatus = "todo" | "done" | "confirmed";

// checklist_items 테이블 + lib/roadmap.ts에서 붙이는 guide
export type ChecklistItem = {
  id: string;
  stage: StageKey;
  role: Role;
  key: string;
  title: string;
  status: ChecklistStatus;
  sort: number;
  guide: string | null;
};

export type DocumentKind = "pdf" | "image" | "spreadsheet" | "csv" | "report"; // report = AI 분석 결과(파일 없음)

// documents 테이블 (화면에 필요한 칸만)
export type DealDocument = {
  id: string;
  created_at: string;
  checklist_key: string;
  file_name: string;
  size: number;
};

// messages 테이블
export type Message = {
  id: string;
  created_at: string;
  role: MessageRole;
  body: string;
};

export type RoadmapStep = {
  key: StageKey;
  title: string;
  status: "done" | "current" | "todo";
};

// GET /api/deals 목록 아이템
export type DealListItem = {
  id: string;
  created_at: string;
  address: string;
  business_type: BusinessType;
  stage: StageKey;
  todo_count: number;
};

// ---- AI 1단계 출력: Extraction (lib/extraction-schema.ts) ----

export type DocType =
  | "card_sales"
  | "pos"
  | "delivery_app"
  | "vat_return"
  | "bank_statement"
  | "cost_statement"
  | "lease_contract"
  | "operation"
  | "facility"
  | "other";

export const COST_CATEGORIES = ["ingredients", "labor", "utilities", "rent", "fees", "other"] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export type ExtractedCost = {
  month: string; // YYYY-MM
  category: CostCategory;
  amount: number | null;
};

export type ExtractedLease = {
  deposit: number | null;
  monthly_rent: number | null;
  maintenance_fee: number | null;
  start: string | null; // YYYY-MM
  end: string | null; // YYYY-MM
};

export type ExtractedOperation = {
  owner_weekly_hours: number | null;
  staff_count: number | null;
};

export type ExtractedMonth = {
  month: string; // YYYY-MM
  gross_sales: number | null;
  net_amount: number | null;
  order_count: number | null;
};

export type ExtractedDocument = {
  file_name: string;
  doc_type: DocType;
  business_name: string | null;
  business_number: string | null;
  period_start: string | null;
  period_end: string | null;
  monthly: ExtractedMonth[];
  stated_total: number | null;
  // 아래 4개는 비용·계약·운영·시설 자료용. 예전 분석 결과에는 없을 수 있다.
  monthly_costs?: ExtractedCost[];
  lease?: ExtractedLease | null;
  operation?: ExtractedOperation | null;
  facility_items?: string[];
  readability: "clear" | "partial" | "unreadable";
  warnings: string[];
};

export type Extraction = {
  documents: ExtractedDocument[];
};

// ---- 2단계: 코드 검증 결과 (lib/verify.ts) ----

// ok = 통과, caution = 주의, warn = 확인 필요
export type CheckLevel = "ok" | "caution" | "warn";

export type Check = {
  kind: "sum" | "missing_month" | "business_number" | "cross_source" | "vat" | "claimed";
  level: CheckLevel;
  month: string | null;
  title: string;
  detail: string;
};

export type MonthlyRow = {
  month: string;
  card: number | null;
  delivery: number | null;
  pos: number | null;
  card_plus_delivery: number | null;
  pos_diff_rate: number | null; // POS가 (카드+배달)보다 몇 % 많은지/적은지
  level: CheckLevel;
};

export type ClaimedVsActual = {
  claimed_monthly_sales: number;
  verified_monthly_avg: number | null;
  diff_amount: number | null;
  diff_rate: number | null;
  basis: string;
  level: CheckLevel;
};

export type Grade = "A" | "B" | "C" | "D";

// ---- 3단계 출력: Summary (lib/summary-schema.ts) ----

export type Summary = {
  headline: string;
  findings: string[];
  negotiation_points: string[]; // 양수인 전용
  next_requests: string[];
};

// reports.result에 저장되는 최종 리포트
export type Report = {
  extraction: Extraction;
  checks: Check[];
  monthly: MonthlyRow[];
  claimed_vs_actual: ClaimedVsActual;
  grade: Grade;
  summary: Summary | null;
};

// ---- 확장: 매물·데이터룸 (docs/API.md 10.2) ----

// L0 공개 / L1 NDA 후 / L2 승인 후 / L3 양도인 전용
export const ACCESS_LEVELS = ["L0", "L1", "L2", "L3"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const DOC_CATEGORIES = ["sales", "cost", "contract", "facility", "other"] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];

// 점주 진술 / 자료 제출 / 교차 확인 / 외부 검증 / AI 추정 (PRD 7.2)
export type TrustLevel = "owner_stated" | "submitted" | "cross_checked" | "external" | "ai_estimate";

export type ListingStatus = "draft" | "published";

export type PremiumBreakdown = {
  business: number | null; // 영업권리금
  facility: number | null; // 시설권리금
  floor: number | null; // 바닥권리금
  basis: string | null; // 산정 근거
};

export type Parking = {
  building_total: number | null;
  for_store: number | null;
};

// deals 테이블 = 매물
export type Listing = Deal & {
  seller_id: string | null;
  building_name: string | null;
  business_name: string | null;
  floor: number | null;
  total_floors: number | null;
  area_pyeong: number | null;
  is_franchise: boolean | null;
  premium_breakdown: PremiumBreakdown | null;
  themes: string[];
  parking: Parking | null;
  status: ListingStatus;
  is_sample: boolean;
};

// 양수인(다른 사람)에게 보이는 매물: L0 항목만
export type PublicListing = {
  id: string;
  created_at: string;
  area: string; // 대략적인 위치 (시·구까지)
  business_type: BusinessType;
  premium: number;
  deposit: number;
  monthly_rent: number;
  floor: number | null;
  area_pyeong: number | null;
  themes: string[];
  status: ListingStatus;
  is_sample: boolean;
};

export type VerificationStatus = "submitted" | "analyzed" | "ai_failed";

export type ListingDocument = {
  id: string;
  created_at: string;
  updated_at: string;
  file_name: string;
  kind: DocumentKind;
  size: number;
  category: DocCategory;
  access_level: AccessLevel; // 원본 파일
  summary_access_level: AccessLevel; // 추출 요약
  extraction: ExtractedDocument | null;
  verification_status: VerificationStatus;
};

export type DataPoint = {
  id: string;
  document_id: string | null;
  key: string; // 예: card_sales.gross_sales
  period: string | null;
  value: number | null;
  unit: string;
  trust_level: TrustLevel;
  access_level: AccessLevel;
  source_note: string | null;
};

export type GrantStatus = "requested" | "approved" | "rejected" | "revoked";

// 양수인에게 "있지만 잠긴" 자료 (L1·L2). L3는 존재도 알리지 않는다.
export type LockedItem = {
  target_type: "document" | "document_summary";
  target_id: string;
  label: string;
  category: DocCategory;
  level: AccessLevel;
  request_status: GrantStatus | null;
};

export type NdaStatus = {
  status: "test_agreed" | "revoked";
  version: string;
  agreed_at: string;
  revoked_at: string | null;
};

// GET /api/listings/[id] 응답
export type DataRoom = {
  is_owner: boolean;
  listing: Listing | PublicListing;
  documents: ListingDocument[];
  data_points: DataPoint[];
  report: { id: string; created_at: string; grade: Grade; result: Report } | null;
  report_access: { document_id: string; level: AccessLevel } | null; // 양도인에게만
  nda: NdaStatus | null; // 보는 사람(양수인)의 NDA
  locked: LockedItem[];
  pending_requests: number; // 양도인에게만
};
