/**
 * 매출 교차 검증 엔진
 *
 * 중복 합산 방지: 카드 매출과 배달앱 주문액은 POS 매출에 포함되어 있을 수 있으므로
 * 총매출은 POS를 기준으로 하고, POS가 배달을 포함하지 않는다고 명시된 경우에만 배달 주문액을 더한다.
 * 집계 기준(총매출/순매출, 부가세 포함 여부, 포함 범위)이 다르거나 확인되지 않으면
 * 단순 비교하지 않고 "검증 불가"로 처리한다.
 */
import type { Evidence, YearMonth } from "@/types/domain";
import {
  ANALYSIS_BASIS,
  type AnalysisInput,
  type MonthlyRevenueTotal,
  type RevenueAnalysis,
  type RevenueCheckResult,
  type RevenueRecord,
} from "./types";
import {
  evidenceFrom,
  formatPercent,
  formatWon,
  monthLabel,
  monthRange,
  nextMonth,
  round,
  sum,
  uniqueSorted,
} from "./util";

type Source = RevenueRecord["source"];

interface MonthData {
  pos?: RevenueRecord;
  card?: RevenueRecord;
  cash?: RevenueRecord;
  /** 플랫폼별 */
  deliveryOrder: RevenueRecord[];
  deliverySettlement: RevenueRecord[];
}

