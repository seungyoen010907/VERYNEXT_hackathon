/**
 * AI 거래 분석 실행 관리
 *
 * 실행 조건 (둘 중 하나)
 *  A. 마지막 분석 이후 새 메시지 MESSAGE_THRESHOLD건 이상
 *  B. 마지막 분석 이후 분석이 끝난 새 증빙자료가 있음 (업로드만 되고 분석 전인 문서는 기다린다)
 * 같은 입력(메시지 범위·문서·매물 상태)이면 다시 분석하지 않는다 (deal_ai_runs.input_hash 유일).
 * 기본은 사용자가 '분석 실행'을 눌러야 실행한다. 거래 설정에서 자동 실행을 켤 수 있다.
 *
 * 분석기(provider)
 *  - local-rules: 외부 AI 없이 규칙과 실사 엔진으로 분석한다 (기본, 비용 없음)
 *  - 외부 LLM은 같은 입력(이전 상태 + 새 메시지 + 엔진 결과)을 받는 형태로 추가한다. docs/ai-integration.md 참고.
 */
import { createHash } from "node:crypto";
import { DEAL_STAGE_LABELS, EXPENSE_CATEGORY_LABELS, RISK_LEVEL_ORDER, type DealAiFinding, type DealEvidence } from "@/types/domain";
import { runFullAnalysis } from "../analysis/full";
import { formatWon } from "../analysis/util";
import type { Db } from "../db/client";
import { AppError } from "../errors";
import { loadNormalizedSources } from "../ingest/service";
import { buildInputForStore, refreshStoreAnalysisIfOutdated } from "../repo/analyses";
import { camelize, camelizeAll } from "../repo/mappers";
import { getStore } from "../repo/stores";
import type { Viewer } from "../viewer";
import { analyzeDeal, EMPTY_STATE, type AgentMessage, type AgentResult, type AgentState } from "./analyze";
import { recordDealEvent } from "./events";
import { getDealContext, type DealContext } from "./repo";
import { changeTaskStatus, listTasks, syncTasksFromDocuments, taskTemplates } from "./tasks";

export const MESSAGE_THRESHOLD = 10;
export const PROVIDER = "local-rules";

export interface RunRow {
  id: string;
  dealId: string;
  requestedBy: string | null;
  trigger: "messages" | "documents" | "both";
  fromSeq: number | null;
  toSeq: number | null;
  documentIds: string[];
  inputHash: string;
  provider: string;
  summary: string;
  result: Omit<AgentResult, "state" | "findings"> & { state: AgentState; findingKeys: string[]; resolvedKeys: string[]; analysisId: string | null };
  createdAt: string;
}

export interface Eligibility {
  eligible: boolean;
  reasons: string[];
  newMessages: number;
  threshold: number;
  newDocuments: Array<{ id: string; fileName: string; documentType: string }>;
  pendingDocuments: number;
  lastRun: RunRow | null;
  /** 같은 입력으로 이미 분석함 */
  upToDate: boolean;
}

async function lastRun(db: Db, dealId: string): Promise<RunRow | null> {
  const rows = await db.query(`select * from deal_ai_runs where deal_id = $1 order by created_at desc, to_seq desc nulls last limit 1`, [dealId]);
  return rows[0] ? camelize<RunRow>(rows[0]) : null;
}

export async function listRuns(db: Db, dealId: string): Promise<RunRow[]> {
  return camelizeAll<RunRow>(await db.query(`select * from deal_ai_runs where deal_id = $1 order by created_at desc`, [dealId]));
}

async function analyzedDocuments(db: Db, storeId: string) {
  return db.query<{ id: string; file_name: string; document_type: string }>(
    `select d.id, d.file_name, d.document_type from documents d
      where d.store_id = $1 and d.status = 'analyzed'
        and not exists (select 1 from documents r where r.replaces_document_id = d.id)
      order by d.created_at`,
    [storeId],
  );
}

