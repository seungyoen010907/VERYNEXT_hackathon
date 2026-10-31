/**
 * AI 상담 답변
 *
 * 답변은 저장된 실사 결과만 근거로 만든다. 저장되지 않은 수치는 만들지 않는다.
 *  - LocalRulesChatProvider: 외부 AI 없이 질문 의도를 분류해 분석 결과에서 답을 구성한다.
 *  - 외부 AI(OpenAI 등)는 API 키가 준비되면 같은 ChatProvider 인터페이스로 연결한다.
 *    그때도 buildChatContext()의 결과만 모델에 전달해 근거 없는 답변을 막는다.
 */
import {
  EXPENSE_CATEGORY_LABELS,
  PAYBACK_STATUS_LABELS,
  VERIFICATION_LEVEL_LABELS,
  VERIFICATION_STATUS_LABELS,
} from "@/types/domain";
import { formatPercent, formatWon } from "../analysis/util";
import type { Checklist } from "../diligence/checklist";
import type { AnalysisBundle } from "../repo/analyses";

export interface ChatAnswer {
  content: string;
  /** 답변 근거로 사용한 분석 결과 ID */
  citedSources: string[];
  provider: string;
}

export interface ChatProvider {
  readonly name: string;
  answer(bundle: AnalysisBundle, checklist: Checklist, question: string): Promise<ChatAnswer>;
}

type Intent = "risk" | "revenue_trust" | "profit" | "premium" | "documents" | "payback" | "summary";

const INTENT_KEYWORDS: Array<[Intent, RegExp]> = [
  ["documents", /자료|서류|요청|제출|증빙/],
  ["payback", /회수|투자금|몇\s*개월|얼마나 걸/],
  ["premium", /권리금|부담/],
  ["revenue_trust", /매출.*(신뢰|믿|사실|맞|부풀|진짜)|주장.*매출/],
  ["profit", /순수익|영업이익|이익|수익|남는/],
  ["risk", /위험|리스크|주의|문제|걱정/],
];

export function classifyIntent(question: string): Intent {
  for (const [intent, re] of INTENT_KEYWORDS) if (re.test(question)) return intent;
  return "summary";
}

const won = (v: number | null | undefined) => (v === null || v === undefined ? "확인되지 않음" : formatWon(v));

export class LocalRulesChatProvider implements ChatProvider {
  readonly name = "local-rules";

