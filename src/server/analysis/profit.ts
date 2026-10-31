/**
 * 수익성 분석 엔진
 *
 * 영업이익 = 총매출 - 총영업비용, 영업이익률 = 영업이익 / 총매출 × 100
 * 확인되지 않은 비용은 0원으로 간주하지 않는다.
 *  - 필수 비용(재료비·인건비·임대료·관리비·공과금, 배달 매출이 있으면 배달 수수료)이 하나라도 없으면
 *    영업이익을 계산하지 않는다.
 *  - 선택 비용(광고비·기타)이 없으면 영업이익은 "확인된 비용 기준 상한값"이며 isComplete = false.
 */
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, type ExpenseCategory, type YearMonth } from "@/types/domain";
import { deliveryByMonth } from "./revenue";
import type { AnalysisInput, ProfitAnalysisResult, ProfitResult, RevenueAnalysis } from "./types";
import { round, sum } from "./util";

const CORE: ExpenseCategory[] = ["material", "labor", "rent", "maintenance", "utilities"];

const COLUMN: Record<ExpenseCategory, keyof ProfitResult> = {
  material: "materialCost",
  labor: "laborCost",
  rent: "rentCost",
  maintenance: "maintenanceCost",
  utilities: "utilitiesCost",
  delivery_fee: "deliveryFee",
  advertising: "advertisingCost",
  other: "otherCost",
};

interface ResolvedCost {
  amount: number | null;
  source: string;
}

function contractRent(input: AnalysisInput): number | null {
  const note = input.contractNotes.find((n) => n.key === "monthly_rent");
  if (!note) return null;
  const v = Number(note.value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

function resolveCost(
  input: AnalysisInput,
  category: ExpenseCategory,
  ym: YearMonth,
  delivery: ReturnType<typeof deliveryByMonth>,
): ResolvedCost {
  const records = input.expenses.filter((e) => e.category === category && e.yearMonth === ym);
  if (records.length > 0) {
    const verified = records.every((r) => r.isVerified);
    return {
      amount: sum(records.map((r) => r.amount)),
      source: verified ? "비용 증빙 자료" : "비용 자료 (증빙 미확인 포함)",
    };
  }
  if (category === "rent") {
    const fromContract = contractRent(input);
    if (fromContract !== null) return { amount: fromContract, source: "임대차 계약서 월세" };
    return { amount: input.store.monthlyRent, source: "양도인 입력 월세 (계약서·이체 내역 미확인)" };
  }
  if (category === "delivery_fee") {
    const d = delivery.get(ym);
    if (d && d.order !== null && d.settlement !== null && d.order >= d.settlement) {
      return { amount: d.order - d.settlement, source: "배달앱 주문액 - 정산액" };
    }
  }
  return { amount: null, source: "확인되지 않음" };
}

function buildRow(
  periodType: ProfitResult["periodType"],
  yearMonth: YearMonth | null,
  totalRevenue: number | null,
  revenueBasis: string,
  costs: Record<ExpenseCategory, number | null>,
  required: ExpenseCategory[],
): ProfitResult {
  const missing = EXPENSE_CATEGORIES.filter(
    (c) => costs[c] === null && (required.includes(c) || c === "advertising" || c === "other"),
  );
  const requiredMissing = required.filter((c) => costs[c] === null);
  const known = EXPENSE_CATEGORIES.map((c) => costs[c]).filter((v): v is number => v !== null);
  const totalOperatingCost = requiredMissing.length === 0 ? sum(known) : null;
  const operatingProfit =
    totalRevenue !== null && totalOperatingCost !== null ? totalRevenue - totalOperatingCost : null;
  const row = {
    periodType,
    yearMonth,
    totalRevenue,
    revenueBasis,
    totalOperatingCost,
    operatingProfit,
    operatingMargin:
      operatingProfit !== null && totalRevenue ? round((operatingProfit / totalRevenue) * 100, 2) : null,
    missingCostCategories: missing,
    isComplete: missing.length === 0 && operatingProfit !== null,
  } as ProfitResult;
  for (const c of EXPENSE_CATEGORIES) (row as unknown as Record<string, unknown>)[COLUMN[c]] = costs[c];
  return row;
}

export function analyzeProfit(input: AnalysisInput, revenue: RevenueAnalysis): ProfitAnalysisResult {
  const delivery = deliveryByMonth(input);
  const costSources = new Map<ExpenseCategory, Set<string>>();
  const monthly: ProfitResult[] = [];

  for (const total of revenue.monthlyTotals) {
    const costs = {} as Record<ExpenseCategory, number | null>;
    for (const c of EXPENSE_CATEGORIES) {
      const r = resolveCost(input, c, total.yearMonth, delivery);
      costs[c] = r.amount;
      costSources.set(c, new Set([...(costSources.get(c) ?? []), r.source]));
    }
    const hasDelivery = delivery.get(total.yearMonth)?.order != null;
    const required = hasDelivery ? [...CORE, "delivery_fee" as const] : CORE;
    const basis = [total.basis, ...total.caveats].join(" / ");
    monthly.push(buildRow("monthly", total.yearMonth, total.amount, basis, costs, required));
  }

  let average: ProfitResult | null = null;
  if (monthly.length > 0) {
    const computed = monthly.filter((m) => m.operatingProfit !== null);
    const base = computed.length > 0 ? computed : monthly;
    const avg = (vals: Array<number | null>) => {
      const known = vals.filter((v): v is number => v !== null);
      // 일부 월에만 있는 비용은 평균을 내지 않는다 (없는 월을 0으로 보지 않기 위해)
      return known.length === vals.length ? Math.round(sum(known) / known.length) : null;
    };
    const costs = {} as Record<ExpenseCategory, number | null>;
    for (const c of EXPENSE_CATEGORIES) {
      costs[c] = avg(base.map((m) => m[COLUMN[c]] as number | null));
    }
    const anyDelivery = base.some((m) => delivery.get(m.yearMonth!)?.order != null);
    const required = anyDelivery ? [...CORE, "delivery_fee" as const] : CORE;
    const revenueAvg = Math.round(sum(base.map((m) => m.totalRevenue ?? 0)) / base.length);
    const basis =
      computed.length > 0
        ? `영업이익을 계산할 수 있는 ${computed.length}개월 평균`
        : `필수 비용이 확인되지 않아 영업이익 미계산 (${base.length}개월 매출 평균)`;
    average = buildRow("average", null, revenueAvg, basis, costs, required);
  }

  return {
    monthly,
    average,
    costSources: EXPENSE_CATEGORIES.map((c) => ({
      category: c,
      source: [...(costSources.get(c) ?? new Set(["확인되지 않음"]))].join(", "),
    })),
  };
}

export function describeMissingCosts(categories: ExpenseCategory[]): string {
  return categories.map((c) => EXPENSE_CATEGORY_LABELS[c]).join(", ");
}
