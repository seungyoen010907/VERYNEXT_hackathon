/**
 * 종합 분석: 매출 검증 → 수익성 → 권리금 → 위험도를 순서대로 실행하고
 * 검증 수준, 자료 부족 항목, 요약을 만든다. 요약은 계산 결과로 만든 문장이며 AI를 쓰지 않는다.
 */
import { EXPENSE_CATEGORY_LABELS, RISK_LEVEL_ORDER, type VerificationLevel } from "@/types/domain";
import { analyzePremium } from "./premium";
import { analyzeProfit } from "./profit";
import { analyzeRevenue } from "./revenue";
import { assessRisks, overallRiskLevel } from "./risk";
import { ANALYSIS_BASIS, ENGINE_VERSION, type AnalysisInput, type FullAnalysisResult } from "./types";
import { formatPercent, formatWon } from "./util";

export function runFullAnalysis(input: AnalysisInput): FullAnalysisResult {
  const revenue = analyzeRevenue(input);
  const profit = analyzeProfit(input, revenue);
  const premium = analyzePremium(input, profit);
  const risks = assessRisks(input, revenue, profit, premium);

  const claimedCheck = revenue.checks.find((c) => c.checkType === "claimed_vs_evidence");
  const posMonths = revenue.coverage.pos?.length ?? 0;
  const profitKnown = profit.average?.operatingProfit != null;
  let verificationLevel: VerificationLevel = "unverified";
  if (claimedCheck?.status === "verified" && posMonths >= ANALYSIS_BASIS.minEvidenceMonths && profitKnown) {
    verificationLevel = "verified";
  } else if (revenue.monthlyTotals.length > 0 || revenue.checks.some((c) => c.status === "verified")) {
    verificationLevel = "partial";
  }

  const missingData: string[] = [];
  if (posMonths === 0) missingData.push("POS 매출 자료");
  if ((revenue.coverage.card?.length ?? 0) === 0) missingData.push("카드 매출 자료");
  if ((revenue.coverage.delivery_order?.length ?? 0) > 0 && (revenue.coverage.delivery_settlement?.length ?? 0) === 0) {
    missingData.push("배달앱 정산 자료");
  }
  for (const c of profit.average?.missingCostCategories ?? []) missingData.push(`${EXPENSE_CATEGORY_LABELS[c]} 자료`);
  if (!input.documents.some((d) => d.documentType === "lease_contract") && input.contractNotes.length === 0) {
    missingData.push("임대차 계약서");
  }
  if (input.store.claimedMonthlyRevenue === null) missingData.push("양도인 주장 월매출");
  if (input.store.facilityInvestment === null) missingData.push("시설 투자금");

  const overall = overallRiskLevel(risks);
  const serious = risks.filter((r) => RISK_LEVEL_ORDER[r.level] >= RISK_LEVEL_ORDER.HIGH);
  const avg = profit.average;
  const parts: string[] = [];
  if (revenue.monthlyTotals.length > 0) {
    const avgRevenue = avg?.totalRevenue ?? 0;
    parts.push(`증빙 기준 월평균 매출 ${formatWon(avgRevenue)} (${revenue.monthlyTotals.length}개월).`);
  } else {
    parts.push("매출 증빙이 없어 매출을 확인하지 못했습니다.");
  }
  if (avg?.operatingProfit != null) {
    parts.push(
      `월평균 영업이익 ${formatWon(avg.operatingProfit)}, 영업이익률 ${avg.operatingMargin?.toFixed(1)}%${avg.isComplete ? "" : " (일부 비용 미확인, 상한값)"}.`,
    );
  } else {
    parts.push("필수 비용이 확인되지 않아 영업이익을 계산하지 않았습니다.");
  }
  if (premium.paybackStatus === "calculable") parts.push(`단순 투자금 회수 기간 ${premium.paybackMonths}개월.`);
  else if (premium.paybackStatus === "not_recoverable") parts.push("영업이익이 0 이하라 투자금 회수가 불가능합니다.");
  if (claimedCheck?.status === "mismatch" && claimedCheck.differenceRate !== null) {
    parts.push(`양도인 주장 매출과 증빙 매출 차이 ${formatPercent(claimedCheck.differenceRate)}.`);
  }
  parts.push(
    serious.length > 0
      ? `주의가 필요한 위험 ${serious.length}건 (최고 수준 ${overall}).`
      : `HIGH 이상 위험 없음 (최고 수준 ${overall}).`,
  );
  if (missingData.length > 0) parts.push(`부족한 자료: ${missingData.join(", ")}.`);

  return {
    engineVersion: ENGINE_VERSION,
    basis: ANALYSIS_BASIS,
    revenue,
    profit,
    premium,
    risks,
    verificationLevel,
    missingData,
    summary: parts.join(" "),
  };
}