function inputHash(parts: unknown): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export async function getEligibility(db: Db, ctx: DealContext): Promise<Eligibility> {
  const prev = await lastRun(db, ctx.deal.id);
  const fromSeq = prev?.toSeq ?? 0;
  const [msgs, docs, pending, maxSeq] = await Promise.all([
    db.query<{ n: number }>(`select count(*)::int as n from deal_messages where deal_id = $1 and seq > $2 and kind <> 'system'`, [ctx.deal.id, fromSeq]),
    analyzedDocuments(db, ctx.store.id),
    db.query<{ n: number }>(`select count(*)::int as n from documents where store_id = $1 and status in ('uploaded', 'analyzing') and document_type <> 'other'`, [ctx.store.id]),
    db.query<{ s: number | null }>(`select max(seq) as s from deal_messages where deal_id = $1`, [ctx.deal.id]),
  ]);
  const covered = new Set(prev?.documentIds ?? []);
  const newDocuments = docs.filter((d) => !covered.has(d.id)).map((d) => ({ id: d.id, fileName: d.file_name, documentType: d.document_type }));
  const newMessages = msgs[0].n;
  const reasons: string[] = [];
  if (newMessages >= MESSAGE_THRESHOLD) reasons.push(`새 메시지 ${newMessages}건 (기준 ${MESSAGE_THRESHOLD}건)`);
  if (newDocuments.length > 0) reasons.push(`분석이 끝난 새 증빙자료 ${newDocuments.length}건`);
  const hash = inputHash({ toSeq: maxSeq[0]?.s ?? 0, docs: docs.map((d) => d.id), storeUpdated: ctx.store.updatedAt });
  const upToDate = prev?.inputHash === hash;
  return { eligible: reasons.length > 0 && !upToDate, reasons, newMessages, threshold: MESSAGE_THRESHOLD, newDocuments, pendingDocuments: pending[0].n, lastRun: prev, upToDate };
}

/** 증빙자료 상태로 체크리스트 갱신 (system) */
export async function syncDealTasks(db: Db, ctx: DealContext): Promise<number> {
  const [docs, sources] = await Promise.all([
    db.query<{ id: string; document_type: string; status: string; file_name: string }>(
      `select id, document_type, status, file_name from documents d where store_id = $1
         and (d.deal_id is null or d.uploaded_by = $2)
         and not exists (select 1 from documents r where r.replaces_document_id = d.id)`,
      [ctx.store.id, ctx.store.ownerId],
    ),
    loadNormalizedSources(db, ctx.store.id),
  ]);
  return syncTasksFromDocuments(
    db,
    ctx.deal.id,
    ctx.store.industry,
    docs.map((d) => ({ id: d.id, documentType: d.document_type as never, status: d.status, fileName: d.file_name })),
    sources.map((s) => ({ documentId: s.documentId, payload: s.payload })),
  );
}

async function loadAgentMessages(db: Db, ctx: DealContext, afterSeq: number): Promise<AgentMessage[]> {
  const rows = await db.query<{ id: string; seq: number; body: string; sender_id: string | null; kind: string; document_id: string | null; file_name: string | null }>(
    `select m.id, m.seq, m.body, m.sender_id, m.kind, m.document_id, d.file_name
       from deal_messages m left join documents d on d.id = m.document_id
      where m.deal_id = $1 and m.seq > $2 and m.kind <> 'system' order by m.seq`,
    [ctx.deal.id, afterSeq],
  );
  return rows.map((r) => ({
    id: r.id,
    seq: r.seq,
    body: r.body,
    senderRole: r.sender_id === ctx.deal.sellerId ? "seller" : "buyer",
    kind: r.kind,
    documentId: r.document_id,
    fileName: r.file_name,
  }));
}

