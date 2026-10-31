/**
 * 권리금 및 투자금 회수 분석
 *
 * 초기 투자금 = 보증금 + 권리금 + 시설 투자금 + 기타 인수 비용
 * 단순 회수 기간 = 초기 투자금 / 월평균 현금흐름
 * 월평균 현금흐름은 수익성 분석의 월평균 영업이익을 사용한다.
 * 시장 거래 데이터가 없으므로 적정 권리금은 판단하지 않는다.
 */
import type { AnalysisInput, PremiumResult, ProfitAnalysisResult } from "./types";
import { formatWon, round } from "./util";

export function analyzePremium(input: AnalysisInput, profit: ProfitAnalysisResult): PremiumResult {
  const { deposit, premium, facilityInvestment, otherInitialCost } = input.store;
  const notes: string[] = [
    "시장 거래 데이터가 없어 적정 권리금 수준은 판단하지 않음",
    "보증금은 계약 종료 시 돌려받는 금액이지만 회수 기간 계산에는 공식대로 포함함",
  ];

  const unknownItems: string[] = [];
  if (facilityInvestment === null) unknownItems.push("시설 투자금");
  if (otherInitialCost === null) unknownItems.push("기타 인수 비용");
  const totalInitialInvestment = deposit + premium + (facilityInvestment ?? 0) + (otherInitialCost ?? 0);
  if (unknownItems.length > 0) {
    notes.push(`${unknownItems.join(", ")} 미입력: 초기 투자금은 입력된 항목만 합산한 최소 금액이며 회수 기간은 실제보다 짧게 계산됨`);
  }

  const avg = profit.average;
  const cashFlow = avg?.operatingProfit ?? null;
  const base = `보증금 ${formatWon(deposit)} + 권리금 ${formatWon(premium)} + 시설 투자금 ${
    facilityInvestment === null ? "미입력" : formatWon(facilityInvestment)
  } + 기타 ${otherInitialCost === null ? "미입력" : formatWon(otherInitialCost)} = ${formatWon(totalInitialInvestment)}`;

  if (cashFlow === null) {
    return {
      deposit,
      premium,
      facilityInvestment,
      otherInitialCost,
      totalInitialInvestment,
      monthlyCashFlow: null,
      paybackMonths: null,
      paybackStatus: "not_calculable",
      marketDataAvailable: false,
      basis: `${base}. 필수 비용이 확인되지 않아 월평균 영업이익을 계산할 수 없음`,
      notes,
    };
  }

  if (!avg!.isComplete) {
    notes.push("일부 비용이 확인되지 않아 월 현금흐름이 실제보다 클 수 있음 (회수 기간은 최소값)");
  }
  if (cashFlow <= 0) {
    return {
      deposit,
      premium,
      facilityInvestment,
      otherInitialCost,
      totalInitialInvestment,
      monthlyCashFlow: cashFlow,
      paybackMonths: null,
      paybackStatus: "not_recoverable",
      marketDataAvailable: false,
      basis: `${base}. 월평균 영업이익이 ${formatWon(cashFlow)}로 0 이하라 투자금을 회수할 수 없음`,
      notes,
    };
  }

  const paybackMonths = round(totalInitialInvestment / cashFlow, 2);
  const premiumMonths = round(premium / cashFlow, 1);
  notes.push(`권리금만 회수하는 데 약 ${premiumMonths}개월 (권리금 ÷ 월평균 영업이익)`);
  notes.push(`보증금 제외 시 회수 기간 약 ${round((totalInitialInvestment - deposit) / cashFlow, 1)}개월`);
  return {
    deposit,
    premium,
    facilityInvestment,
    otherInitialCost,
    totalInitialInvestment,
    monthlyCashFlow: cashFlow,
    paybackMonths,
    paybackStatus: "calculable",
    marketDataAvailable: false,
    basis: `${base} ÷ 월평균 영업이익 ${formatWon(cashFlow)} = ${paybackMonths}개월`,
    notes,
  };
}
