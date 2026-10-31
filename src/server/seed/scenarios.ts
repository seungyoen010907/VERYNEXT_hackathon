/**
 * 테스트용 가상 점포 시나리오
 *
 * 모든 값은 시연과 테스트를 위해 만든 가상 데이터다. 실제 점포가 아니다.
 * 점포명 앞에 [테스트]를 붙이고 stores.is_test_data = true 로 저장한다.
 * 문서별 분석 결과는 다른 팀원의 AI 문서 분석 모듈이 보낼 JSON(추출 스키마 v1)과 같은 형식이다.
 */
import type { DocumentType } from "@/types/domain";

export const TEST_MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
/** 월별 변동 계수. 합이 6이라 6개월 평균은 기준값과 같다. */
const F = [0.97, 1.01, 0.99, 1.03, 1.0, 1.0];

export interface ScenarioDocument {
  documentType: DocumentType;
  fileName: string;
  extraction: Record<string, unknown>;
}

export interface Scenario {
  key: string;
  description: string;
  store: {
    name: string;
    industry: string;
    address: string;
    region: string;
    businessPeriodMonths: number;
    deposit: number;
    monthlyRent: number;
    premium: number;
    claimedMonthlyRevenue: number | null;
    claimedMonthlyNetProfit: number | null;
    facilityInvestment: number | null;
    otherInitialCost: number | null;
    description: string;
  };
  documents: ScenarioDocument[];
  /** 시드 시 종합 분석까지 실행할지 */
  runAnalysis: boolean;
  /** 시드 시 추가 자료 요청을 남길 체크리스트 항목 */
  requestChecklistKeys?: string[];
}

// 100원 단위로 반올림한다. 배달 정산액(주문액 × 85%)이 반올림 오차 없이 떨어지게 하기 위함이다.
const r = (n: number) => Math.round(n / 100) * 100;

function ex(documentType: DocumentType, body: Record<string, unknown>) {
  return { schema_version: "1.0", provider: "sample-fixture", provider_version: "test", document_type: documentType, ...body };
}

function posDoc(base: number[], opts: { cash?: number[]; includesDelivery?: boolean | null } = {}): ScenarioDocument {
  const revenues: Record<string, unknown>[] = [];
  TEST_MONTHS.forEach((m, i) => {
    revenues.push({ source: "pos", year_month: m, amount: r(base[i]), aggregation_basis: "gross_sales", vat_included: true, includes_card: true, includes_delivery: opts.includesDelivery ?? true });
    if (opts.cash) revenues.push({ source: "cash", year_month: m, amount: r(opts.cash[i]), aggregation_basis: "gross_sales", vat_included: true });
  });
  return { documentType: "pos_sales", fileName: "POS_월별매출_2026-04_09.pdf", extraction: ex("pos_sales", { revenues }) };
}

function cardDoc(base: number[], months = TEST_MONTHS): ScenarioDocument {
  return {
    documentType: "card_sales",
    fileName: "카드매출_승인내역.pdf",
    extraction: ex("card_sales", {
      revenues: months.map((m, i) => ({ source: "card", year_month: m, amount: r(base[i]), aggregation_basis: "gross_sales", vat_included: true })),
    }),
  };
}

function deliveryDoc(orders: number[], feeRate: number, platform = "배달의민족"): ScenarioDocument {
  return {
    documentType: "delivery_sales",
    fileName: `${platform}_정산내역.pdf`,
    extraction: ex("delivery_sales", {
      revenues: TEST_MONTHS.flatMap((m, i) => [
        { source: "delivery_order", platform, year_month: m, amount: r(orders[i]), aggregation_basis: "order_amount" },
        { source: "delivery_settlement", platform, year_month: m, amount: r(orders[i] * (1 - feeRate)), aggregation_basis: "settlement_amount" },
      ]),
    }),
  };
}

function expenseDoc(costs: Record<string, number[]>): ScenarioDocument {
  return {
    documentType: "expense",
    fileName: "비용지출_내역.pdf",
    extraction: ex("expense", {
      expenses: Object.entries(costs).flatMap(([category, values]) =>
        TEST_MONTHS.map((m, i) => ({ category, year_month: m, amount: r(values[i]) })),
      ),
    }),
  };
}