/** 분석에 필요한 입력을 모은다. persist=false면 DB를 바꾸지 않는다 (AI 질문 응답용). */
async function buildAgentInput(db: Db, viewer: Viewer, ctx: DealContext, prev: RunRow | null, persist: boolean) {
  // 매물 실사 분석을 최신 자료로 갱신해 결과를 공유한다 (기존 분석 엔진 재사용, 이력 보존)
  let analysisId: string | null = null;
  if (persist) analysisId = await refreshStoreAnalysisIfOutdated(db, ctx.store, viewer);
  if (!analysisId) {
    const latest = await db.query<{ id: string }>(`select id from analyses where store_id = $1 and status = 'completed' order by completed_at desc limit 1`, [ctx.store.id]);
    analysisId = latest[0]?.id ?? null;
  }
  const store = await getStore(db, viewer, ctx.store.id);
  const engineInput = await buildInputForStore(db, store);
  const engine = runFullAnalysis(engineInput);
  const [tasks, newMessages, docs, total] = await Promise.all([
    listTasks(db, ctx.deal.id),
    loadAgentMessages(db, ctx, prev?.toSeq ?? 0),
    analyzedDocuments(db, ctx.store.id),
    db.query<{ n: number; s: number | null }>(`select count(*)::int as n, max(seq) as s from deal_messages where deal_id = $1 and kind <> 'system'`, [ctx.deal.id]),
  ]);
  const covered = new Set(prev?.documentIds ?? []);
  const hasDelivery = engineInput.revenues.some((r) => r.source.startsWith("delivery"));
  return {
    analysisId,
    store,
    docs,
    maxSeq: total[0]?.s ?? 0,
    agentInput: {
      storeName: store.name,
      storeId: store.id,
      dealStage: ctx.deal.stage,
      claimedRevenue: store.claimedMonthlyRevenue,
      claimedProfit: store.claimedMonthlyNetProfit,
      storeRent: store.monthlyRent,
      storeDeposit: store.deposit,
      termsPremium: ctx.deal.terms.premium,
      engine,
      analysisId,
      contractNotes: engineInput.contractNotes,
      newMessages,
      newDocuments: docs.filter((d) => !covered.has(d.id)).map((d) => ({ id: d.id, fileName: d.file_name, documentType: d.document_type })),
      tasks,
      templates: taskTemplates(store.industry, hasDelivery),
      previous: prev?.result.state ?? EMPTY_STATE,
      totalMessages: total[0]?.n ?? 0,
    },
  };
}

