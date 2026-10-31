/**
 * AI 거래 분석 (순수 함수)
 *
 * 입력: 이전 분석 상태 + 이번에 새로 들어온 메시지 + 실사 엔진 결과(매출·수익성·권리금·위험) + 체크리스트
 * 출력: 주장·모순·합의, 증빙 대조 결과, 위험 항목(키로 추적), 추가 질문, 자료 요청 초안, 업무 상태 제안, 단계 제안
 *
 * 원칙
 *  - 이전 분석에서 뽑은 주장·합의는 상태로 넘겨받고, 새 메시지만 읽는다 (중복 분석 방지)
 *  - 확인된 사실 / 의심되는 부분 / 추가 확인 필요를 구분한다. 자료 부족을 사기로 판단하지 않는다.
 *  - 집계 기준이 다른 자료는 실사 엔진의 판정(검증 불가)을 그대로 따른다.
 */
import {
  DEAL_STAGE_FLOW,
  RISK_LEVEL_ORDER,
  type DealEvidence,
  type DealStage,
  type DealTask,
  type DealTaskStatus,
  type FindingCertainty,
  type RiskLevel,
} from "@/types/domain";
import type { FullAnalysisResult } from "../analysis/types";
import { ANALYSIS_BASIS } from "../analysis/types";
import { formatPercent, formatWon } from "../analysis/util";
import { CLAIM_LABELS, STATEMENT_CHECKS, detectRequests, extractClaims, isAgreement, type Claim, type ClaimType } from "./claims";
import { composeRequestMessage, type RequestDraftItem } from "./requests";
import type { TaskTemplate } from "./tasks";

export interface AgentMessage {
  id: string;
  seq: number;
  body: string;
  senderRole: "seller" | "buyer";
  kind: string;
  documentId: string | null;
  fileName: string | null;
}

/** 분석 사이에 이어지는 상태 (deal_ai_runs.result.state) */
export interface AgentState {
  claims: Claim[];
  agreements: Array<{ messageId: string; seq: number; senderRole: string; quote: string }>;
  statements: Array<{ key: string; messageId: string; seq: number; quote: string }>;
  requestedTaskKeys: Array<{ taskKey: string; messageId: string; seq: number }>;
  summaryHistory: string[];
}

export const EMPTY_STATE: AgentState = { claims: [], agreements: [], statements: [], requestedTaskKeys: [], summaryHistory: [] };

export interface AgentFinding {
  key: string;
  level: RiskLevel;
  category: string;
  title: string;
  detail: string;
  certainty: FindingCertainty;
  evidence: DealEvidence[];
}

export interface TaskUpdate {
  taskKey: string;
  to: DealTaskStatus;
  note: string;
  evidence: DealEvidence[];
}

export interface AgentInput {
  storeName: string;
  storeId: string;
  dealStage: DealStage;
  claimedRevenue: number | null;
  claimedProfit: number | null;
  storeRent: number;
  storeDeposit: number;
  termsPremium: number | null;
  /** 실사 엔진 결과 (최신 자료 기준) */
  engine: FullAnalysisResult;
  /** 엔진 결과를 저장한 분석 ID (근거 연결용) */
  analysisId: string | null;
  contractNotes: Array<{ key: string; value: string }>;
  newMessages: AgentMessage[];
  /** 이번 분석에서 처음 보는 분석 완료 문서 */
  newDocuments: Array<{ id: string; fileName: string; documentType: string }>;
  tasks: DealTask[];
  templates: TaskTemplate[];
  previous: AgentState;
  totalMessages: number;
}

export interface AgentResult {
  state: AgentState;
  findings: AgentFinding[];
  verifiedFacts: string[];
  questions: Array<{ text: string; reason: string; evidence: DealEvidence[] }>;
  requests: RequestDraftItem[];
  requestMessage: string | null;
  taskUpdates: TaskUpdate[];
  stageSuggestion: { stage: DealStage; reason: string } | null;
  summary: string;
  claimSummary: Array<{ type: ClaimType; label: string; latest: number; seq: number; values: number[] }>;
}

