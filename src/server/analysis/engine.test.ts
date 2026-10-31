import { describe, expect, it } from "vitest";
import { normalizeExtraction } from "../ingest/normalize";
import { SCENARIOS, type Scenario } from "../seed/scenarios";
import { runFullAnalysis } from "./full";
import { buildAnalysisInput, type NormalizedSource } from "./input";
import type { AnalysisInput } from "./types";

function inputFor(scenario: Scenario, mutate?: (s: Scenario) => void): AnalysisInput {
  const sc = structuredClone(scenario);
  mutate?.(sc);
  const sources: NormalizedSource[] = sc.documents.map((d, i) => ({
    normalizedDataId: `n-${i}`,
    createdAt: `2026-10-01T00:00:0${i}.000Z`,
    documentId: `d-${i}`,
    fileName: d.fileName,
    payload: normalizeExtraction(d.extraction, d.documentType).payload,
  }));
  const docs = sc.documents.map((d, i) => ({ id: `d-${i}`, documentType: d.documentType, status: "analyzed" as const, fileName: d.fileName }));
  return buildAnalysisInput({ id: "s", ...sc.store }, sources, docs, "2026-10-31");
}

const scenario = (key: string) => SCENARIOS.find((s) => s.key === key)!;
const ruleIds = (r: ReturnType<typeof runFullAnalysis>) => r.risks.map((x) => x.ruleId);

describe("정상 매출 카페 (요청서 예시 수치)", () => {
  const result = runFullAnalysis(inputFor(scenario("normal")));

  it("카드·배달 매출을 POS에 중복 합산하지 않는다", () => {
    expect(result.revenue.monthlyTotals).toHaveLength(6);
    for (const t of result.revenue.monthlyTotals) {
      expect(t.method).toBe("pos");
    }
    expect(result.profit.average?.totalRevenue).toBe(30_000_000);
  });

  it("양도인 주장 매출과 POS 매출이 일치한다", () => {
    const claimed = result.revenue.checks.find((c) => c.checkType === "claimed_vs_evidence")!;
    expect(claimed.status).toBe("verified");
    expect(claimed.differenceRate).toBe(0);
  });

  it("POS-카드-배달로 추정한 현금과 현금 자료가 일치한다", () => {
    const cash = result.revenue.checks.filter((c) => c.checkType === "pos_vs_cash");
    expect(cash).toHaveLength(6);
    expect(cash.every((c) => c.status === "verified")).toBe(true);
  });

  it("배달 수수료를 주문액-정산액으로 계산해 비용에 포함한다", () => {
    expect(result.profit.average?.deliveryFee).toBe(1_050_000);
    const src = result.profit.costSources.find((c) => c.category === "delivery_fee")!;
    expect(src.source).toBe("배달앱 주문액 - 정산액");
  });

  it("영업이익 = 총매출 - 총영업비용, 영업이익률을 계산한다", () => {
    const avg = result.profit.average!;
    // 3,000만 - (재료 900 + 인건 500 + 임대 200 + 관리 30 + 공과 70 + 기타 100 + 배달수수료 105)만
    expect(avg.totalOperatingCost).toBe(19_050_000);
    expect(avg.operatingProfit).toBe(10_950_000);
    expect(avg.operatingMargin).toBe(36.5);
  });

  it("광고비가 없으면 0원으로 보지 않고 미확인으로 표시한다", () => {
    const avg = result.profit.average!;
    expect(avg.advertisingCost).toBeNull();
    expect(avg.missingCostCategories).toEqual(["advertising"]);
    expect(avg.isComplete).toBe(false);
  });

  it("초기 투자금과 회수 기간을 계산한다", () => {
    expect(result.premium.totalInitialInvestment).toBe(92_000_000);
    expect(result.premium.paybackStatus).toBe("calculable");
    expect(result.premium.paybackMonths).toBe(8.4);
    expect(result.premium.marketDataAvailable).toBe(false);
  });

  it("HIGH 이상 위험이 없고 검증 수준은 verified", () => {
    expect(result.risks.every((r) => r.level === "LOW" || r.level === "MEDIUM")).toBe(true);
    expect(result.verificationLevel).toBe("verified");
    expect(ruleIds(result)).toContain("LEASE_SPECIAL_TERMS");
  });
});

describe("매출 불일치", () => {
  const result = runFullAnalysis(inputFor(scenario("revenue_mismatch")));

  it("주장 매출이 증빙보다 30% 넘게 많으면 CRITICAL", () => {
    const risk = result.risks.find((r) => r.ruleId === "REV_CLAIMED_MISMATCH")!;
    expect(risk.level).toBe("CRITICAL");
    expect(risk.evidence.length).toBeGreaterThan(0);
    expect(risk.requiredDocuments.length).toBeGreaterThan(0);
  });

  it("카드 매출이 POS를 넘는 월을 찾아낸다", () => {
    const mismatch = result.revenue.checks.filter((c) => c.checkType === "pos_vs_card" && c.status === "mismatch");
    expect(mismatch.map((c) => c.yearMonth)).toEqual(["2026-09-01"]);
    expect(ruleIds(result)).toContain("REV_CARD_OVER_POS");
  });
});