export async function runDealAnalysis(db: Db, viewer: Viewer, dealId: string, opts: { force?: boolean } = {}): Promise<RunRow> {
  const ctx = await getDealContext(db, viewer, dealId);
  await syncDealTasks(db, ctx);
  const elig = await getEligibility(db, ctx);
  if (elig.upToDate) throw new AppError(409, "ALREADY_ANALYZED", "마지막 분석 이후 새 메시지나 자료가 없어 다시 분석하지 않습니다.");
  if (!elig.eligible && !opts.force) {
    throw new AppError(
      409,
      "NOT_ELIGIBLE",
      `아직 분석 조건을 충족하지 않았습니다. 새 메시지 ${elig.newMessages}/${MESSAGE_THRESHOLD}건${elig.pendingDocuments ? `, 분석 대기 문서 ${elig.pendingDocuments}건` : ""}.`,
    );
  }
  const started = Date.now();
  const { agentInput, analysisId, docs, maxSeq, store } = await buildAgentInput(db, viewer, ctx, elig.lastRun, true);
  const result = analyzeDeal(agentInput);
  const hash = inputHash({ toSeq: maxSeq, docs: docs.map((d) => d.id), storeUpdated: store.updatedAt });
  const trigger = elig.newMessages >= MESSAGE_THRESHOLD && elig.newDocuments.length ? "both" : elig.newDocuments.length ? "documents" : "messages";

  const run = await db.transaction(async (tx) => {
    const prevOpen = camelizeAll<DealAiFinding>(await tx.query(`select * from deal_ai_findings where deal_id = $1 and status = 'open'`, [dealId]));
    const newKeys = new Set(result.findings.map((f) => f.key));
    const resolvedKeys = prevOpen.filter((f) => !newKeys.has(f.key)).map((f) => f.key);
    const { state, findings, ...rest } = result;
    const rows = await tx.query(
      `insert into deal_ai_runs (deal_id, requested_by, trigger, from_seq, to_seq, document_ids, input_hash, provider, summary, result)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (deal_id, input_hash) do nothing returning *`,
      [dealId, viewer.id, trigger, elig.lastRun?.toSeq ?? 0, maxSeq, JSON.stringify(docs.map((d) => d.id)), hash, PROVIDER, result.summary, JSON.stringify({ ...rest, state, findingKeys: [...newKeys], resolvedKeys, analysisId })],
    );
    if (rows.length === 0) throw new AppError(409, "ALREADY_ANALYZED", "같은 내용으로 이미 분석했습니다.");
    const run = camelize<RunRow>(rows[0]);

    for (const f of findings) {
      const existed = await tx.query<{ id: string; status: string }>(`select id, status from deal_ai_findings where deal_id = $1 and key = $2`, [dealId, f.key]);
      await tx.query(
        `insert into deal_ai_findings (deal_id, key, level, category, title, detail, certainty, evidence, status, first_run_id, last_run_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$9)
         on conflict (deal_id, key) do update set level = excluded.level, category = excluded.category, title = excluded.title,
           detail = excluded.detail, certainty = excluded.certainty, evidence = excluded.evidence, status = 'open',
           last_run_id = excluded.last_run_id, resolved_run_id = null`,
        [dealId, f.key, f.level, f.category, f.title, f.detail, f.certainty, JSON.stringify(f.evidence), run.id],
      );
      const isNew = existed.length === 0 || existed[0].status === "resolved";
      if (isNew && RISK_LEVEL_ORDER[f.level] >= RISK_LEVEL_ORDER.MEDIUM) {
        await recordDealEvent(tx, { dealId, actorKind: "ai", actorId: null, type: "ai_risk_found", title: `[${f.level}] ${f.title}`, detail: { key: f.key, runId: run.id } });
      }
    }
    for (const key of resolvedKeys) {
      const f = prevOpen.find((x) => x.key === key)!;
      await tx.query(`update deal_ai_findings set status = 'resolved', resolved_run_id = $3 where deal_id = $1 and key = $2`, [dealId, key, run.id]);
      await recordDealEvent(tx, { dealId, actorKind: "ai", actorId: null, type: "ai_risk_resolved", title: `해결됨: ${f.title}`, detail: { key, runId: run.id } });
    }

    const tasks = await listTasks(tx, dealId);
    for (const u of result.taskUpdates) {
      const t = tasks.find((x) => x.key === u.taskKey);
      if (t) await changeTaskStatus(tx, t, u.to, { kind: "ai", id: null }, u.note, u.evidence);
    }

    await recordDealEvent(tx, {
      dealId,
      actorKind: "ai",
      actorId: null,
      type: "ai_analysis_completed",
      title: `AI 거래 분석: 위험 ${findings.length}건 (해결 ${resolvedKeys.length}건), 체크리스트 변경 ${result.taskUpdates.length}건`,
      detail: { runId: run.id, trigger, fromSeq: run.fromSeq, toSeq: run.toSeq, provider: PROVIDER },
    });
    return run;
  });
  console.info(JSON.stringify({ level: "info", event: "deal_ai_run", dealId, runId: run.id, provider: PROVIDER, trigger, newMessages: agentInput.newMessages.length, newDocuments: agentInput.newDocuments.length, findings: result.findings.length, ms: Date.now() - started, externalApiCalls: 0 }));
  return run;
}

/** 자동 실행이 켜진 거래에서 조건을 충족하면 분석한다. 실패해도 메시지 전송은 실패시키지 않는다. */
export async function maybeAutoRun(db: Db, viewer: Viewer, dealId: string): Promise<void> {
  try {
    const ctx = await getDealContext(db, viewer, dealId);
    if (!ctx.deal.aiAutoRun) return;
    const elig = await getEligibility(db, ctx);
    if (elig.eligible) await runDealAnalysis(db, viewer, dealId);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", event: "deal_ai_auto_run_failed", dealId, error: String(err) }));
  }
}