  async answer(bundle: AnalysisBundle, checklist: Checklist, question: string): Promise<ChatAnswer> {
    const { analysis, store, revenueChecks, profits, premium, risks } = bundle;
    const avg = profits.find((p) => p.periodType === "average");
    const cited: string[] = [];
    const lines: string[] = [];
    const intent = classifyIntent(question);

    switch (intent) {
      case "risk": {
        if (risks.length === 0) {
          lines.push("탐지된 위험 요소가 없습니다.");
          break;
        }
        lines.push(`탐지된 위험 ${risks.length}건 중 심각도가 높은 순서입니다.`);
        for (const r of risks.slice(0, 3)) {
          lines.push(`- [${r.level}] ${r.title}: ${r.cause}`, `  권장 조치: ${r.recommendedAction}`);
          cited.push(r.id);
        }
        break;
      }
      case "revenue_trust": {
        const c = revenueChecks.find((x) => x.checkType === "claimed_vs_evidence");
        if (!c) {
          lines.push("매출 검증 결과가 없습니다.");
          break;
        }
        cited.push(c.id);
        lines.push(
          `양도인 주장 월매출은 ${won(store.claimedMonthlyRevenue)}, 증빙 기준 월평균 매출은 ${won(c.expectedAmount)}입니다.`,
          `판정: ${VERIFICATION_STATUS_LABELS[c.status]}${c.status === "mismatch" && c.differenceRate !== null ? ` (차이율 ${formatPercent(c.differenceRate)})` : ""}. 근거: ${c.basis}`,
        );
        const others = revenueChecks.filter((x) => x.status === "mismatch" && x.checkType !== "claimed_vs_evidence");
        if (others.length > 0) {
          lines.push(`그 밖에 불일치가 ${others.length}건 있습니다. 예: ${others[0].basis}`);
          cited.push(...others.slice(0, 3).map((o) => o.id));
        }
        const unverifiable = revenueChecks.filter((x) => x.status === "unverifiable");
        if (unverifiable.length > 0) lines.push(`집계 기준 차이로 검증하지 못한 항목이 ${unverifiable.length}건 있습니다.`);
        break;
      }
      case "profit": {
        if (!avg) {
          lines.push("수익성 분석 결과가 없습니다.");
          break;
        }
        cited.push(avg.id);
        if (avg.operatingProfit === null) {
          lines.push(
            `필수 비용(${avg.missingCostCategories.map((c) => EXPENSE_CATEGORY_LABELS[c]).join(", ")})이 확인되지 않아 영업이익을 계산하지 않았습니다.`,
            "비용을 0원으로 가정하면 수익이 과대평가되므로 계산하지 않습니다.",
          );
        } else {
          lines.push(
            `월평균 영업이익은 ${won(avg.operatingProfit)}, 영업이익률은 ${avg.operatingMargin?.toFixed(1)}%입니다 (${avg.revenueBasis}).`,
            `양도인 주장 월순수익은 ${won(store.claimedMonthlyNetProfit)}입니다.`,
          );
          if (!avg.isComplete) {
            lines.push(`${avg.missingCostCategories.map((c) => EXPENSE_CATEGORY_LABELS[c]).join(", ")}은 확인되지 않아 반영하지 않았으므로 실제 이익은 이보다 적을 수 있습니다.`);
          }
        }
        break;
      }
      case "premium":
      case "payback": {
        if (!premium) {
          lines.push("권리금 분석 결과가 없습니다.");
          break;
        }
        cited.push(premium.id);
        lines.push(
          `권리금 ${won(premium.premium)}, 초기 투자금 ${won(premium.totalInitialInvestment)}입니다.`,
          `회수 기간: ${PAYBACK_STATUS_LABELS[premium.paybackStatus]}${premium.paybackMonths !== null ? ` (${premium.paybackMonths}개월)` : ""}. ${premium.basis}`,
        );
        if (intent === "premium") {
          if (premium.monthlyCashFlow && premium.monthlyCashFlow > 0) {
            lines.push(`권리금은 월평균 영업이익의 약 ${(premium.premium / premium.monthlyCashFlow).toFixed(1)}개월분입니다.`);
          }
          lines.push("시장 거래 데이터가 없어 이 권리금이 시세보다 높은지 낮은지는 판단하지 않습니다. 같은 상권 거래 사례를 따로 확인하세요.");
        }
        for (const n of premium.notes) lines.push(`- ${n}`);
        break;
      }
      case "documents": {
        if (checklist.missing.length === 0 && analysis.missingData.length === 0) {
          lines.push("체크리스트 기준으로 추가로 요청할 필수 자료가 없습니다.");
          break;
        }
        lines.push("양도인에게 다음 자료를 요청하세요.");
        for (const i of checklist.missing) lines.push(`- ${i.requestText} (${i.reason})`);
        const fromRisks = [...new Set(risks.flatMap((r) => r.requiredDocuments))];
        if (fromRisks.length > 0) lines.push(`위험 항목 확인용 추가 자료: ${fromRisks.slice(0, 6).join(", ")}`);
        cited.push(...risks.filter((r) => r.requiredDocuments.length > 0).slice(0, 5).map((r) => r.id));
        break;
      }
      case "summary": {
        lines.push(analysis.summary ?? "분석 요약이 없습니다.");
        lines.push(
          `검증 수준: ${VERIFICATION_LEVEL_LABELS[analysis.verificationLevel ?? "unverified"]}, 최고 위험 수준: ${bundle.overallRisk}.`,
          "가장 위험한 부분, 매출 신뢰도, 실제 순수익, 권리금 부담, 추가 요청 자료, 회수 기간에 대해 질문할 수 있습니다.",
        );
        break;
      }
    }
    if (store.isTestData) lines.push("", "※ 테스트용 가상 매물의 분석 결과입니다.");
    return { content: lines.join("\n"), citedSources: [...new Set(cited)], provider: this.name };
  }
}

export function getChatProvider(): ChatProvider {
  // 외부 AI 연동은 API 키 준비 후 추가한다 (STEP 12).
  return new LocalRulesChatProvider();
}

export function chatProviderStatus(): { connected: boolean; label: string } {
  return {
    connected: false,
    label: "외부 AI 미연결: 저장된 분석 결과로 규칙 기반 답변",
  };
}
