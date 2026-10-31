/**
 * 분석 엔진 입력·출력 타입
 * 엔진은 DB에 의존하지 않는 순수 함수다. 저장소가 DB 행을 이 형식으로 바꿔 넘긴다.
 */
import type {
  AggregationBasis,
  DocumentStatus,
  DocumentType,
  Evidence,
  ExpenseCategory,
  PremiumAnalysis,
  ProfitAnalysis,
  RevenueSource,
  RevenueVerification,
  RiskAssessment,
  Store,
  VerificationLevel,
  Won,
  YearMonth,
} from "@/types/domain";

export const ENGINE_VERSION = "1.0.0";

/** 판정 기준값. analyses.basis 에 그대로 저장해 결과를 재현할 수 있게 한다. */
export const ANALYSIS_BASIS = {
  /** 양도인 주장 매출과 증빙 매출의 허용 오차 */
  claimedRevenueTolerance: 0.05,
  /** 카드 매출이 POS를 초과해도 허용하는 오차 (취소·시점 차이) */
  cardOverPosTolerance: 0.02,
  /** POS - 카드 - 배달로 추정한 현금과 현금 매출 자료의 허용 오차 (POS 대비) */
  cashTolerance: 0.03,
  /** 배달앱 수수료율(1 - 정산액/주문액)의 정상 상한 */
  maxDeliveryFeeRate: 0.4,
  /** 전월 대비 매출 변화율 경고 기준 */
  monthlyChangeWarning: 0.3,
  /** 전월 대비 매출 변화율 고위험 기준 */
  monthlyChangeHigh: 0.5,
  /** 증빙 기간 최소 개월 수 */
  minEvidenceMonths: 3,
  /** 양도인 주장 순수익과 계산한 영업이익의 허용 오차 */
  claimedProfitTolerance: 0.1,
} as const;

export interface RevenueRecord {
  source: Exclude<RevenueSource, "claimed">;
  platform: string | null;
  yearMonth: YearMonth;
  amount: Won;
  aggregationBasis: AggregationBasis;
  vatIncluded: boolean | null;
  includesCard: boolean | null;
  includesDelivery: boolean | null;
  orderCount: number | null;
  normalizedDataId: string | null;
  /** 같은 출처·월 자료가 여러 건이면 나중에 들어온 자료를 사용한다 */
  createdAt: string;
}

export interface ExpenseRecord {
  category: ExpenseCategory;
  yearMonth: YearMonth;
  amount: Won;
  isVerified: boolean;
  normalizedDataId: string | null;
  note: string | null;
}

export interface ContractNote {
  key: string;
  value: string;
  normalizedDataId: string | null;
}

export interface SourceDocument {
  documentId: string | null;
  fileName: string | null;
  documentType: DocumentType;
}

export interface AnalysisInput {
  store: Pick<
    Store,
    | "id"
    | "name"
    | "industry"
    | "deposit"
    | "monthlyRent"
    | "premium"
    | "claimedMonthlyRevenue"
    | "claimedMonthlyNetProfit"
    | "facilityInvestment"
    | "otherInitialCost"
  >;
  revenues: RevenueRecord[];
  expenses: ExpenseRecord[];
  contractNotes: ContractNote[];
  documents: Array<{ id: string; documentType: DocumentType; status: DocumentStatus; fileName: string }>;
  /** normalizedDataId → 원본 문서. 근거 자료 표시에 사용한다. */
  sourceDocuments: Record<string, SourceDocument>;
  /** 분석 기준일 "YYYY-MM-DD". 계약 잔여 기간 계산에 사용한다. */
  asOf: string;
}

type ResultOf<T> = Omit<T, "id" | "analysisId" | "storeId" | "createdAt">;
export type RevenueCheckResult = ResultOf<RevenueVerification>;
export type ProfitResult = ResultOf<ProfitAnalysis>;
export type PremiumResult = ResultOf<PremiumAnalysis>;
export type RiskResult = Omit<ResultOf<RiskAssessment>, "aiExplanation">;

/** 월별 총매출 판정 결과 (중복 합산 방지 규칙 적용) */
export interface MonthlyRevenueTotal {
  yearMonth: YearMonth;
  amount: Won;
  method: "pos" | "pos_plus_delivery" | "card_cash_delivery";
  basis: string;
  /** 과소·과대 추정 가능성 등 주의 사항 */
  caveats: string[];
  evidence: Evidence[];
}

export interface RevenueAnalysis {
  checks: RevenueCheckResult[];
  monthlyTotals: MonthlyRevenueTotal[];
  /** 출처별 제출 월 */
  coverage: Partial<Record<RevenueRecord["source"], YearMonth[]>>;
  /** 같은 출처·월에 서로 다른 금액이 들어온 경우 */
  conflicts: Array<{ source: string; platform: string | null; yearMonth: YearMonth; amounts: Won[] }>;
}

export interface ProfitAnalysisResult {
  monthly: ProfitResult[];
  average: ProfitResult | null;
  /** 각 비용 값이 어디서 왔는지 */
  costSources: Array<{ category: ExpenseCategory; source: string }>;
}

export interface FullAnalysisResult {
  engineVersion: string;
  basis: typeof ANALYSIS_BASIS;
  revenue: RevenueAnalysis;
  profit: ProfitAnalysisResult;
  premium: PremiumResult;
  risks: RiskResult[];
  verificationLevel: VerificationLevel;
  missingData: string[];
  summary: string;
}