function leaseDoc(contract: Record<string, unknown>): ScenarioDocument {
  return { documentType: "lease_contract", fileName: "임대차계약서.pdf", extraction: ex("lease_contract", { contract }) };
}

const scale = (v: number, factors = F) => factors.map((f) => v * f);
const flat = (v: number) => TEST_MONTHS.map(() => v);

export const SCENARIOS: Scenario[] = [
  {
    key: "normal",
    description: "정상 매출 자료: 요청서의 카페 예시 수치. 자료 간 일치.",
    store: {
      name: "[테스트] 정상 매출 카페",
      industry: "카페",
      address: "서울특별시 마포구 와우산로 00 (가상 주소)",
      region: "서울 마포구",
      businessPeriodMonths: 31,
      deposit: 30_000_000,
      monthlyRent: 2_000_000,
      premium: 50_000_000,
      claimedMonthlyRevenue: 30_000_000,
      claimedMonthlyNetProfit: 11_000_000,
      facilityInvestment: 10_000_000,
      otherInitialCost: 2_000_000,
      description: "테스트용 가상 매물입니다. 대학가 상권 카페, 배달 병행.",
    },
    documents: [
      // POS 3,000만 원 = 카드 2,100만 + 배달 700만 + 현금 200만 (카드·배달은 POS에 포함)
      posDoc(scale(30_000_000), { cash: scale(2_000_000) }),
      cardDoc(scale(21_000_000)),
      deliveryDoc(scale(7_000_000), 0.15),
      expenseDoc({ material: scale(9_000_000), labor: flat(5_000_000), maintenance: flat(300_000), utilities: flat(700_000), other: flat(1_000_000) }),
      leaseDoc({ deposit: 30_000_000, monthly_rent: 2_000_000, contract_start_date: "2024-03-01", contract_end_date: "2028-02-29", special_terms: ["계약 종료 시 임차인은 점포를 원상복구한다."] }),
    ],
    runAnalysis: true,
  },
  {
    key: "revenue_mismatch",
    description: "매출 불일치: 양도인 주장 4,500만 원, POS 평균 3,200만 원. 9월 카드 매출이 POS 초과.",
    store: {
      name: "[테스트] 매출 불일치 한식당",
      industry: "한식",
      address: "서울특별시 강남구 테헤란로 00 (가상 주소)",
      region: "서울 강남구",
      businessPeriodMonths: 48,
      deposit: 50_000_000,
      monthlyRent: 3_500_000,
      premium: 80_000_000,
      claimedMonthlyRevenue: 45_000_000,
      claimedMonthlyNetProfit: 15_000_000,
      facilityInvestment: 15_000_000,
      otherInitialCost: 3_000_000,
      description: "테스트용 가상 매물입니다. 오피스 상권 점심 위주 한식당.",
    },
    documents: [
      posDoc(scale(32_000_000)),
      cardDoc([...scale(25_000_000).slice(0, 5), 34_000_000]),
      expenseDoc({ material: scale(11_500_000), labor: flat(8_000_000), maintenance: flat(500_000), utilities: flat(1_200_000), advertising: flat(300_000), other: flat(800_000) }),
      leaseDoc({ deposit: 50_000_000, monthly_rent: 3_500_000, contract_start_date: "2023-01-01", contract_end_date: "2027-12-31" }),
    ],
    runAnalysis: true,
  },
  {
    key: "missing_costs",
    description: "비용 누락: 인건비·관리비·공과금 자료 없음.",
    store: {
      name: "[테스트] 비용 누락 치킨집",
      industry: "치킨",
      address: "경기도 성남시 분당구 정자일로 00 (가상 주소)",
      region: "경기 성남시",
      businessPeriodMonths: 26,
      deposit: 20_000_000,
      monthlyRent: 1_800_000,
      premium: 40_000_000,
      claimedMonthlyRevenue: 28_000_000,
      claimedMonthlyNetProfit: 12_000_000,
      facilityInvestment: 8_000_000,
      otherInitialCost: null,
      description: "테스트용 가상 매물입니다. 배달 비중이 높은 치킨 전문점.",
    },
    documents: [
      posDoc(scale(28_000_000)),
      cardDoc(scale(12_000_000)),
      deliveryDoc(scale(15_000_000), 0.18, "쿠팡이츠"),
      expenseDoc({ material: scale(11_000_000), other: flat(600_000) }),
      leaseDoc({ deposit: 20_000_000, monthly_rent: 1_800_000, contract_start_date: "2024-08-01", contract_end_date: "2027-07-31", special_terms: ["임대인 동의 없이 권리 양도 불가."] }),
    ],
    runAnalysis: true,
  },
  {
    key: "monthly_swing",
    description: "월별 매출 급변: 9월 매출만 전월 대비 약 +66% 급증.",
    store: {
      name: "[테스트] 월매출 급변 디저트카페",
      industry: "카페",
      address: "서울특별시 성동구 연무장길 00 (가상 주소)",
      region: "서울 성동구",
      businessPeriodMonths: 18,
      deposit: 25_000_000,
      monthlyRent: 2_200_000,
      premium: 45_000_000,
      claimedMonthlyRevenue: 28_000_000,
      claimedMonthlyNetProfit: 9_000_000,
      facilityInvestment: 12_000_000,
      otherInitialCost: 1_000_000,
      description: "테스트용 가상 매물입니다. SNS 유입 위주 디저트 카페.",
    },
    documents: [
      posDoc([18_000_000, 19_000_000, 18_500_000, 19_000_000, 18_000_000, 30_000_000]),
      cardDoc([16_000_000, 17_000_000, 16_500_000, 17_000_000, 16_000_000, 27_500_000]),
      expenseDoc({ material: [5_400_000, 5_700_000, 5_550_000, 5_700_000, 5_400_000, 9_000_000], labor: flat(4_000_000), maintenance: flat(250_000), utilities: flat(500_000), advertising: flat(400_000), other: flat(500_000) }),
      leaseDoc({ deposit: 25_000_000, monthly_rent: 2_200_000, contract_start_date: "2025-04-01", contract_end_date: "2027-03-31" }),
    ],
    runAnalysis: true,
  },
  {
    key: "insufficient_evidence",
    description: "증빙 부족: POS 자료 없음, 카드 매출 2개월만 제출. 아직 분석 전.",
    store: {
      name: "[테스트] 증빙 부족 분식점",
      industry: "분식",
      address: "인천광역시 연수구 컨벤시아대로 00 (가상 주소)",
      region: "인천 연수구",
      businessPeriodMonths: 14,
      deposit: 15_000_000,
      monthlyRent: 1_300_000,
      premium: 30_000_000,
      claimedMonthlyRevenue: 22_000_000,
      claimedMonthlyNetProfit: 8_000_000,
      facilityInvestment: null,
      otherInitialCost: null,
      description: "테스트용 가상 매물입니다. 학원가 분식점.",
    },
    documents: [
      cardDoc([14_000_000, 14_500_000], ["2026-08", "2026-09"]),
      leaseDoc({ deposit: 15_000_000, monthly_rent: 1_300_000, contract_start_date: "2025-09-01", contract_end_date: "2027-08-31" }),
    ],
    runAnalysis: false,
    requestChecklistKeys: ["pos_sales", "expense_material", "expense_labor"],
  },
  {
    key: "loss",
    description: "손실 발생 점포: 월매출 1,500만 원, 비용 1,740만 원.",
    store: {
      name: "[테스트] 손실 발생 편의점",
      industry: "편의점",
      address: "부산광역시 해운대구 센텀중앙로 00 (가상 주소)",
      region: "부산 해운대구",
      businessPeriodMonths: 40,
      deposit: 30_000_000,
      monthlyRent: 2_500_000,
      premium: 35_000_000,
      claimedMonthlyRevenue: 15_500_000,
      claimedMonthlyNetProfit: 3_000_000,
      facilityInvestment: 20_000_000,
      otherInitialCost: 2_000_000,
      description: "테스트용 가상 매물입니다. 오피스텔 1층 편의점.",
    },
    documents: [
      posDoc(scale(15_000_000)),
      cardDoc(scale(12_500_000)),
      expenseDoc({ material: scale(9_000_000), labor: flat(4_500_000), maintenance: flat(400_000), utilities: flat(600_000), advertising: flat(100_000), other: flat(300_000) }),
      leaseDoc({ deposit: 30_000_000, monthly_rent: 2_500_000, contract_start_date: "2023-06-01", contract_end_date: "2027-05-31" }),
    ],
    runAnalysis: true,
  },
];
