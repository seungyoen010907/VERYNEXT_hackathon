/**
 * 위험도 평가 엔진 (규칙 기반)
 *
 * 각 규칙은 판단 근거(evidence)와 추가로 필요한 증빙, 권장 조치를 함께 남긴다.
 * 자료가 부족하다는 사실만으로 허위·사기라고 판단하지 않는다. 자료 부족은 "확인 불가"로 표시한다.
 */
import { EXPENSE_CATEGORY_LABELS as EXPENSE_LABELS, RISK_LEVEL_ORDER, type Evidence, type RiskLevel } from "@/types/domain";
import { describeMissingCosts } from "./profit";
import {
  ANALYSIS_BASIS,
  type AnalysisInput,
  type PremiumResult,
  type ProfitAnalysisResult,
  type RevenueAnalysis,
  type RiskResult,
} from "./types";
import { evidenceFrom, formatPercent, formatWon, monthLabel } from "./util";

const NOT_FRAUD = "자료 부족은 허위 신고의 근거가 아니며, 추가 자료로 확인이 필요하다는 의미입니다.";

const LEASE_KEYWORDS = ["원상복구", "권리금", "양도", "전대", "재건축", "철거", "갱신", "명도"];

function maxLevel(levels: RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>((acc, l) => (RISK_LEVEL_ORDER[l] > RISK_LEVEL_ORDER[acc] ? l : acc), "UNKNOWN");
}

function monthsBetween(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + (td - fd) / 30;
}

function parseAmount(value: string): number | null {
  const v = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(v) ? Math.round(v) : null;
}

