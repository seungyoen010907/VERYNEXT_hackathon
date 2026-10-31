/** 거래 화면용 데이터 조합 */
import type { Db } from "../db/client";
import { latestAnalysisSummaries } from "../repo/analyses";
import { computeProgress } from "../repo/diligence";
import type { Viewer } from "../viewer";
import { getEligibility, listAiMessages, listFindings, listRuns, MESSAGE_THRESHOLD } from "./agent";
import { dealTimeline, getDealContext, getNote, listMessages, listTermChanges, markRead } from "./repo";
import { listDealReports } from "./report";
import { listTaskEvents, listTasks } from "./tasks";

export async function dealWorkspace(db: Db, viewer: Viewer, dealId: string, opts: { markRead?: boolean } = {}) {
  const ctx = await getDealContext(db, viewer, dealId);
  if (opts.markRead) await markRead(db, dealId, viewer.id);
  const summary = (await latestAnalysisSummaries(db, [ctx.store.id])).get(ctx.store.id) ?? null;
  const [messages, tasks, taskEvents, eligibility, runs, findings, aiMessages, note, termChanges, timeline, reports, progress, counterpart] = await Promise.all([
    listMessages(db, ctx),
    listTasks(db, dealId),
    listTaskEvents(db, dealId),
    getEligibility(db, ctx),
    listRuns(db, dealId),
    listFindings(db, dealId),
    listAiMessages(db, viewer, dealId),
    getNote(db, viewer, dealId),
    listTermChanges(db, dealId),
    dealTimeline(db, dealId),
    listDealReports(db, viewer, dealId),
    computeProgress(db, ctx.store, summary ?? undefined),
    db.query<{ display_name: string }>(`select display_name from users where id = $1`, [ctx.counterpartId]),
  ]);
  const isBuyer = ctx.role === "buyer";
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  return {
    ...ctx,
    counterpartName: counterpart[0]?.display_name ?? "상대방",
    summary,
    progress,
    messages,
    tasks,
    taskEvents,
    taskProgress: tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0,
    eligibility: { ...eligibility, lastRun: undefined, threshold: MESSAGE_THRESHOLD },
    // 양수인의 검토 내용(위험 항목·분석 이력)은 양도인에게 보내지 않는다
    runs: isBuyer ? runs : [],
    latestRun: isBuyer ? runs[0] ?? null : null,
    findings: isBuyer ? findings : [],
    aiMessages,
    note,
    termChanges,
    timeline,
    reports,
  };
}

export type DealWorkspace = Awaited<ReturnType<typeof dealWorkspace>>;