describe("비용 누락", () => {
  const result = runFullAnalysis(inputFor(scenario("missing_costs")));

  it("필수 비용이 없으면 영업이익을 계산하지 않는다", () => {
    expect(result.profit.average?.operatingProfit).toBeNull();
    expect(result.profit.average?.missingCostCategories).toEqual(
      expect.arrayContaining(["labor", "maintenance", "utilities"]),
    );
    expect(ruleIds(result)).toContain("COST_REQUIRED_MISSING");
  });

  it("영업이익이 없으면 회수 기간은 계산 불가, 주장 순수익은 검증 불가(UNKNOWN)", () => {
    expect(result.premium.paybackStatus).toBe("not_calculable");
    expect(result.premium.paybackMonths).toBeNull();
    expect(result.risks.find((r) => r.ruleId === "PROFIT_UNVERIFIABLE")?.level).toBe("UNKNOWN");
  });

  it("계약 잔여 기간 12개월 미만을 HIGH로 표시한다", () => {
    expect(result.risks.find((r) => r.ruleId === "LEASE_SHORT_TERM")?.level).toBe("HIGH");
  });
});

describe("월별 매출 급변", () => {
  const result = runFullAnalysis(inputFor(scenario("monthly_swing")));

  it("마지막 달 급증을 HIGH로 탐지한다", () => {
    const swing = result.revenue.checks.filter((c) => c.checkType === "monthly_change" && c.status === "mismatch");
    expect(swing.map((c) => c.yearMonth)).toEqual(["2026-09-01"]);
    const risk = result.risks.find((r) => r.ruleId === "REV_MONTHLY_SWING")!;
    expect(risk.level).toBe("HIGH");
  });
});

describe("증빙 부족", () => {
  const result = runFullAnalysis(inputFor(scenario("insufficient_evidence")));

  it("POS가 없으면 카드 기반 추정치로 표시하고 불일치로 확정하지 않는다", () => {
    expect(result.revenue.monthlyTotals.every((t) => t.method === "card_cash_delivery")).toBe(true);
    const claimed = result.revenue.checks.find((c) => c.checkType === "claimed_vs_evidence")!;
    expect(claimed.status).toBe("unverifiable");
    expect(ruleIds(result)).not.toContain("REV_CLAIMED_MISMATCH");
  });

  it("자료 부족을 사기로 단정하지 않는다", () => {
    const risk = result.risks.find((r) => r.ruleId === "EVID_NO_POS")!;
    expect(risk.recommendedAction).toContain("허위 신고의 근거가 아니며");
    expect(result.missingData).toEqual(expect.arrayContaining(["POS 매출 자료", "시설 투자금"]));
    expect(ruleIds(result)).toContain("PERIOD_TOO_SHORT");
  });

  it("시설 투자금 미입력 시 초기 투자금을 최소 금액으로 표시한다", () => {
    expect(result.premium.notes.some((n) => n.includes("시설 투자금, 기타 인수 비용 미입력"))).toBe(true);
  });
});

describe("손실 발생 점포", () => {
  const result = runFullAnalysis(inputFor(scenario("loss")));

  it("영업손실이면 회수 불가로 표시한다", () => {
    expect(result.profit.average?.operatingProfit).toBe(-2_400_000);
    expect(result.premium.paybackStatus).toBe("not_recoverable");
    expect(result.premium.paybackMonths).toBeNull();
  });

  it("손실인데 순수익을 주장하면 CRITICAL", () => {
    expect(result.risks.find((r) => r.ruleId === "PROFIT_CLAIM_EXCEEDS")?.level).toBe("CRITICAL");
    expect(ruleIds(result)).toContain("PROFIT_LOSS");
  });
});

describe("집계 기준 차이", () => {
  it("POS의 카드 포함 여부를 모르면 POS↔카드를 검증 불가로 처리한다", () => {
    const result = runFullAnalysis(
      inputFor(scenario("normal"), (s) => {
        const pos = s.documents[0].extraction.revenues as Array<Record<string, unknown>>;
        for (const r of pos) if (r.source === "pos") delete r.includes_card;
      }),
    );
    const checks = result.revenue.checks.filter((c) => c.checkType === "pos_vs_card");
    expect(checks.every((c) => c.status === "unverifiable")).toBe(true);
    expect(result.risks.find((r) => r.ruleId === "REV_UNVERIFIABLE")?.level).toBe("UNKNOWN");
  });

  it("POS가 배달을 포함하지 않으면 POS + 배달 주문액으로 총매출을 계산한다", () => {
    const result = runFullAnalysis(
      inputFor(scenario("normal"), (s) => {
        const pos = s.documents[0].extraction.revenues as Array<Record<string, unknown>>;
        for (const r of pos) if (r.source === "pos") r.includes_delivery = false;
      }),
    );
    expect(result.revenue.monthlyTotals[0].method).toBe("pos_plus_delivery");
    expect(result.profit.average?.totalRevenue).toBe(37_000_000);
  });

  it("같은 월 자료가 재업로드로 바뀌면 최신 자료를 쓰고 충돌을 기록한다", () => {
    const base = inputFor(scenario("normal"));
    const pos = base.revenues.find((r) => r.source === "pos" && r.yearMonth === "2026-04-01")!;
    base.revenues.push({ ...pos, amount: 35_000_000, createdAt: "2026-10-30T00:00:00.000Z", normalizedDataId: "n-new" });
    const result = runFullAnalysis(base);
    expect(result.revenue.monthlyTotals[0].amount).toBe(35_000_000);
    expect(result.revenue.conflicts).toHaveLength(1);
    expect(ruleIds(result)).toContain("REV_CONFLICTING_UPLOADS");
  });
});