function revenueRisks(input: AnalysisInput, revenue: RevenueAnalysis): RiskResult[] {
  const risks: RiskResult[] = [];
  const claimed = revenue.checks.find((c) => c.checkType === "claimed_vs_evidence");

  if (claimed?.status === "mismatch" && claimed.differenceRate !== null) {
    const over = claimed.differenceRate > 0;
    const r = Math.abs(claimed.differenceRate);
    const level: RiskLevel = !over ? "LOW" : r > 0.3 ? "CRITICAL" : r > 0.15 ? "HIGH" : "MEDIUM";
    risks.push({
      ruleId: "REV_CLAIMED_MISMATCH",
      category: "revenue_mismatch",
      level,
      title: over ? "양도인 주장 매출이 증빙 매출보다 많음" : "증빙 매출이 양도인 주장 매출보다 많음",
      cause: claimed.basis,
      evidence: claimed.evidence,
      requiredDocuments: ["POS 월별 매출 원본(기간 전체)", "카드사 매출 승인 내역", "부가세 신고서"],
      recommendedAction: over
        ? "양도인에게 주장 매출의 산정 근거를 요청하고, 권리금은 증빙 매출 기준으로 재협상하세요."
        : "집계 기준(부가세·할인 포함 여부) 차이일 수 있으니 양도인에게 산정 기준을 확인하세요.",
    });
  }

  const cardOver = revenue.checks.filter((c) => c.checkType === "pos_vs_card" && c.status === "mismatch");
  if (cardOver.length > 0) {
    risks.push({
      ruleId: "REV_CARD_OVER_POS",
      category: "revenue_mismatch",
      level: "HIGH",
      title: "카드 매출이 POS 매출을 초과",
      cause: `${cardOver.map((c) => monthLabel(c.yearMonth!)).join(", ")}: ${cardOver[0].basis}`,
      evidence: cardOver.flatMap((c) => c.evidence),
      requiredDocuments: ["해당 월 POS 원본 데이터", "카드사 매출 승인 내역"],
      recommendedAction: "POS 데이터 누락 또는 다른 사업장 매출 혼입 여부를 양도인에게 확인하세요.",
    });
  }

  const cash = revenue.checks.filter((c) => c.checkType === "pos_vs_cash" && c.status === "mismatch");
  if (cash.length > 0) {
    risks.push({
      ruleId: "REV_CASH_MISMATCH",
      category: "revenue_mismatch",
      level: "MEDIUM",
      title: "현금 매출이 POS 기준 추정치와 다름",
      cause: `${cash.map((c) => monthLabel(c.yearMonth!)).join(", ")}: ${cash[0].basis}`,
      evidence: cash.flatMap((c) => c.evidence),
      requiredDocuments: ["현금영수증 발행 내역", "통장 입금 내역"],
      recommendedAction: "현금 매출은 증빙이 약하므로 통장 입금 내역으로 확인하세요.",
    });
  }

  const delivery = revenue.checks.filter((c) => c.checkType === "delivery_order_vs_settlement" && c.status === "mismatch");
  if (delivery.length > 0) {
    risks.push({
      ruleId: "REV_DELIVERY_SETTLEMENT",
      category: "revenue_mismatch",
      level: "MEDIUM",
      title: "배달앱 주문액과 정산액 관계가 비정상",
      cause: `${delivery.map((c) => monthLabel(c.yearMonth!)).join(", ")}: ${delivery[0].basis}`,
      evidence: delivery.flatMap((c) => c.evidence),
      requiredDocuments: ["배달앱 월별 정산서 원본"],
      recommendedAction: "배달앱 관리자 화면의 정산 내역을 직접 확인하세요.",
    });
  }

  if (revenue.conflicts.length > 0) {
    risks.push({
      ruleId: "REV_CONFLICTING_UPLOADS",
      category: "revenue_mismatch",
      level: "MEDIUM",
      title: "같은 월 매출 자료의 금액이 서로 다름",
      cause: revenue.conflicts
        .map((c) => `${monthLabel(c.yearMonth)} ${c.source}${c.platform ? `(${c.platform})` : ""}: ${c.amounts.map(formatWon).join(" / ")}`)
        .join("; "),
      evidence: revenue.conflicts.map((c) => ({
        source: c.source as Evidence["source"],
        description: `재업로드 전후 금액 ${c.amounts.map(formatWon).join(" → ")}`,
        yearMonth: c.yearMonth,
      })),
      requiredDocuments: ["수정 사유 설명", "최종 원본 자료"],
      recommendedAction: "가장 최근 자료로 분석했습니다. 금액이 바뀐 이유를 양도인에게 확인하세요.",
    });
  }

  const unverifiable = revenue.checks.filter((c) => c.status === "unverifiable");
  if (unverifiable.length > 0) {
    risks.push({
      ruleId: "REV_UNVERIFIABLE",
      category: "insufficient_revenue_evidence",
      level: "UNKNOWN",
      title: "집계 기준 차이로 검증할 수 없는 매출 항목",
      cause: [...new Set(unverifiable.map((c) => c.basis))].join("; "),
      evidence: unverifiable.flatMap((c) => c.evidence).slice(0, 12),
      requiredDocuments: ["POS 집계 기준(카드·배달 포함 여부, 부가세 포함 여부) 확인서"],
      recommendedAction: "자료별 집계 기준을 확인한 뒤 다시 분석하세요. " + NOT_FRAUD,
    });
  }

  const hasPos = (revenue.coverage.pos?.length ?? 0) > 0;
  const hasCard = (revenue.coverage.card?.length ?? 0) > 0;
  if (!hasPos && !hasCard) {
    risks.push({
      ruleId: "EVID_NO_REVENUE",
      category: "insufficient_revenue_evidence",
      level: "HIGH",
      title: "매출 증빙 자료 없음",
      cause: "POS 매출과 카드 매출 자료가 모두 제출되지 않아 양도인 주장 매출을 확인할 수 없음",
      evidence: [],
      requiredDocuments: ["POS 월별 매출 자료", "카드사 매출 내역"],
      recommendedAction: "매출 자료가 제출되기 전에는 권리금 협상을 진행하지 마세요. " + NOT_FRAUD,
    });
  } else if (!hasPos) {
    risks.push({
      ruleId: "EVID_NO_POS",
      category: "insufficient_revenue_evidence",
      level: "MEDIUM",
      title: "POS 매출 자료 없음",
      cause: "카드 매출만으로 총매출을 추정하고 있어 현금·기타 매출을 확인할 수 없음",
      evidence: [],
      requiredDocuments: ["POS 월별 매출 자료"],
      recommendedAction: "POS 자료를 요청하세요. " + NOT_FRAUD,
    });
  } else if (!hasCard) {
    risks.push({
      ruleId: "EVID_NO_CARD",
      category: "insufficient_revenue_evidence",
      level: "LOW",
      title: "카드 매출 자료 없음",
      cause: "POS 매출을 제3자 자료(카드사)와 교차 확인할 수 없음",
      evidence: [],
      requiredDocuments: ["카드사 매출 내역 (여신금융협회 매출 조회)"],
      recommendedAction: "카드 매출 자료로 POS 매출을 교차 확인하세요.",
    });
  }
  return risks;
}

