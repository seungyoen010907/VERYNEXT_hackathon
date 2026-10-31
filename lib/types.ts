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

export type BusinessType = "음식점" | "카페" | "기타";

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

export type DocumentKind = "pdf" | "image" | "spreadsheet" | "csv";

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

export type DocType = "card_sales" | "pos" | "delivery_app" | "vat_return" | "bank_statement" | "other";

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