const msgEv = (m: { messageId: string; seq: number; quote?: string }, label?: string): DealEvidence => ({
  kind: "message",
  id: m.messageId,
  seq: m.seq,
  label: label ?? `#${m.seq} "${(m.quote ?? "").slice(0, 60)}"`,
});

function fmtClaim(c: Claim): string {
  return c.type === "cash_ratio" ? formatPercent(c.value, 0) : formatWon(c.value);
}

function diffLevel(rate: number): RiskLevel {
  return rate > 0.3 ? "CRITICAL" : rate > 0.15 ? "HIGH" : "MEDIUM";
}

export function analyzeDeal(input: AgentInput): AgentResult {
  const { engine } = input;
  const state: AgentState = structuredClone(input.previous);
  const analysisEv: DealEvidence[] = input.analysisId ? [{ kind: "analysis", id: input.analysisId, label: "실사 분석 결과" }] : [{ kind: "store", id: input.storeId, label: "실사 엔진 계산 (최신 자료)" }];

  // 1) 새 메시지만 읽어 주장·합의·확인 필요 발언·자료 요청을 누적한다
  for (const m of input.newMessages) {
    if (m.kind === "system") continue;
    state.claims.push(...extractClaims({ id: m.id, seq: m.seq, body: m.body, senderRole: m.senderRole }));
    if (isAgreement(m.body)) state.agreements.push({ messageId: m.id, seq: m.seq, senderRole: m.senderRole, quote: m.body.slice(0, 120) });
    if (m.senderRole === "seller") {
      for (const chk of STATEMENT_CHECKS) {
        if (chk.re.test(m.body) && !state.statements.some((s) => s.key === chk.key)) {
          state.statements.push({ key: chk.key, messageId: m.id, seq: m.seq, quote: m.body.slice(0, 120) });
        }
      }
    }
    if (m.senderRole === "buyer") {
      for (const taskKey of detectRequests(m.body)) state.requestedTaskKeys.push({ taskKey, messageId: m.id, seq: m.seq });
    }
  }

  const findings: AgentFinding[] = [];
  const verifiedFacts: string[] = [];
  const questions: AgentResult["questions"] = [];
  const sellerClaims = (t: ClaimType) => state.claims.filter((c) => c.type === t && c.senderRole === "seller").sort((a, b) => a.seq - b.seq);

  // 2) 같은 항목에 대한 양도인 발언의 모순
  const claimSummary: AgentResult["claimSummary"] = [];
  for (const type of Object.keys(CLAIM_LABELS) as ClaimType[]) {
    const cs = sellerClaims(type);
    if (cs.length === 0) continue;
    const latest = cs[cs.length - 1];
    claimSummary.push({ type, label: CLAIM_LABELS[type], latest: latest.value, seq: latest.seq, values: cs.map((c) => c.value) });
    const min = Math.min(...cs.map((c) => c.value));
    const max = Math.max(...cs.map((c) => c.value));
    if (cs.length >= 2 && min > 0 && (max - min) / min > 0.05) {
      findings.push({
        key: `contradiction:${type}`,
        level: (max - min) / min > 0.2 ? "HIGH" : "MEDIUM",
        category: "statement_contradiction",
        title: `양도인의 ${CLAIM_LABELS[type]} 발언이 바뀜`,
        detail: `대화에서 ${CLAIM_LABELS[type]}을 ${cs.map((c) => `#${c.seq} ${fmtClaim(c)}`).join(", ")}로 다르게 말했습니다. 어느 기준(기간·포함 범위)의 금액인지 확인하세요.`,
        certainty: "fact",
        evidence: cs.map((c) => msgEv({ messageId: c.messageId, seq: c.seq, quote: c.quote })),
      });
    }
  }

  // 3) 주장 ↔ 증빙 대조 (실사 엔진 결과 사용)
  const revenueClaim = sellerClaims("revenue").at(-1);
  const claimedRev = revenueClaim?.value ?? input.claimedRevenue;
  const totals = engine.revenue.monthlyTotals;
  const evidenceAvg = totals.length ? Math.round(totals.reduce((a, t) => a + t.amount, 0) / totals.length) : null;
  const estimated = totals.some((t) => t.method === "card_cash_delivery");
  const revEv = [...(revenueClaim ? [msgEv(revenueClaim)] : [{ kind: "store" as const, id: input.storeId, label: "매물 정보의 주장 월매출" }]), ...analysisEv];
  if (claimedRev !== null && claimedRev !== undefined) {
    if (evidenceAvg === null) {
      findings.push({
        key: "claim_vs_evidence:revenue",
        level: "HIGH",
        category: "insufficient_revenue_evidence",
        title: "주장 매출을 확인할 증빙이 없음",
        detail: `양도인 주장 월매출 ${formatWon(claimedRev)}을 확인할 POS·카드 매출 자료가 아직 없습니다. 자료가 없다는 것이 허위라는 뜻은 아닙니다.`,
        certainty: "needs_check",
        evidence: revEv,
      });
    } else {
      const rate = (claimedRev - evidenceAvg) / evidenceAvg;
      const within = Math.abs(rate) <= ANALYSIS_BASIS.claimedRevenueTolerance;
      if (within) {
        verifiedFacts.push(`주장 월매출 ${formatWon(claimedRev)}이 증빙 기준 월평균 ${formatWon(evidenceAvg)}과 허용 오차(${formatPercent(ANALYSIS_BASIS.claimedRevenueTolerance, 0)}) 이내${estimated ? " (POS 없이 카드 기반 추정치와 비교)" : ""}`);
      } else if (estimated) {
        findings.push({
          key: "claim_vs_evidence:revenue",
          level: "MEDIUM",
          category: "insufficient_revenue_evidence",
          title: "POS 없이는 주장 매출을 확정할 수 없음",
          detail: `주장 ${formatWon(claimedRev)}, 카드·현금·배달 합산 추정 ${formatWon(evidenceAvg)} (${totals.length}개월). POS 자료가 없어 불일치로 확정하지 않습니다.`,
          certainty: "needs_check",
          evidence: revEv,
        });
      } else if (rate > 0) {
        findings.push({
          key: "claim_vs_evidence:revenue",
          level: diffLevel(rate),
          category: "revenue_mismatch",
          title: "주장 매출이 증빙 매출보다 많음",
          detail: `양도인 주장 ${formatWon(claimedRev)} vs 증빙 월평균 ${formatWon(evidenceAvg)} (${totals.length}개월, ${formatPercent(rate)} 많음). 차이는 사실이며, 과장인지는 산정 기준을 확인해야 합니다.`,
          certainty: "suspicion",
          evidence: [...revEv, ...totals.slice(-3).flatMap((t) => t.evidence.slice(0, 1).map((e) => ({ kind: "document" as const, id: e.documentId ?? null, label: e.description })))],
        });
      } else {
        verifiedFacts.push(`증빙 월평균 매출(${formatWon(evidenceAvg)})이 주장(${formatWon(claimedRev)})보다 많음: 집계 기준 차이일 수 있음`);
      }
    }
  }

  const avg = engine.profit.average;
  const profitClaim = sellerClaims("profit").at(-1);
  const claimedProfit = profitClaim?.value ?? input.claimedProfit;
  const profitEv = [...(profitClaim ? [msgEv(profitClaim)] : [{ kind: "store" as const, id: input.storeId, label: "매물 정보의 주장 순수익" }]), ...analysisEv];
  if (claimedProfit !== null && claimedProfit !== undefined) {
    if (!avg || avg.operatingProfit === null) {
      findings.push({
        key: "claim_vs_evidence:profit",
        level: "MEDIUM",
        category: "missing_costs",
        title: "주장 순수익을 계산으로 확인할 수 없음",
        detail: `필수 비용 자료(${(avg?.missingCostCategories ?? []).join(", ") || "매출·비용"})가 없어 영업이익을 계산하지 않았습니다. 비용을 0원으로 가정하지 않습니다.`,
        certainty: "needs_check",
        evidence: profitEv,
      });
    } else {
      const calc = avg.operatingProfit;
      const over = claimedProfit > calc;
      const rate = calc > 0 ? (claimedProfit - calc) / calc : Infinity;
      if (over && rate > ANALYSIS_BASIS.claimedProfitTolerance) {
        findings.push({
          key: "claim_vs_evidence:profit",
          level: calc <= 0 ? "CRITICAL" : diffLevel(rate),
          category: "profit_exaggeration",
          title: calc <= 0 ? "손실 점포인데 순수익을 주장함" : "주장 순수익이 계산한 영업이익보다 많음",
          detail: `주장 ${formatWon(claimedProfit)} vs 증빙 기준 영업이익 ${formatWon(calc)}${avg.isComplete ? "" : " (일부 비용 미확인, 상한값)"}. 본인 인건비 등 제외한 비용이 있는지 확인하세요.`,
          certainty: "suspicion",
          evidence: profitEv,
        });
      } else {
        verifiedFacts.push(`주장 순수익 ${formatWon(claimedProfit)}이 증빙 기준 영업이익 ${formatWon(calc)}과 크게 다르지 않음${avg.isComplete ? "" : " (일부 비용 미확인)"}`);
      }
    }
  }

  const note = (k: string) => {
    const v = input.contractNotes.find((n) => n.key === k)?.value;
    return v !== undefined ? Number(v) : null;
  };
  for (const [type, key, label, storeValue] of [
    ["rent", "monthly_rent", "월세", input.storeRent],
    ["deposit", "deposit", "보증금", input.storeDeposit],
  ] as const) {
    const said = sellerClaims(type).at(-1);
    const contract = note(key);
    if (said && contract !== null && Math.abs(said.value - contract) > Math.max(10_000, contract * 0.01)) {
      findings.push({
        key: `contract_mismatch:${type}`,
        level: "HIGH",
        category: "lease_contract_caution",
        title: `대화의 ${label}와 임대차 계약서가 다름`,
        detail: `대화 ${formatWon(said.value)} vs 계약서 ${formatWon(contract)}. 실제 납부액을 이체 내역으로 확인하세요.`,
        certainty: "fact",
        evidence: [msgEv(said), { kind: "document", label: "임대차 계약서" }],
      });
    } else if (said && contract === null && Math.abs(said.value - storeValue) > Math.max(10_000, storeValue * 0.01)) {
      findings.push({
        key: `contract_mismatch:${type}`,
        level: "MEDIUM",
        category: "lease_contract_caution",
        title: `대화의 ${label}가 매물 정보와 다름`,
        detail: `대화 ${formatWon(said.value)} vs 매물 정보 ${formatWon(storeValue)}. 임대차 계약서로 확인이 필요합니다.`,
        certainty: "needs_check",
        evidence: [msgEv(said), { kind: "store", id: input.storeId, label: `매물 정보 ${label}` }],
      });
    } else if (said && contract !== null) {
      verifiedFacts.push(`대화의 ${label} ${formatWon(said.value)}이 계약서와 일치`);
    }
  }

  const cashClaim = sellerClaims("cash_ratio").at(-1);
  const hasCash = (engine.revenue.coverage.cash?.length ?? 0) > 0;
  if (cashClaim && !hasCash) {
    findings.push({
      key: "claim:cash_ratio",
      level: cashClaim.value >= 0.2 ? "MEDIUM" : "LOW",
      category: "insufficient_revenue_evidence",
      title: "현금 매출 비중 주장에 대한 증빙 없음",
      detail: `양도인이 현금 비중을 ${formatPercent(cashClaim.value, 0)}로 말했지만 현금 매출 자료가 없습니다. 현금 매출은 카드사 자료로 확인할 수 없습니다.`,
      certainty: "needs_check",
      evidence: [msgEv(cashClaim)],
    });
  }

  // 4) 확인이 필요한 발언
  for (const s of state.statements) {
    const chk = STATEMENT_CHECKS.find((c) => c.key === s.key);
    if (!chk) continue;
    const serious = s.key === "unreported" || s.key === "redevelop";
    findings.push({
      key: `statement:${s.key}`,
      level: serious ? "MEDIUM" : "LOW",
      category: "statement_check",
      title: `확인이 필요한 발언: ${chk.topic}`,
      detail: `양도인 발언(#${s.seq}) "${s.quote.slice(0, 80)}"은 객관적인 자료로 확인되지 않았습니다.`,
      certainty: "needs_check",
      evidence: [msgEv(s)],
    });
    questions.push({ text: chk.question, reason: chk.topic, evidence: [msgEv(s)] });
  }

  // 5) 실사 엔진 위험 (중복 주제 제외)
  const covered = new Set(findings.map((f) => f.category));
  for (const r of engine.risks) {
    if (r.ruleId === "REV_CLAIMED_MISMATCH" && findings.some((f) => f.key === "claim_vs_evidence:revenue")) continue;
    if (r.ruleId === "PROFIT_CLAIM_EXCEEDS" && findings.some((f) => f.key === "claim_vs_evidence:profit")) continue;
    if (r.ruleId === "PROFIT_UNVERIFIABLE" && findings.some((f) => f.key === "claim_vs_evidence:profit")) continue;
    if (r.level === "LOW" && covered.has(r.category)) continue;
    findings.push({
      key: `engine:${r.ruleId}`,
      level: r.level,
      category: r.category,
      title: r.title,
      detail: `${r.cause} · 권장 조치: ${r.recommendedAction}`,
      certainty: r.level === "UNKNOWN" || r.category === "insufficient_revenue_evidence" ? "needs_check" : r.category === "revenue_mismatch" ? "suspicion" : "fact",
      evidence: [...analysisEv, ...r.evidence.slice(0, 3).map((e) => ({ kind: (e.documentId ? "document" : "analysis") as DealEvidence["kind"], id: e.documentId ?? input.analysisId, label: e.description }))],
    });
  }

  // 권리금 관련
  const premium = input.termsPremium;
  if (premium !== null && engine.premium.monthlyCashFlow !== null && engine.premium.monthlyCashFlow > 0) {
    const months = premium / engine.premium.monthlyCashFlow;
    verifiedFacts.push(`협의 중인 권리금 ${formatWon(premium)}은 증빙 기준 월 영업이익의 약 ${months.toFixed(1)}개월분 (시장 시세 판단 아님)`);
  }

  // 6) 업무 상태 제안 (근거 필수)
  const taskUpdates: TaskUpdate[] = [];
  const byKey = new Map(input.tasks.map((t) => [t.key, t]));
  for (const r of state.requestedTaskKeys) {
    const t = byKey.get(r.taskKey);
    if (t && t.status === "not_requested") {
      taskUpdates.push({ taskKey: r.taskKey, to: "requested", note: "양수인이 대화에서 자료를 요청함", evidence: [msgEv({ messageId: r.messageId, seq: r.seq }, `#${r.seq} 자료 요청 메시지`)] });
    }
  }
  const months = (s: "pos" | "card" | "cash" | "delivery_order" | "delivery_settlement") => engine.revenue.coverage[s]?.length ?? 0;
  const checks = engine.revenue.checks;
  const decide = (key: string, done: boolean, needsMore: string | null, okNote: string) => {
    const t = byKey.get(key);
    if (!t || !["submitted", "reviewing", "needs_more"].includes(t.status)) return;
    if (done) taskUpdates.push({ taskKey: key, to: "done", note: okNote, evidence: analysisEv });
    else if (needsMore) taskUpdates.push({ taskKey: key, to: "needs_more", note: needsMore, evidence: analysisEv });
  };
  const posGap = checks.some((c) => c.checkType === "data_completeness" && c.basis.startsWith("POS 매출 누락"));
  decide("pos_sales", months("pos") >= 6 && !posGap, months("pos") < 6 ? `POS 자료 ${months("pos")}개월분: 최소 6개월 필요` : posGap ? "POS 자료 중간에 누락 월이 있음" : null, `POS ${months("pos")}개월분 확인, 누락 월 없음`);
  const cardMismatch = checks.filter((c) => c.checkType === "pos_vs_card" && c.status === "mismatch");
  const cardUnverifiable = checks.some((c) => c.checkType === "pos_vs_card" && c.status === "unverifiable");
  decide(
    "card_sales",
    months("card") >= months("pos") && months("card") > 0 && cardMismatch.length === 0 && !cardUnverifiable,
    cardMismatch.length ? `카드 매출이 POS를 넘는 달 ${cardMismatch.length}건: 해당 월 원본 확인 필요` : cardUnverifiable ? "POS의 카드 포함 여부를 알 수 없어 대조 불가" : `카드 자료 ${months("card")}개월분: POS(${months("pos")}개월)와 같은 기간 필요`,
    "POS와 같은 기간 카드 매출 대조 완료",
  );
  const deliveryBad = checks.some((c) => c.checkType === "delivery_order_vs_settlement" && c.status !== "verified");
  decide("delivery_sales", months("delivery_settlement") > 0 && !deliveryBad, deliveryBad ? "배달 주문액·정산액 관계 확인 필요" : "정산 자료 필요", "배달 주문액·정산액 대조 완료");
  for (const tpl of input.templates) {
    if (!tpl.expenseCategories || tpl.key === "expense_delivery_fee") continue;
    const missing = tpl.expenseCategories.filter((c) => avg?.missingCostCategories.includes(c));
    const monthlyOk = engine.profit.monthly.length > 0;
    decide(tpl.key, monthlyOk && missing.length === 0, missing.length ? `확인되지 않은 항목: ${missing.join(", ")}` : monthlyOk ? null : "매출 기간과 맞춰 볼 수 없음", "분석 기간 전체에서 비용 확인");
  }
  const leaseRisk = engine.risks.find((r) => r.ruleId === "LEASE_RENT_MISMATCH" || r.ruleId === "LEASE_DEPOSIT_MISMATCH");
  decide("lease_contract", input.contractNotes.length > 0 && !leaseRisk, leaseRisk ? leaseRisk.title : input.contractNotes.length === 0 ? "계약서에서 월세·기간을 읽지 못함" : null, "계약서의 월세·보증금이 매물 정보와 일치");

  // 7) 자료 요청 초안 (상대방에게 보내기 전 사용자가 확인)
  const requests: RequestDraftItem[] = [];
  const tplByKey = new Map(input.templates.map((t) => [t.key, t]));
  const updated = new Map(taskUpdates.map((u) => [u.taskKey, u.to]));
  for (const t of input.tasks) {
    const status = updated.get(t.key) ?? t.status;
    const tpl = tplByKey.get(t.key);
    if (t.requestTargetRole !== "seller" || !tpl) continue;
    const needsDoc = !!tpl.documentType || !!tpl.expenseCategories || t.key === "cash_receipts";
    if (!needsDoc) continue;
    if (status === "not_requested" || status === "needs_more") {
      const related = findings.find((f) => (t.key.startsWith("expense") && f.category === "missing_costs") || (t.key === "pos_sales" && f.key === "claim_vs_evidence:revenue") || (t.key === "cash_receipts" && f.key === "claim:cash_ratio") || (t.key === "lease_contract" && f.category === "lease_contract_caution"));
      requests.push({
        taskKey: t.key,
        title: t.title,
        reason: status === "needs_more" ? `추가 자료 필요: ${taskUpdates.find((u) => u.taskKey === t.key)?.note ?? t.reason}` : tpl.reason,
        period: tpl.period ?? null,
        relatedFindingKey: related?.key ?? null,
        target: "seller",
      });
    }
  }
  // 위험과 직접 연결된 요청을 앞으로
  requests.sort((a, b) => Number(!!b.relatedFindingKey) - Number(!!a.relatedFindingKey));
  const topRequests = requests.slice(0, 6);

  // 8) 추가 질문 (계약·운영 업무 중 아직 확인하지 않은 것)
  for (const key of ["landlord_consent", "lease_renewal", "asset_scope", "staff_terms", "permits"]) {
    const t = byKey.get(key);
    if (t && t.status === "not_requested") {
      questions.push({ text: `${t.title}을(를) 확인할 수 있을까요?`, reason: t.reason, evidence: [{ kind: "task", id: t.id, label: t.title }] });
    }
  }
  if (claimedRev && !revenueClaim) {
    questions.push({ text: "매물 정보의 월매출은 어느 기간, 어떤 기준(부가세·배달 포함 여부)으로 계산한 금액인가요?", reason: "주장 매출 산정 기준 확인", evidence: [{ kind: "store", id: input.storeId, label: "매물 정보의 주장 월매출" }] });
  }

  // 9) 다음 단계 제안 (확정은 사용자가 한다)
  let stageSuggestion: AgentResult["stageSuggestion"] = null;
  const idx = DEAL_STAGE_FLOW.indexOf(input.dealStage);
  const docTasks = input.tasks.filter((t) => tplByKey.get(t.key)?.documentType);
  const statusOf = (t: DealTask) => updated.get(t.key) ?? t.status;
  const serious = findings.filter((f) => RISK_LEVEL_ORDER[f.level] >= RISK_LEVEL_ORDER.HIGH);
  if (input.dealStage === "inquiry" && input.totalMessages >= 4) {
    stageSuggestion = { stage: "negotiation", reason: "양측이 대화를 시작했습니다." };
  } else if (idx >= 0 && idx < DEAL_STAGE_FLOW.indexOf("collecting") && docTasks.some((t) => statusOf(t) !== "not_requested")) {
    stageSuggestion = { stage: "collecting", reason: "자료 요청·제출이 시작되었습니다." };
  } else if (input.dealStage === "collecting" && docTasks.filter((t) => ["submitted", "reviewing", "needs_more", "done"].includes(statusOf(t))).length >= Math.ceil(docTasks.length * 0.6)) {
    stageSuggestion = { stage: "diligence", reason: "필수 자료 대부분이 제출되어 검증 단계로 넘어갈 수 있습니다." };
  } else if (input.dealStage === "diligence" && serious.length === 0 && docTasks.every((t) => statusOf(t) === "done")) {
    stageSuggestion = { stage: "terms", reason: "자료 검증이 끝났고 HIGH 이상 위험이 없습니다." };
  }

  findings.sort((a, b) => RISK_LEVEL_ORDER[b.level] - RISK_LEVEL_ORDER[a.level]);
  const summaryParts = [
    input.newMessages.length ? `새 메시지 ${input.newMessages.length}건` : null,
    input.newDocuments.length ? `새 증빙자료 ${input.newDocuments.length}건(${input.newDocuments.map((d) => d.fileName).join(", ")})` : null,
  ].filter(Boolean);
  const summary = [
    `${summaryParts.join(", ") || "변경된 자료"}를 기존 대화 맥락과 함께 검토했습니다.`,
    findings.length ? `확인이 필요한 사항 ${findings.length}건 (HIGH 이상 ${serious.length}건).` : "새로 발견된 위험이 없습니다.",
    topRequests.length ? `우선 요청할 자료: ${topRequests.slice(0, 3).map((r) => r.title).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  state.summaryHistory = [...state.summaryHistory, summary].slice(-10);

  return {
    state,
    findings,
    verifiedFacts,
    questions: questions.slice(0, 8),
    requests: topRequests,
    requestMessage: topRequests.length ? composeRequestMessage(input.storeName, topRequests) : null,
    taskUpdates,
    stageSuggestion,
    summary,
    claimSummary,
  };
}