function periodRisks(revenue: RevenueAnalysis): RiskResult[] {
  const risks: RiskResult[] = [];
  const ranges = (["pos", "card", "delivery_order"] as const)
    .map((s) => ({ s, months: revenue.coverage[s] ?? [] }))
    .filter((r) => r.months.length > 0)
    .map((r) => ({ ...r, start: r.months[0], end: r.months[r.months.length - 1] }));
  const names = { pos: "POS", card: "카드", delivery_order: "배달앱" };
  if (ranges.length > 1 && new Set(ranges.map((r) => `${r.start}|${r.end}`)).size > 1) {
    risks.push({
      ruleId: "PERIOD_SOURCE_MISMATCH",
      category: "period_mismatch",
      level: "MEDIUM",
      title: "자료별 제출 기간이 서로 다름",
      cause: ranges.map((r) => `${names[r.s]} ${monthLabel(r.start)}~${monthLabel(r.end)}`).join(", "),
      evidence: [],
      requiredDocuments: ["모든 매출 자료를 같은 기간으로 맞춘 자료"],
      recommendedAction: "겹치는 기간만 비교했습니다. 같은 기간의 자료를 요청하세요.",
    });
  }
  const gaps = revenue.checks.filter(
    (c) => c.checkType === "data_completeness" && c.status === "insufficient_data" && c.basis.includes("누락 월"),
  );
  if (gaps.length > 0) {
    risks.push({
      ruleId: "PERIOD_MISSING_MONTHS",
      category: "period_mismatch",
      level: "MEDIUM",
      title: "중간에 빠진 월이 있음",
      cause: gaps.map((g) => g.basis).join("; "),
      evidence: [],
      requiredDocuments: ["누락 월 자료"],
      recommendedAction: "누락 월에 매출이 낮았는지 확인하세요. " + NOT_FRAUD,
    });
  }
  if (revenue.monthlyTotals.length > 0 && revenue.monthlyTotals.length < ANALYSIS_BASIS.minEvidenceMonths) {
    risks.push({
      ruleId: "PERIOD_TOO_SHORT",
      category: "period_mismatch",
      level: "MEDIUM",
      title: "매출 증빙 기간이 짧음",
      cause: `총매출 확인 기간 ${revenue.monthlyTotals.length}개월 (최소 ${ANALYSIS_BASIS.minEvidenceMonths}개월 필요)`,
      evidence: [],
      requiredDocuments: [`최근 ${Math.max(6, ANALYSIS_BASIS.minEvidenceMonths)}개월 이상 매출 자료`],
      recommendedAction: "계절 변동을 볼 수 있도록 6~12개월 자료를 요청하세요.",
    });
  }
  return risks;
}

function swingRisks(revenue: RevenueAnalysis): RiskResult[] {
  const swings = revenue.checks.filter((c) => c.checkType === "monthly_change" && c.status === "mismatch");
  if (swings.length === 0) return [];
  const last = revenue.monthlyTotals[revenue.monthlyTotals.length - 1]?.yearMonth;
  const lastSpike = swings.find((s) => s.yearMonth === last && (s.differenceRate ?? 0) > 0);
  const maxAbs = Math.max(...swings.map((s) => Math.abs(s.differenceRate ?? 0)));
  const level: RiskLevel = lastSpike || maxAbs >= ANALYSIS_BASIS.monthlyChangeHigh ? "HIGH" : "MEDIUM";
  return [
    {
      ruleId: "REV_MONTHLY_SWING",
      category: "abnormal_monthly_change",
      level,
      title: lastSpike ? "최근 월 매출 급증 (매도 직전 매출 부풀리기 가능성)" : "특정 월 매출 급변",
      cause: swings.map((s) => `${monthLabel(s.yearMonth!)} ${s.basis}`).join("; "),
      evidence: swings.flatMap((s) => s.evidence),
      requiredDocuments: ["급변 월의 일별 매출 내역", "해당 월 특이사항(행사·단체 주문) 설명"],
      recommendedAction: lastSpike
        ? "급증한 월을 제외한 평균 매출로 수익성을 다시 판단하세요."
        : "급변 사유를 확인하고 계절성인지 일회성인지 구분하세요.",
    },
  ];
}

