// Step 1 전용 가짜 데이터. Step 3에서 /api 호출로 바꾸면 이 파일은 지운다.
// 숫자는 docs/PROMPTS.md "샘플 자료 정답"('샘플분식' 2026년 1~6월)과 같다.

import { buildChecklist } from "./roadmap";
import type {
  ChecklistItem,
  Check,
  Deal,
  DealDocument,
  DealListItem,
  Message,
  MonthlyRow,
  Report,
} from "./types";

const MAN = 10_000;
const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
const CARD = [2280, 2390, 2510, 2600, 2670, 2700].map((v) => v * MAN);
const DELIVERY = [580, 610, 650, 690, 730, 720].map((v) => v * MAN);
const POS = [2950, 3080, 3250, 3380, 3500, 4820].map((v) => v * MAN);

export const mockDeal: Deal = {
  id: "test",
  created_at: "2026-10-28T02:10:00Z",
  address: "서울 마포구 ○○로 12, 1층 (샘플분식)",
  business_type: "음식점",
  premium: 60_000_000,
  deposit: 30_000_000,
  monthly_rent: 2_500_000,
  claimed_monthly_sales: 35_000_000,
  claimed_monthly_profit: 8_000_000,
  stage: "verify",
  seller_consent: true,
  consent_at: "2026-10-28T03:00:00Z",
};

const DONE_KEYS = ["seller_consent", "card_sales", "delivery_sales", "pos_report", "vat_return", "building_registry"];

export const mockChecklist: ChecklistItem[] = buildChecklist().map((item, i) => ({
  ...item,
  id: `item-${i}`,
  status: DONE_KEYS.includes(item.key) ? "done" : "todo",
}));

export const mockDocuments: DealDocument[] = [
  { id: "doc-1", created_at: "2026-10-28T03:10:00Z", checklist_key: "card_sales", file_name: "1_카드매출_2026상반기.xlsx", size: 5471 },
  { id: "doc-2", created_at: "2026-10-28T03:11:00Z", checklist_key: "delivery_sales", file_name: "2_배달앱_정산내역.csv", size: 429 },
  { id: "doc-3", created_at: "2026-10-28T03:12:00Z", checklist_key: "pos_report", file_name: "3_POS_월별리포트_캡처.png", size: 41841 },
  { id: "doc-4", created_at: "2026-10-28T03:13:00Z", checklist_key: "vat_return", file_name: "4_부가세신고_요약.pdf", size: 112799 },
];

export const mockMessages: Message[] = [
  { id: "m1", created_at: "2026-10-28T02:10:00Z", role: "agent", body: "거래방이 만들어졌어요. 양도인의 자료 공개 동의가 필요해요." },
  { id: "m2", created_at: "2026-10-28T03:00:00Z", role: "agent", body: "양도인이 자료 공개에 동의했어요. 이제 매출 자료를 올려주세요." },
  { id: "m3", created_at: "2026-10-28T03:05:00Z", role: "seller", body: "카드, 배달, POS, 부가세 자료 순서대로 올릴게요." },
  { id: "m4", created_at: "2026-10-28T03:14:00Z", role: "buyer", body: "감사합니다. 리포트 나오면 확인해볼게요." },
  { id: "m5", created_at: "2026-10-28T03:15:00Z", role: "agent", body: "검증 리포트가 나왔어요. 확인 필요 항목 1개" },
];

export const mockDeals: DealListItem[] = [
  {
    id: mockDeal.id,
    created_at: mockDeal.created_at,
    address: mockDeal.address,
    business_type: mockDeal.business_type,
    stage: mockDeal.stage,
    todo_count: 1,
  },
];

// ---- 가짜 리포트 ----

const monthly: MonthlyRow[] = MONTHS.map((month, i) => {
  const cardPlusDelivery = CARD[i] + DELIVERY[i];
  const rate = (POS[i] - cardPlusDelivery) / cardPlusDelivery;
  return {
    month,
    card: CARD[i],
    delivery: DELIVERY[i],
    pos: POS[i],
    card_plus_delivery: cardPlusDelivery,
    pos_diff_rate: rate,
    level: Math.abs(rate) >= 0.1 ? "warn" : "ok",
  };
});

const cardTotal = CARD.reduce((a, b) => a + b, 0); // 151,500,000
const cardDeliveryTotal = monthly.reduce((a, r) => a + (r.card_plus_delivery ?? 0), 0);
const verifiedAvg = Math.round(cardDeliveryTotal / MONTHS.length);
const VAT_BASE = 195_000_000;
const vatRate = (VAT_BASE - cardDeliveryTotal) / cardDeliveryTotal;
const claimedDiff = verifiedAvg - mockDeal.claimed_monthly_sales;
const claimedRate = claimedDiff / mockDeal.claimed_monthly_sales;
const june = monthly[5];

