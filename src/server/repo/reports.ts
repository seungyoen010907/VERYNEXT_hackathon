/**
 * 종합 실사 보고서
 * 저장된 분석 결과를 9개 섹션으로 묶는다. 계산은 하지 않고 분석 결과를 그대로 옮긴다.
 */
import {
  REVENUE_CHECK_TYPE_LABELS,
  VERIFICATION_LEVEL_LABELS,
  type ProfitAnalysis,
  type Report,
  type RiskLevel,
} from "@/types/domain";
import type { ChecklistItem } from "../diligence/checklist";
import type { Db } from "../db/client";
import { badRequest } from "../errors";
import { assertCanEdit, type Viewer } from "../viewer";
import { recordActivity } from "./activities";
import { getAnalysisBundle, type AnalysisBundle } from "./analyses";
import { getChecklist } from "./diligence";
import { camelize } from "./mappers";

export interface ReportContent {
  version: 1;
  generatedAt: string;
  isTestData: boolean;
  analysisBasis: { engineVersion: string; completedAt: string | null; criteria: Record<string, unknown> };
  verificationLevel: string;
  overallRisk: RiskLevel;
  store: AnalysisBundle["store"];
  revenue: {
    claimed: number | null;
    evidenceAverage: number | null;
    checks: Array<{ type: string; status: string; yearMonth: string | null; basis: string }>;
    unverified: string[];
  };
  profit: { average: ProfitAnalysis | null; monthly: ProfitAnalysis[] };
  premium: AnalysisBundle["premium"];
  risks: Array<{ level: RiskLevel; category: string; title: string; cause: string; requiredDocuments: string[]; recommendedAction: string }>;
  missingData: string[];
  requestedDocuments: Array<Pick<ChecklistItem, "key" | "label" | "reason" | "requestText">>;
  opinion: string[];
}

export function buildReportContent(bundle: AnalysisBundle, missingItems: ChecklistItem[]): ReportContent {
  const { analysis, store, revenueChecks, profits, premium, risks } = bundle;
  const claimedCheck = revenueChecks.find((c) => c.checkType === "claimed_vs_evidence");
  const average = profits.find((p) => p.periodType === "average") ?? null;
  const unverified = revenueChecks
    .filter((c) => c.status === "unverifiable" || c.status === "insufficient_data")
    .map((c) => `${REVENUE_CHECK_TYPE_LABELS[c.checkType]}: ${c.basis}`);

  const opinion: string[] = [];
  if (analysis.summary) opinion.push(analysis.summary);
  const serious = risks.filter((r) => r.level === "CRITICAL" || r.level === "HIGH");
  if (serious.length > 0) {
    opinion.push(`계약 전 다음 사항을 먼저 확인하세요: ${serious.map((r) => r.title).join(", ")}.`);
  }
  if (analysis.verificationLevel !== "verified") {
    opinion.push(
      `검증 수준이 '${VERIFICATION_LEVEL_LABELS[analysis.verificationLevel ?? "unverified"]}'입니다. 부족한 자료를 받은 뒤 재분석을 권장합니다. 자료 부족은 허위 신고를 의미하지 않습니다.`,
    );
  }
  opinion.push("이 보고서는 제출된 자료를 규칙에 따라 계산한 결과이며, 시장 시세 기반의 적정 권리금 판단은 포함하지 않습니다.");

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    isTestData: store.isTestData,
    analysisBasis: { engineVersion: analysis.engineVersion, completedAt: analysis.completedAt, criteria: analysis.basis },
    verificationLevel: analysis.verificationLevel ?? "unverified",
    overallRisk: bundle.overallRisk,
    store,
    revenue: {
      claimed: store.claimedMonthlyRevenue,
      evidenceAverage: claimedCheck?.expectedAmount ?? null,
      checks: revenueChecks.map((c) => ({ type: c.checkType, status: c.status, yearMonth: c.yearMonth, basis: c.basis })),
      unverified,
    },
    profit: { average, monthly: profits.filter((p) => p.periodType === "monthly") },
    premium,
    risks: risks.map((r) => ({
      level: r.level,
      category: r.category,
      title: r.title,
      cause: r.cause,
      requiredDocuments: r.requiredDocuments,
      recommendedAction: r.recommendedAction,
    })),
    missingData: analysis.missingData,
    requestedDocuments: missingItems.map(({ key, label, reason, requestText }) => ({ key, label, reason, requestText })),
    opinion,
  };
}

/** 저장하지 않고 보고서 내용을 만든다 (미리보기). */
export async function previewReport(db: Db, viewer: Viewer, analysisId: string): Promise<{ content: ReportContent; saved: Report | null }> {
  const bundle = await getAnalysisBundle(db, viewer, analysisId);
  if (bundle.analysis.status !== "completed") throw badRequest("완료된 분석만 보고서를 만들 수 있습니다.");
  if (bundle.report) return { content: bundle.report.content as unknown as ReportContent, saved: bundle.report };
  const checklist = await getChecklist(db, bundle.store);
  return { content: buildReportContent(bundle, checklist.missing), saved: null };
}

export async function generateReport(db: Db, viewer: Viewer, analysisId: string): Promise<Report> {
  const bundle = await getAnalysisBundle(db, viewer, analysisId);
  assertCanEdit(viewer, bundle.store);
  if (bundle.analysis.status !== "completed") throw badRequest("완료된 분석만 보고서를 만들 수 있습니다.");
  const checklist = await getChecklist(db, bundle.store);
  const content = buildReportContent(bundle, checklist.missing);
  return db.transaction(async (tx) => {
    const rows = await tx.query(
      `insert into reports (analysis_id, store_id, content, generated_by) values ($1, $2, $3, $4)
       on conflict (analysis_id) do update set content = excluded.content, generated_by = excluded.generated_by, created_at = now()
       returning *`,
      [analysisId, bundle.store.id, JSON.stringify(content), viewer.id],
    );
    await recordActivity(tx, {
      storeId: bundle.store.id,
      actorId: viewer.id,
      type: "report_generated",
      title: "종합 실사 보고서 생성",
      analysisId,
    });
    return camelize<Report>(rows[0]);
  });
}