function costRisks(input: AnalysisInput, profit: ProfitAnalysisResult): RiskResult[] {
  const avg = profit.average;
  if (!avg) return [];
  const risks: RiskResult[] = [];
  if (avg.operatingProfit === null) {
    risks.push({
      ruleId: "COST_REQUIRED_MISSING",
      category: "missing_costs",
      level: "HIGH",
      title: "필수 비용 자료 누락",
      cause: `${describeMissingCosts(avg.missingCostCategories)} 자료가 없어 영업이익을 계산할 수 없음`,
      evidence: [],
      requiredDocuments: avg.missingCostCategories.map((c) => `${describeMissingCosts([c])} 지출 증빙`),
      recommendedAction: "누락된 비용 자료를 요청하세요. 비용을 0원으로 가정하면 수익이 과대평가됩니다.",
    });
  } else if (avg.missingCostCategories.length > 0) {
    risks.push({
      ruleId: "COST_OPTIONAL_MISSING",
      category: "missing_costs",
      level: "LOW",
      title: "일부 비용 확인 안 됨",
      cause: `${describeMissingCosts(avg.missingCostCategories)} 자료가 없어 영업이익은 확인된 비용 기준 상한값임`,
      evidence: [],
      requiredDocuments: avg.missingCostCategories.map((c) => `${describeMissingCosts([c])} 지출 증빙`),
      recommendedAction: "해당 비용이 실제로 없는지 양도인에게 확인하세요.",
    });
  }
  // 같은 비용 항목·월이 여러 문서에서 들어오면 합산하되, 같은 내역이 중복 제출된 것인지 확인을 요청한다
  const seen = new Map<string, Set<string>>();
  for (const e of input.expenses) {
    const k = `${e.category}|${e.yearMonth}`;
    seen.set(k, new Set([...(seen.get(k) ?? []), e.normalizedDataId ?? "manual"]));
  }
  const dupKeys = [...seen.entries()].filter(([, ids]) => ids.size > 1).map(([k]) => k);
  if (dupKeys.length > 0) {
    const cats = [...new Set(dupKeys.map((k) => k.split("|")[0]))] as Array<keyof typeof EXPENSE_LABELS>;
    risks.push({
      ruleId: "COST_MULTIPLE_SOURCES",
      category: "missing_costs",
      level: "MEDIUM",
      title: "같은 비용이 여러 자료에서 확인됨 (중복 합산 가능성)",
      cause: `${cats.map((c) => EXPENSE_LABELS[c]).join(", ")} 항목이 같은 달에 서로 다른 자료 ${Math.max(...dupKeys.map((k) => seen.get(k)!.size))}건에서 들어와 합산했습니다 (${dupKeys.length}건)`,
      evidence: [],
      requiredDocuments: ["비용 자료별 포함 범위 설명 (거래처별 분리 내역인지, 같은 장부의 사본인지)"],
      recommendedAction: "같은 장부를 다른 형식으로 다시 제출한 것이라면 한 건을 재업로드로 대체하세요. 합산이 맞으면 그대로 두면 됩니다.",
    });
  }
  const rentSource = profit.costSources.find((c) => c.category === "rent")?.source ?? "";
  if (rentSource.includes("양도인 입력")) {
    risks.push({
      ruleId: "COST_RENT_UNVERIFIED",
      category: "missing_costs",
      level: "LOW",
      title: "임대료가 증빙으로 확인되지 않음",
      cause: `양도인 입력 월세 ${formatWon(input.store.monthlyRent)}를 사용함`,
      evidence: [{ source: "store", description: `양도인 입력 월세 ${formatWon(input.store.monthlyRent)}`, value: input.store.monthlyRent }],
      requiredDocuments: ["임대차 계약서", "월세 이체 내역"],
      recommendedAction: "임대차 계약서로 월세와 관리비를 확인하세요.",
    });
  }
  return risks;
}