export async function listFindings(db: Db, dealId: string): Promise<DealAiFinding[]> {
  const rows = camelizeAll<DealAiFinding>(await db.query(`select * from deal_ai_findings where deal_id = $1`, [dealId]));
  return rows.sort((a, b) => (a.status === b.status ? RISK_LEVEL_ORDER[b.level] - RISK_LEVEL_ORDER[a.level] : a.status === "open" ? -1 : 1));
}

// =============================================================================
// AI에게 질문 (대화형)
// =============================================================================
type Intent = "risk" | "revenue" | "missing" | "questions" | "premium" | "overall" | "next";

const INTENTS: Array<[Intent, RegExp]> = [
  ["missing", /제출(되지|하지|안)|미제출|빠진|없는 자료|누락/],
  ["questions", /질문|물어|확인해야 할 것|무엇을 물/],
  ["next", /다음|할 일|업무|해야 할/],
  ["premium", /권리금|회수|투자금/],
  ["revenue", /매출/],
  ["overall", /종합|인수 위험|평가|전반/],
  ["risk", /위험|문제|리스크|이상/],
];

export function classifyDealQuestion(q: string): Intent {
  for (const [i, re] of INTENTS) if (re.test(q)) return i;
  return "overall";
}

/** 양도인에게는 자료 보완과 업무 관련 답만 한다 (양수인의 검토 내용은 공개하지 않음) */
const SELLER_INTENTS: Intent[] = ["missing", "next"];

function citeLine(ev: DealEvidence[]): string {
  const parts = ev.slice(0, 3).map((e) => (e.kind === "message" && e.seq ? `메시지 #${e.seq}` : e.label));
  return parts.length ? ` [근거: ${parts.join(", ")}]` : "";
}

