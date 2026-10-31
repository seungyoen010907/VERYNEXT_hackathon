/**
 * 거래 실사 보고서: 매물 실사 보고서(기존) + 거래 진행 정보(단계, 조건, 체크리스트, AI 위험 항목)
 * 양도인에게는 AI 위험 항목을 넣지 않는다.
 */
import type { DealAiFinding, DealTask, DealTerms } from "@/types/domain";
import type { Db } from "../db/client";
import { latestAnalysisSummaries } from "../repo/analyses";
import { camelizeAll } from "../repo/mappers";
import { previewReport, type ReportContent } from "../repo/reports";
import type { Viewer } from "../viewer";
import { listFindings, listRuns } from "./agent";
import { recordDealEvent } from "./events";
import { getDealContext, listTermChanges } from "./repo";
import { listTasks } from "./tasks";

export interface DealReportContent {
  generatedAt: string;
  role: "seller" | "buyer";
  stage: string;
  terms: DealTerms;
  termChanges: Awaited<ReturnType<typeof listTermChanges>>;
  tasks: DealTask[];
  findings: DealAiFinding[];
  aiRuns: Array<{ id: string; createdAt: string; summary: string; fromSeq: number | null; toSeq: number | null }>;
  storeReport: ReportContent | null;
}

export async function buildDealReport(db: Db, viewer: Viewer, dealId: string): Promise<DealReportContent> {
  const ctx = await getDealContext(db, viewer, dealId);
  const summary = (await latestAnalysisSummaries(db, [ctx.store.id])).get(ctx.store.id);
  const [tasks, findings, runs, termChanges] = await Promise.all([listTasks(db, dealId), listFindings(db, dealId), listRuns(db, dealId), listTermChanges(db, dealId)]);
  const storeReport = summary ? (await previewReport(db, viewer, summary.analysisId)).content : null;
  return {
    generatedAt: new Date().toISOString(),
    role: ctx.role,
    stage: ctx.deal.stage,
    terms: ctx.deal.terms,
    termChanges,
    tasks,
    findings: ctx.role === "buyer" ? findings : [],
    aiRuns: ctx.role === "buyer" ? runs.map((r) => ({ id: r.id, createdAt: r.createdAt, summary: r.summary, fromSeq: r.fromSeq, toSeq: r.toSeq })) : [],
    storeReport,
  };
}

export async function saveDealReport(db: Db, viewer: Viewer, dealId: string) {
  const content = await buildDealReport(db, viewer, dealId);
  const rows = await db.query(`insert into deal_reports (deal_id, content, generated_by) values ($1, $2, $3) returning id, created_at`, [dealId, JSON.stringify(content), viewer.id]);
  await recordDealEvent(db, { dealId, actorKind: "user", actorId: viewer.id, type: "report_generated", title: "거래 실사 보고서 저장" });
  return rows[0];
}

export async function listDealReports(db: Db, viewer: Viewer, dealId: string) {
  await getDealContext(db, viewer, dealId);
  return camelizeAll<{ id: string; createdAt: string; generatorName: string | null }>(
    await db.query(
      `select r.id, r.created_at, u.display_name as generator_name from deal_reports r left join users u on u.id = r.generated_by
        where r.deal_id = $1 order by r.created_at desc`,
      [dealId],
    ),
  );
}