function profitRisks(input: AnalysisInput, profit: ProfitAnalysisResult): RiskResult[] {
  const avg = profit.average;
  const claimed = input.store.claimedMonthlyNetProfit;
  const risks: RiskResult[] = [];
  const calc = avg?.operatingProfit ?? null;
  const claimedEv: Evidence = {
    source: "store",
    description: claimed === null ? "양도인 주장 순수익 미입력" : `양도인 주장 월순수익 ${formatWon(claimed)}`,
    value: claimed,
  };

  if (calc !== null && calc <= 0) {
    risks.push({
      ruleId: "PROFIT_LOSS",
      category: "profit_exaggeration",
      level: "HIGH",
      title: "영업손실 발생",
      cause: `월평균 영업이익 ${formatWon(calc)} (${avg!.revenueBasis})`,
      evidence: [claimedEv],
      requiredDocuments: [],
      recommendedAction: "현재 운영 방식으로는 투자금을 회수할 수 없습니다. 비용 구조 개선 가능성을 먼저 검토하세요.",
    });
  }
  if (claimed === null) return risks;
  if (calc === null) {
    risks.push({
      ruleId: "PROFIT_UNVERIFIABLE",
      category: "profit_exaggeration",
      level: "UNKNOWN",
      title: "양도인 주장 순수익 검증 불가",
      cause: "필수 비용 또는 매출 자료가 부족해 영업이익을 계산할 수 없음",
      evidence: [claimedEv],
      requiredDocuments: ["비용 지출 증빙 전체"],
      recommendedAction: "비용 자료를 받은 뒤 다시 분석하세요. " + NOT_FRAUD,
    });
    return risks;
  }
  if (claimed > calc) {
    const r = calc > 0 ? (claimed - calc) / calc : Infinity;
    if (r > ANALYSIS_BASIS.claimedProfitTolerance) {
      const level: RiskLevel = calc <= 0 ? "CRITICAL" : r > 0.3 ? "HIGH" : "MEDIUM";
      risks.push({
        ruleId: "PROFIT_CLAIM_EXCEEDS",
        category: "profit_exaggeration",
        level,
        title: "양도인 주장 순수익이 계산한 영업이익보다 많음",
        cause: `주장 ${formatWon(claimed)} vs 계산 ${formatWon(calc)}${calc > 0 ? ` (${formatPercent(r)} 많음)` : ""}${avg!.isComplete ? "" : ". 일부 비용 미확인으로 계산값도 상한값임"}`,
        evidence: [claimedEv],
        requiredDocuments: ["종합소득세 신고서", "비용 지출 증빙"],
        recommendedAction: "순수익 산정 시 제외한 비용(인건비·본인 인건비 등)이 있는지 확인하세요.",
      });
    }
  }
  return risks;
}