export async function askDealAgent(db: Db, viewer: Viewer, dealId: string, question: string) {
  const ctx = await getDealContext(db, viewer, dealId);
  const prev = await lastRun(db, dealId);
  const intent = classifyDealQuestion(question);
  const lines: string[] = [];
  const cited: DealEvidence[] = [];

  if (ctx.role === "seller" && !SELLER_INTENTS.includes(intent)) {
    lines.push("양도인 화면에서는 자료 보완과 진행 업무에 대해 답변합니다. 양수인의 검토 내용은 공개하지 않습니다.", "'아직 제출하지 않은 자료가 뭐야?' 또는 '다음에 해야 할 업무를 알려줘'처럼 질문해 주세요.");
  } else {
    // 최신 분석이 있으면 그 결과를, 이후 새 메시지가 있으면 저장하지 않는 미리보기 분석을 함께 쓴다
    const { agentInput } = await buildAgentInput(db, viewer, ctx, prev, false);
    const live = analyzeDeal(agentInput);
    const findings = (await listFindings(db, dealId)).filter((f) => f.status === "open");
    const resolved = (await listFindings(db, dealId)).filter((f) => f.status === "resolved");
    const tasks = await listTasks(db, dealId);
    const liveOnly = live.findings.filter((f) => !findings.some((x) => x.key === f.key));
    const stale = agentInput.newMessages.length > 0 || agentInput.newDocuments.length > 0;
    if (!prev) lines.push("아직 저장된 AI 거래 분석이 없어 현재 대화와 자료로 바로 계산한 결과입니다.");
    else if (stale) lines.push(`마지막 분석 이후 새 메시지 ${agentInput.newMessages.length}건·새 자료 ${agentInput.newDocuments.length}건을 반영해 답합니다 (저장된 분석은 '분석 실행' 시 갱신).`);

    const all = [...findings.map((f) => ({ ...f, live: false })), ...liveOnly.map((f) => ({ ...f, id: "", live: true }))].sort(
      (a, b) => RISK_LEVEL_ORDER[b.level] - RISK_LEVEL_ORDER[a.level],
    );
    switch (intent) {
      case "risk":
      case "overall": {
        if (all.length === 0) lines.push("현재 확인이 필요한 위험이 없습니다.");
        else {
          const serious = all.filter((f) => RISK_LEVEL_ORDER[f.level] >= RISK_LEVEL_ORDER.HIGH);
          lines.push(`확인이 필요한 사항 ${all.length}건 (HIGH 이상 ${serious.length}건)입니다.`);
          for (const f of all.slice(0, intent === "overall" ? 6 : 5)) {
            lines.push(`- [${f.level}·${f.certainty === "fact" ? "확인된 사실" : f.certainty === "suspicion" ? "의심" : "추가 확인 필요"}] ${f.title}: ${f.detail}${citeLine(f.evidence)}`);
            cited.push(...f.evidence.slice(0, 2));
          }
        }
        if (intent === "overall") {
          if (live.verifiedFacts.length) lines.push("", "확인된 사항:", ...live.verifiedFacts.map((v) => `- ${v}`));
          if (resolved.length) lines.push("", `이전 분석 대비 해결된 위험 ${resolved.length}건: ${resolved.map((r) => r.title).join(", ")}`);
          lines.push("", `현재 거래 단계: ${DEAL_STAGE_LABELS[ctx.deal.stage]}. 미완료 업무 ${tasks.filter((t) => t.status !== "done").length}건.`);
          lines.push("이 평가는 제출된 자료와 대화로 계산한 결과이며 사기 여부나 법률적 안전성을 판단하지 않습니다.");
        }
        break;
      }
      case "revenue": {
        const c = live.claimSummary.find((x) => x.type === "revenue");
        const totals = agentInput.engine.revenue.monthlyTotals;
        const avg = totals.length ? Math.round(totals.reduce((a, t) => a + t.amount, 0) / totals.length) : null;
        lines.push(
          `양도인 주장 월매출: ${c ? `${formatWon(c.latest)} (메시지 #${c.seq})` : agentInput.claimedRevenue !== null ? `${formatWon(agentInput.claimedRevenue)} (매물 정보)` : "주장 없음"}`,
          `증빙 기준 월평균: ${avg !== null ? `${formatWon(avg)} (${totals.length}개월, ${totals[0]?.basis ?? ""})` : "매출 증빙 없음"}`,
        );
        const rf = all.filter((f) => f.key.startsWith("claim_vs_evidence:revenue") || f.key.startsWith("contradiction:revenue") || f.category === "revenue_mismatch");
        for (const f of rf) {
          lines.push(`- [${f.level}] ${f.title}: ${f.detail}${citeLine(f.evidence)}`);
          cited.push(...f.evidence.slice(0, 2));
        }
        if (rf.length === 0) lines.push(...live.verifiedFacts.filter((v) => v.includes("매출")).map((v) => `- ${v}`));
        const unverifiable = agentInput.engine.revenue.checks.filter((x) => x.status === "unverifiable");
        if (unverifiable.length) lines.push(`집계 기준이 달라 비교하지 않은 항목 ${unverifiable.length}건이 있습니다.`);
        break;
      }
      case "missing": {
        const open = tasks.filter((t) => t.requestTargetRole === "seller" && ["not_requested", "requested", "needs_more"].includes(t.status));
        if (open.length === 0) lines.push("요청 대상 자료 중 미제출·보완 필요 항목이 없습니다.");
        else {
          lines.push(`아직 제출되지 않았거나 보완이 필요한 자료 ${open.length}건입니다.`);
          for (const t of open) lines.push(`- ${t.title} (${t.status === "needs_more" ? "추가 자료 필요" : t.status === "requested" ? "요청됨" : "미요청"}): ${t.reason}`);
          cited.push(...open.slice(0, 5).map((t) => ({ kind: "task" as const, id: t.id, label: t.title })));
        }
        if (agentInput.engine.profit.average?.missingCostCategories.length) {
          lines.push(`분석에서 확인되지 않은 비용: ${agentInput.engine.profit.average.missingCostCategories.map((c) => EXPENSE_CATEGORY_LABELS[c]).join(", ")}`);
        }
        break;
      }
      case "questions": {
        if (live.questions.length === 0) lines.push("현재 추가로 확인할 질문이 없습니다.");
        else {
          lines.push("양도인에게 다음을 질문해 보세요.");
          for (const q of live.questions) {
            lines.push(`- ${q.text} (${q.reason})${citeLine(q.evidence)}`);
            cited.push(...q.evidence.slice(0, 1));
          }
        }
        break;
      }
      case "premium": {
        const p = agentInput.engine.premium;
        const premium = ctx.deal.terms.premium ?? p.premium;
        lines.push(`협의 중인 권리금 ${formatWon(premium)}, 초기 투자금 ${p.totalInitialInvestment === null ? "계산 불가" : formatWon(p.totalInitialInvestment)} (${p.basis}).`);
        if (p.monthlyCashFlow !== null && p.monthlyCashFlow > 0) {
          lines.push(`증빙 기준 월 영업이익 ${formatWon(p.monthlyCashFlow)} → 권리금은 약 ${(premium / p.monthlyCashFlow).toFixed(1)}개월분, 단순 회수 기간 ${p.paybackMonths}개월.`);
        } else if (p.paybackStatus === "not_recoverable") lines.push("증빙 기준 영업이익이 0 이하라 현재 수익으로는 투자금을 회수할 수 없습니다.");
        else lines.push("영업이익을 계산할 수 없어 회수 기간을 계산하지 않았습니다 (필수 비용 자료 부족).");
        lines.push("시장 거래 데이터가 없어 권리금이 시세보다 높은지는 판단하지 않습니다. 같은 상권 거래 사례를 따로 확인하세요.");
        cited.push({ kind: "analysis", id: agentInput.analysisId, label: "권리금·회수 기간 분석" });
        break;
      }
      case "next": {
        const open = tasks.filter((t) => t.status !== "done" && (ctx.role === "buyer" ? true : t.requestTargetRole === "seller"));
        const order = { needs_more: 0, reviewing: 1, submitted: 2, requested: 3, not_requested: 4, done: 5 } as const;
        open.sort((a, b) => order[a.status] - order[b.status]);
        lines.push(ctx.role === "seller" ? "제출·보완이 필요한 업무입니다." : "다음 실사 업무 순서를 추천합니다.");
        for (const t of open.slice(0, 7)) lines.push(`- ${t.title}: ${t.status === "needs_more" ? "추가 자료 받기" : t.status === "reviewing" ? "제출 자료 검토" : t.status === "submitted" ? "문서 분석 확인" : t.status === "requested" ? "제출 기다리는 중" : "자료 요청"}`);
        if (ctx.role === "buyer" && live.stageSuggestion) lines.push("", `단계 제안: ${DEAL_STAGE_LABELS[live.stageSuggestion.stage]} (${live.stageSuggestion.reason}) · 단계는 직접 변경해야 반영됩니다.`);
        cited.push(...open.slice(0, 5).map((t) => ({ kind: "task" as const, id: t.id, label: t.title })));
        break;
      }
    }
    if (ctx.store.isTestData) lines.push("", "※ 테스트용 가상 매물입니다.");
  }

  const content = lines.join("\n");
  return db.transaction(async (tx) => {
    const rows = await tx.query(
      `insert into deal_ai_messages (deal_id, user_id, role, content, cited) values ($1, $2, 'user', $3, '[]'), ($1, $2, 'assistant', $4, $5) returning *`,
      [dealId, viewer.id, question, content, JSON.stringify(cited.slice(0, 10))],
    );
    return camelizeAll<{ id: string; role: "user" | "assistant"; content: string; cited: DealEvidence[]; createdAt: string }>(rows);
  });
}

export async function listAiMessages(db: Db, viewer: Viewer, dealId: string) {
  await getDealContext(db, viewer, dealId);
  return camelizeAll<{ id: string; role: "user" | "assistant"; content: string; cited: DealEvidence[]; createdAt: string }>(
    await db.query(`select * from deal_ai_messages where deal_id = $1 and user_id = $2 order by created_at, role desc`, [dealId, viewer.id]),
  );
}