const checks: Check[] = [
  {
    kind: "cross_source",
    level: "warn",
    month: "2026-06",
    title: "6월 POS 매출이 카드+배달 합계보다 많아요",
    detail: `POS 48,200,000원 vs 카드+배달 ${june.card_plus_delivery?.toLocaleString("ko-KR")}원 (${((june.pos_diff_rate ?? 0) * 100).toFixed(1)}% 차이, 기준 10%)`,
  },
  {
    kind: "sum",
    level: "ok",
    month: null,
    title: "카드매출 합계 검산",
    detail: `월별 합산 ${cardTotal.toLocaleString("ko-KR")}원 = 자료에 적힌 합계`,
  },
  {
    kind: "business_number",
    level: "ok",
    month: null,
    title: "사업자번호 일치",
    detail: "4개 자료 모두 123-45-67890",
  },
  {
    kind: "vat",
    level: "ok",
    month: null,
    title: "부가세 과세표준과 카드+배달 합계 비교",
    detail: `과세표준 195,000,000원 vs 카드+배달 ${cardDeliveryTotal.toLocaleString("ko-KR")}원 (${(vatRate * 100).toFixed(1)}% 차이, 기준 10%)`,
  },
  {
    kind: "claimed",
    level: Math.abs(claimedRate) > 0.15 ? "warn" : "ok",
    month: null,
    title: "양도인 주장 월매출과 비교",
    detail: `주장 35,000,000원 vs 검증 월평균 ${verifiedAvg.toLocaleString("ko-KR")}원 (기준 15%)`,
  },
];

export const mockReport: Report = {
  extraction: {
    documents: [
      {
        file_name: "1_카드매출_2026상반기.xlsx",
        doc_type: "card_sales",
        business_name: "샘플분식",
        business_number: "123-45-67890",
        period_start: "2026-01",
        period_end: "2026-06",
        monthly: MONTHS.map((month, i) => ({ month, gross_sales: CARD[i], net_amount: null, order_count: null })),
        stated_total: cardTotal,
        readability: "clear",
        warnings: [],
      },
      {
        file_name: "2_배달앱_정산내역.csv",
        doc_type: "delivery_app",
        business_name: "샘플분식",
        business_number: null,
        period_start: "2026-01",
        period_end: "2026-06",
        monthly: MONTHS.map((month, i) => ({ month, gross_sales: DELIVERY[i], net_amount: null, order_count: null })),
        stated_total: null,
        readability: "clear",
        warnings: [],
      },
      {
        file_name: "3_POS_월별리포트_캡처.png",
        doc_type: "pos",
        business_name: "샘플분식",
        business_number: null,
        period_start: "2026-01",
        period_end: "2026-06",
        monthly: MONTHS.map((month, i) => ({ month, gross_sales: POS[i], net_amount: null, order_count: null })),
        stated_total: POS.reduce((a, b) => a + b, 0),
        readability: "clear",
        warnings: [],
      },
      {
        file_name: "4_부가세신고_요약.pdf",
        doc_type: "vat_return",
        business_name: "샘플분식",
        business_number: "123-45-67890",
        period_start: "2026-01",
        period_end: "2026-06",
        monthly: [],
        stated_total: VAT_BASE,
        readability: "clear",
        warnings: [],
      },
    ],
  },
  checks,
  monthly,
  claimed_vs_actual: {
    claimed_monthly_sales: mockDeal.claimed_monthly_sales,
    verified_monthly_avg: verifiedAvg,
    diff_amount: claimedDiff,
    diff_rate: claimedRate,
    basis: "카드 + 배달 월별 합계의 평균 (2026년 1~6월)",
    level: Math.abs(claimedRate) > 0.15 ? "warn" : "ok",
  },
  grade: "B",
  summary: {
    headline: "카드·배달 자료로 확인된 월매출은 주장보다 약 9% 낮고, 6월 POS 매출은 확인이 필요해요",
    findings: [
      "6월 POS 매출(48,200,000원)이 같은 달 카드+배달 합계(34,200,000원)보다 40.9% 많아요. 다른 달은 차이가 3% 안팎이라 6월만 크게 튀어요.",
      "카드·배달 기준 월평균 매출은 양도인이 말한 35,000,000원보다 약 9% 낮아요.",
    ],
    negotiation_points: [
      "권리금은 6월 POS 숫자가 아니라 카드·배달로 확인된 월평균 매출을 기준으로 이야기해보세요.",
      "6월 POS 매출의 근거(현금 매출 장부, 통장 입금 내역)를 받기 전에는 계약금 지급을 미루는 것을 고려해보세요.",
    ],
    next_requests: [
      "6월 현금 매출 내역과 통장 입금 내역",
      "POS 일별 매출 리포트 (2026년 6월)",
    ],
  },
};