function leaseRisks(input: AnalysisInput): RiskResult[] {
  const risks: RiskResult[] = [];
  const hasLeaseDoc = input.documents.some((d) => d.documentType === "lease_contract" && d.status !== "failed");
  if (!hasLeaseDoc && input.contractNotes.length === 0) {
    return [
      {
        ruleId: "LEASE_MISSING",
        category: "lease_contract_caution",
        level: "MEDIUM",
        title: "임대차 계약서 미제출",
        cause: "계약 기간, 월세, 특약 사항을 확인할 수 없음",
        evidence: [],
        requiredDocuments: ["임대차 계약서 사본"],
        recommendedAction: "계약 잔여 기간과 권리금 관련 특약을 반드시 확인하세요.",
      },
    ];
  }
  const ev = (key: string, label: string) =>
    input.contractNotes
      .filter((n) => n.key === key)
      .map((n) => evidenceFrom(input, "lease_contract", `${label}: ${n.value}`, n.normalizedDataId, null, null));

  const end = input.contractNotes.find((n) => n.key === "contract_end_date");
  if (end && /^\d{4}-\d{2}-\d{2}$/.test(end.value)) {
    const remain = monthsBetween(input.asOf, end.value);
    if (remain < 24) {
      risks.push({
        ruleId: "LEASE_SHORT_TERM",
        category: "lease_contract_caution",
        level: remain < 12 ? "HIGH" : "MEDIUM",
        title: "임대차 계약 잔여 기간이 짧음",
        cause: `계약 종료일 ${end.value}, 잔여 약 ${Math.max(0, Math.floor(remain))}개월`,
        evidence: ev("contract_end_date", "계약 종료일"),
        requiredDocuments: ["임대인의 계약 갱신 의사 확인서"],
        recommendedAction: "계약 갱신 가능 여부와 임대료 인상 조건을 임대인에게 직접 확인하세요.",
      });
    }
  }
  const rentNote = input.contractNotes.find((n) => n.key === "monthly_rent");
  const rent = rentNote ? parseAmount(rentNote.value) : null;
  if (rent !== null && rent !== input.store.monthlyRent) {
    risks.push({
      ruleId: "LEASE_RENT_MISMATCH",
      category: "lease_contract_caution",
      level: "HIGH",
      title: "계약서 월세와 입력 월세가 다름",
      cause: `계약서 ${formatWon(rent)}, 양도인 입력 ${formatWon(input.store.monthlyRent)}`,
      evidence: ev("monthly_rent", "계약서 월세"),
      requiredDocuments: ["최근 월세 이체 내역"],
      recommendedAction: "실제 납부 월세를 확인하고 수익성 분석은 계약서 금액을 기준으로 보세요.",
    });
  }
  const depositNote = input.contractNotes.find((n) => n.key === "deposit");
  const deposit = depositNote ? parseAmount(depositNote.value) : null;
  if (deposit !== null && deposit !== input.store.deposit) {
    risks.push({
      ruleId: "LEASE_DEPOSIT_MISMATCH",
      category: "lease_contract_caution",
      level: "MEDIUM",
      title: "계약서 보증금과 입력 보증금이 다름",
      cause: `계약서 ${formatWon(deposit)}, 양도인 입력 ${formatWon(input.store.deposit)}`,
      evidence: ev("deposit", "계약서 보증금"),
      requiredDocuments: ["보증금 입금 확인서"],
      recommendedAction: "보증금 승계 조건을 계약서 기준으로 정리하세요.",
    });
  }
  const terms = input.contractNotes.filter(
    (n) => n.key === "special_terms" && LEASE_KEYWORDS.some((k) => n.value.includes(k)),
  );
  if (terms.length > 0) {
    risks.push({
      ruleId: "LEASE_SPECIAL_TERMS",
      category: "lease_contract_caution",
      level: "MEDIUM",
      title: "주의가 필요한 계약 특약",
      cause: terms.map((t) => t.value).join(" / "),
      evidence: terms.map((t) => evidenceFrom(input, "lease_contract", `특약: ${t.value}`, t.normalizedDataId, null, null)),
      requiredDocuments: [],
      recommendedAction: "원상복구·권리금·양도 관련 특약은 계약 전 전문가 검토를 받으세요.",
    });
  }
  return risks;
}

export function assessRisks(
  input: AnalysisInput,
  revenue: RevenueAnalysis,
  profit: ProfitAnalysisResult,
  premium: PremiumResult,
): RiskResult[] {
  const risks = [
    ...revenueRisks(input, revenue),
    ...periodRisks(revenue),
    ...swingRisks(revenue),
    ...costRisks(input, profit),
    ...profitRisks(input, profit),
    ...leaseRisks(input),
  ];
  if (premium.paybackStatus === "calculable" && premium.paybackMonths !== null && premium.paybackMonths > 60) {
    risks.push({
      ruleId: "PREMIUM_LONG_PAYBACK",
      category: "profit_exaggeration",
      level: "MEDIUM",
      title: "투자금 회수 기간이 5년을 넘음",
      cause: premium.basis,
      evidence: [],
      requiredDocuments: [],
      recommendedAction: "권리금이 수익성에 비해 높을 수 있습니다. 시세 자료를 따로 확인하세요.",
    });
  }
  return risks.sort((a, b) => RISK_LEVEL_ORDER[b.level] - RISK_LEVEL_ORDER[a.level]);
}

/** 위험 목록의 최고 수준. 위험이 없으면 LOW, 자료가 없어 판단 불가면 UNKNOWN. */
export function overallRiskLevel(risks: ReadonlyArray<{ level: RiskLevel }>): RiskLevel {
  if (risks.length === 0) return "LOW";
  const known = risks.filter((r) => r.level !== "UNKNOWN");
  return known.length === 0 ? "UNKNOWN" : maxLevel(known.map((r) => r.level));
}