/** 같은 출처·플랫폼·월 자료가 여러 건이면 가장 최근 자료를 사용하고 금액 충돌을 기록한다. */
function dedupe(records: RevenueRecord[]) {
  const groups = new Map<string, RevenueRecord[]>();
  for (const r of records) {
    const key = `${r.source}|${r.platform ?? ""}|${r.yearMonth}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const latest: RevenueRecord[] = [];
  const conflicts: RevenueAnalysis["conflicts"] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    latest.push(sorted[sorted.length - 1]);
    const amounts = uniqueSorted(sorted.map((r) => String(r.amount))).map(Number);
    if (amounts.length > 1) {
      const { source, platform, yearMonth } = sorted[0];
      conflicts.push({ source, platform, yearMonth, amounts });
    }
  }
  return { latest, conflicts };
}

function byMonth(records: RevenueRecord[]): Map<YearMonth, MonthData> {
  const map = new Map<YearMonth, MonthData>();
  for (const r of records) {
    const m = map.get(r.yearMonth) ?? { deliveryOrder: [], deliverySettlement: [] };
    if (r.source === "pos") m.pos = r;
    else if (r.source === "card") m.card = r;
    else if (r.source === "cash") m.cash = r;
    else if (r.source === "delivery_order") m.deliveryOrder.push(r);
    else if (r.source === "delivery_settlement") m.deliverySettlement.push(r);
    map.set(r.yearMonth, m);
  }
  return map;
}

const SOURCE_NAME: Record<Source, string> = {
  pos: "POS 매출",
  card: "카드 매출",
  cash: "현금 매출",
  delivery_order: "배달앱 주문액",
  delivery_settlement: "배달앱 정산액",
};

function ev(input: AnalysisInput, r: RevenueRecord): Evidence {
  const name = r.platform ? `${SOURCE_NAME[r.source]}(${r.platform})` : SOURCE_NAME[r.source];
  return evidenceFrom(
    input,
    r.source,
    `${monthLabel(r.yearMonth)} ${name} ${formatWon(r.amount)}`,
    r.normalizedDataId,
    r.yearMonth,
    r.amount,
  );
}

/** 두 자료의 집계 기준이 같은지. 다르면 이유를 돌려준다. */
function basisMismatch(a: RevenueRecord, b: RevenueRecord): string | null {
  if (a.aggregationBasis === "unknown" || b.aggregationBasis === "unknown") {
    return `${SOURCE_NAME[a.source]} 또는 ${SOURCE_NAME[b.source]}의 집계 기준(총매출/순매출)을 확인할 수 없음`;
  }
  if (a.aggregationBasis !== b.aggregationBasis) {
    return `집계 기준이 다름 (${SOURCE_NAME[a.source]}: ${a.aggregationBasis}, ${SOURCE_NAME[b.source]}: ${b.aggregationBasis})`;
  }
  if (a.vatIncluded !== null && b.vatIncluded !== null && a.vatIncluded !== b.vatIncluded) {
    return "부가세 포함 여부가 서로 다름";
  }
  return null;
}

function rate(actual: number, expected: number): number | null {
  return expected === 0 ? null : round((actual - expected) / expected, 4);
}

function check(
  partial: Omit<RevenueCheckResult, "expectedAmount" | "actualAmount" | "differenceAmount" | "differenceRate"> &
    Partial<RevenueCheckResult>,
): RevenueCheckResult {
  const expected = partial.expectedAmount ?? null;
  const actual = partial.actualAmount ?? null;
  const diff = expected !== null && actual !== null ? actual - expected : null;
  return {
    expectedAmount: expected,
    actualAmount: actual,
    differenceAmount: partial.differenceAmount ?? diff,
    differenceRate:
      partial.differenceRate ?? (expected !== null && actual !== null ? rate(actual, expected) : null),
    ...partial,
  } as RevenueCheckResult;
}

// -----------------------------------------------------------------------------
// 월별 총매출 (중복 합산 방지)
// -----------------------------------------------------------------------------
export function resolveMonthlyTotals(input: AnalysisInput, months: Map<YearMonth, MonthData>): MonthlyRevenueTotal[] {
  const totals: MonthlyRevenueTotal[] = [];
  for (const [ym, m] of [...months.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const deliveryOrder = sum(m.deliveryOrder.map((r) => r.amount));
    const hasDelivery = m.deliveryOrder.length > 0;
    const caveats: string[] = [];

    if (m.pos) {
      const evidence = [ev(input, m.pos)];
      if (m.pos.aggregationBasis === "unknown") caveats.push("POS 집계 기준(총매출/순매출) 확인 불가");
      if (hasDelivery && m.pos.includesDelivery === false) {
        evidence.push(...m.deliveryOrder.map((r) => ev(input, r)));
        totals.push({
          yearMonth: ym,
          amount: m.pos.amount + deliveryOrder,
          method: "pos_plus_delivery",
          basis: "POS에 배달 매출이 포함되지 않아 POS 매출 + 배달앱 주문액으로 계산",
          caveats,
          evidence,
        });
        continue;
      }
      if (hasDelivery && m.pos.includesDelivery === null) {
        caveats.push("POS의 배달 매출 포함 여부 확인 불가: POS 금액만 사용 (미포함이면 과소 추정)");
      }
      totals.push({
        yearMonth: ym,
        amount: m.pos.amount,
        method: "pos",
        basis:
          hasDelivery && m.pos.includesDelivery === true
            ? "POS 매출 기준 (카드·배달 매출이 POS에 포함되어 중복 합산하지 않음)"
            : "POS 매출 기준",
        caveats,
        evidence,
      });
      continue;
    }

    if (m.card) {
      const parts = [m.card.amount];
      const evidence = [ev(input, m.card)];
      if (m.cash) {
        parts.push(m.cash.amount);
        evidence.push(ev(input, m.cash));
      } else {
        caveats.push("현금 매출 자료 없음: 현금 매출 제외 (과소 추정 가능)");
      }
      if (hasDelivery) {
        parts.push(deliveryOrder);
        evidence.push(...m.deliveryOrder.map((r) => ev(input, r)));
        caveats.push("배달앱 결제가 카드 매출에 포함되었는지 확인 불가 (중복 가능성)");
      }
      caveats.unshift("POS 자료 없음: 총매출 확정 불가");
      totals.push({
        yearMonth: ym,
        amount: sum(parts),
        method: "card_cash_delivery",
        basis: "POS 미제출로 카드 + 현금 + 배달 주문액을 합산한 추정치",
        caveats,
        evidence,
      });
    }
    // POS·카드가 모두 없는 월은 총매출을 추정하지 않는다
  }
  return totals;
}

// -----------------------------------------------------------------------------
// 개별 검증
// -----------------------------------------------------------------------------
function checkPosVsCard(input: AnalysisInput, months: Map<YearMonth, MonthData>): RevenueCheckResult[] {
  const out: RevenueCheckResult[] = [];
  for (const [ym, m] of months) {
    if (!m.pos || !m.card) continue;
    const evidence = [ev(input, m.pos), ev(input, m.card)];
    const scope =
      m.pos.includesCard === null
        ? "POS 금액에 카드 매출이 포함되는지 확인 불가"
        : m.pos.includesCard === false
          ? "POS 금액에 카드 매출이 포함되지 않아 범위가 다름"
          : null;
    const reason = scope ?? basisMismatch(m.pos, m.card);
    if (reason) {
      out.push(check({ checkType: "pos_vs_card", status: "unverifiable", yearMonth: ym, basis: `${reason}: 단순 비교하지 않음`, evidence, expectedAmount: m.pos.amount, actualAmount: m.card.amount }));
      continue;
    }
    const limit = m.pos.amount * (1 + ANALYSIS_BASIS.cardOverPosTolerance);
    const share = m.pos.amount === 0 ? null : m.card.amount / m.pos.amount;
    out.push(
      check({
        checkType: "pos_vs_card",
        status: m.card.amount <= limit ? "verified" : "mismatch",
        yearMonth: ym,
        expectedAmount: m.pos.amount,
        actualAmount: m.card.amount,
        basis:
          m.card.amount <= limit
            ? `카드 매출이 POS 매출 이내 (카드 비중 ${share === null ? "-" : formatPercent(share)})`
            : `카드 매출이 POS 매출을 ${formatPercent(ANALYSIS_BASIS.cardOverPosTolerance)} 넘게 초과: POS 매출 누락 또는 자료 오류 가능성`,
        evidence,
      }),
    );
  }
  return out;
}

function checkPosVsCash(input: AnalysisInput, months: Map<YearMonth, MonthData>): RevenueCheckResult[] {
  const out: RevenueCheckResult[] = [];
  for (const [ym, m] of months) {
    if (!m.pos || !m.cash) continue;
    const evidence = [ev(input, m.pos), ev(input, m.cash)];
    const deliveryOrder = sum(m.deliveryOrder.map((r) => r.amount));
    let reason: string | null = null;
    if (!m.card) reason = "카드 매출 자료가 없어 POS 중 현금 비중을 추정할 수 없음";
    else if (m.pos.includesCard !== true) reason = "POS 금액에 카드 매출이 포함되는지 확인 불가";
    else if (m.deliveryOrder.length > 0 && m.pos.includesDelivery === null)
      reason = "POS의 배달 매출 포함 여부 확인 불가";
    else reason = basisMismatch(m.pos, m.cash);
    if (reason || !m.card) {
      out.push(check({ checkType: "pos_vs_cash", status: "unverifiable", yearMonth: ym, basis: `${reason}: 단순 비교하지 않음`, evidence }));
      continue;
    }
    evidence.push(ev(input, m.card), ...m.deliveryOrder.map((r) => ev(input, r)));
    const impliedCash =
      m.pos.amount - m.card.amount - (m.pos.includesDelivery === true ? deliveryOrder : 0);
    const ok = Math.abs(m.cash.amount - impliedCash) <= m.pos.amount * ANALYSIS_BASIS.cashTolerance;
    out.push(
      check({
        checkType: "pos_vs_cash",
        status: ok ? "verified" : "mismatch",
        yearMonth: ym,
        expectedAmount: impliedCash,
        actualAmount: m.cash.amount,
        basis: ok
          ? "POS - 카드 - 배달로 추정한 현금 매출과 현금 매출 자료가 일치"
          : `POS - 카드 - 배달로 추정한 현금 매출(${formatWon(impliedCash)})과 현금 매출 자료가 POS의 ${formatPercent(ANALYSIS_BASIS.cashTolerance)} 넘게 차이`,
        evidence,
      }),
    );
  }
  return out;
}

function checkDelivery(input: AnalysisInput, months: Map<YearMonth, MonthData>): RevenueCheckResult[] {
  const out: RevenueCheckResult[] = [];
  for (const [ym, m] of months) {
    for (const order of m.deliveryOrder) {
      const settle = m.deliverySettlement.find((s) => s.platform === order.platform);
      if (!settle) continue;
      const evidence = [ev(input, order), ev(input, settle)];
      const feeRate = order.amount === 0 ? null : 1 - settle.amount / order.amount;
      const label = order.platform ? `${order.platform} ` : "";
      let status: RevenueCheckResult["status"] = "verified";
      let basis = `${label}정산액/주문액 기준 수수료율 ${feeRate === null ? "-" : formatPercent(feeRate)}`;
      if (settle.amount > order.amount) {
        status = "mismatch";
        basis = `${label}정산액이 주문액보다 큼: 자료 오류 또는 기간 불일치 가능성`;
      } else if (feeRate !== null && feeRate > ANALYSIS_BASIS.maxDeliveryFeeRate) {
        status = "mismatch";
        basis = `${label}수수료율 ${formatPercent(feeRate)}가 정상 범위(${formatPercent(ANALYSIS_BASIS.maxDeliveryFeeRate)} 이하)를 벗어남`;
      }
      out.push(check({ checkType: "delivery_order_vs_settlement", status, yearMonth: ym, expectedAmount: order.amount, actualAmount: settle.amount, basis, evidence }));
    }
  }
  return out;
}

function checkClaimed(input: AnalysisInput, totals: MonthlyRevenueTotal[]): RevenueCheckResult {
  const claimed = input.store.claimedMonthlyRevenue;
  const storeEvidence: Evidence = {
    source: "claimed",
    description: claimed === null ? "양도인 주장 월매출 미입력" : `양도인 주장 월평균 매출 ${formatWon(claimed)}`,
    value: claimed,
  };
  if (claimed === null) {
    return check({ checkType: "claimed_vs_evidence", status: "insufficient_data", yearMonth: null, basis: "양도인 주장 월매출이 입력되지 않음", evidence: [storeEvidence] });
  }
  if (totals.length === 0) {
    return check({ checkType: "claimed_vs_evidence", status: "insufficient_data", yearMonth: null, actualAmount: claimed, basis: "POS 또는 카드 매출 증빙이 없어 비교할 수 없음", evidence: [storeEvidence] });
  }
  const avg = Math.round(sum(totals.map((t) => t.amount)) / totals.length);
  const diffRate = rate(claimed, avg);
  const months = `${totals.length}개월 평균`;
  const evidence = [storeEvidence, ...totals.flatMap((t) => t.evidence)];
  const estimated = totals.some((t) => t.method === "card_cash_delivery");
  const within = diffRate !== null && Math.abs(diffRate) <= ANALYSIS_BASIS.claimedRevenueTolerance;
  if (estimated && !within) {
    return check({
      checkType: "claimed_vs_evidence",
      status: "unverifiable",
      yearMonth: null,
      expectedAmount: avg,
      actualAmount: claimed,
      basis: `POS 자료가 없어 증빙 매출(${months} ${formatWon(avg)})이 추정치임: 불일치로 확정하지 않음`,
      evidence,
    });
  }
  return check({
    checkType: "claimed_vs_evidence",
    status: within ? "verified" : "mismatch",
    yearMonth: null,
    expectedAmount: avg,
    actualAmount: claimed,
    basis: within
      ? `증빙 매출(${months} ${formatWon(avg)})과 허용 오차 ${formatPercent(ANALYSIS_BASIS.claimedRevenueTolerance)} 이내`
      : `양도인 주장 매출이 증빙 매출(${months} ${formatWon(avg)})보다 ${formatPercent(Math.abs(diffRate ?? 0))} ${claimed > avg ? "많음" : "적음"}`,
    evidence,
  });
}

function checkMonthlyChange(input: AnalysisInput, totals: MonthlyRevenueTotal[]): RevenueCheckResult[] {
  if (totals.length < 2) {
    return [check({ checkType: "monthly_change", status: "insufficient_data", yearMonth: null, basis: "월별 매출 증빙이 2개월 미만이라 변화를 분석할 수 없음", evidence: [] })];
  }
  const out: RevenueCheckResult[] = [];
  for (let i = 1; i < totals.length; i++) {
    const prev = totals[i - 1];
    const cur = totals[i];
    if (nextMonth(prev.yearMonth) !== cur.yearMonth || prev.amount === 0) continue;
    const change = (cur.amount - prev.amount) / prev.amount;
    const abnormal = Math.abs(change) >= ANALYSIS_BASIS.monthlyChangeWarning;
    out.push(
      check({
        checkType: "monthly_change",
        status: abnormal ? "mismatch" : "verified",
        yearMonth: cur.yearMonth,
        expectedAmount: prev.amount,
        actualAmount: cur.amount,
        basis: abnormal
          ? `전월 대비 ${change > 0 ? "+" : ""}${formatPercent(change)} 급변 (기준 ±${formatPercent(ANALYSIS_BASIS.monthlyChangeWarning)})`
          : `전월 대비 ${change > 0 ? "+" : ""}${formatPercent(change)}`,
        evidence: [...prev.evidence, ...cur.evidence],
      }),
    );
  }
  return out;
}

function checkCompleteness(
  input: AnalysisInput,
  coverage: RevenueAnalysis["coverage"],
  totals: MonthlyRevenueTotal[],
): RevenueCheckResult[] {
  const all = uniqueSorted(Object.values(coverage).flat());
  const out: RevenueCheckResult[] = [];
  if (all.length === 0) {
    return [check({ checkType: "data_completeness", status: "insufficient_data", yearMonth: null, basis: "매출 증빙 자료가 없음", evidence: [] })];
  }
  const range = monthRange(all[0], all[all.length - 1]);
  const required: Source[] = ["pos", "card"];
  if (coverage.delivery_order?.length || coverage.delivery_settlement?.length) {
    required.push("delivery_order", "delivery_settlement");
  }
  for (const source of required) {
    const have = new Set(coverage[source] ?? []);
    const missing = range.filter((m) => !have.has(m));
    if (missing.length === 0) continue;
    out.push(
      check({
        checkType: "data_completeness",
        status: "insufficient_data",
        yearMonth: null,
        basis:
          have.size === 0
            ? `${SOURCE_NAME[source]} 자료 없음`
            : `${SOURCE_NAME[source]} 누락 월: ${missing.map(monthLabel).join(", ")}`,
        evidence: [],
      }),
    );
  }
  if (totals.length < ANALYSIS_BASIS.minEvidenceMonths) {
    out.push(
      check({
        checkType: "data_completeness",
        status: "insufficient_data",
        yearMonth: null,
        basis: `총매출을 확인할 수 있는 기간이 ${totals.length}개월로 최소 기준(${ANALYSIS_BASIS.minEvidenceMonths}개월)보다 짧음`,
        evidence: [],
      }),
    );
  }
  if (out.length === 0) {
    out.push(
      check({
        checkType: "data_completeness",
        status: "verified",
        yearMonth: null,
        basis: `${monthLabel(range[0])}~${monthLabel(range[range.length - 1])} ${range.length}개월간 필수 매출 자료 누락 없음`,
        evidence: [],
      }),
    );
  }
  return out;
}

/** 월별 배달앱 주문액·정산액 합계 (플랫폼 합산, 재업로드 중복 제거) */
export function deliveryByMonth(
  input: AnalysisInput,
): Map<YearMonth, { order: number | null; settlement: number | null; records: RevenueRecord[] }> {
  const { latest } = dedupe(input.revenues);
  const out = new Map<YearMonth, { order: number | null; settlement: number | null; records: RevenueRecord[] }>();
  for (const [ym, m] of byMonth(latest)) {
    if (m.deliveryOrder.length === 0 && m.deliverySettlement.length === 0) continue;
    out.set(ym, {
      order: m.deliveryOrder.length ? sum(m.deliveryOrder.map((r) => r.amount)) : null,
      settlement: m.deliverySettlement.length ? sum(m.deliverySettlement.map((r) => r.amount)) : null,
      records: [...m.deliveryOrder, ...m.deliverySettlement],
    });
  }
  return out;
}

export function analyzeRevenue(input: AnalysisInput): RevenueAnalysis {
  const { latest, conflicts } = dedupe(input.revenues);
  const months = byMonth(latest);
  const coverage: RevenueAnalysis["coverage"] = {};
  for (const r of latest) {
    coverage[r.source] = uniqueSorted([...(coverage[r.source] ?? []), r.yearMonth]);
  }
  const monthlyTotals = resolveMonthlyTotals(input, months);
  const checks = [
    ...checkPosVsCard(input, months),
    ...checkPosVsCash(input, months),
    ...checkDelivery(input, months),
    checkClaimed(input, monthlyTotals),
    ...checkMonthlyChange(input, monthlyTotals),
    ...checkCompleteness(input, coverage, monthlyTotals),
  ].sort((a, b) => (a.yearMonth ?? "").localeCompare(b.yearMonth ?? ""));
  return { checks, monthlyTotals, coverage, conflicts };
}
