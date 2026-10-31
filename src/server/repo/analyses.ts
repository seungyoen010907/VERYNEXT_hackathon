import { z } from "zod";
import {
  RISK_LEVEL_ORDER,
  type Analysis,
  type PremiumAnalysis,
  type ProfitAnalysis,
  type Report,
  type RevenueVerification,
  type RiskAssessment,
  type RiskLevel,
  type Store,
} from "@/types/domain";
import { runFullAnalysis } from "../analysis/full";
import { buildAnalysisInput } from "../analysis/input";
import { overallRiskLevel } from "../analysis/risk";
import { ANALYSIS_BASIS, ENGINE_VERSION, type AnalysisInput, type FullAnalysisResult } from "../analysis/types";
import { pgArray, type Db } from "../db/client";
import { AppError, notFound } from "../errors";
import { loadNormalizedSources } from "../ingest/service";
import { assertCanEdit, type Viewer } from "../viewer";
import { recordActivity } from "./activities";
import { camelize, camelizeAll } from "./mappers";
import { getEditableStore, getStore, setStoreStatus } from "./stores";

export const ANALYSIS_PARTS = ["revenue", "profit", "premium", "risk"] as const;
export type AnalysisPart = (typeof ANALYSIS_PARTS)[number];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function buildInputForStore(db: Db, store: Store, asOf = today()): Promise<AnalysisInput> {
  const sources = await loadNormalizedSources(db, store.id);
  const docs = await db.query<{ id: string; document_type: string; status: string; file_name: string }>(
    `select id, document_type, status, file_name from documents d
      where store_id = $1 and not exists (select 1 from documents r where r.replaces_document_id = d.id)`,
    [store.id],
  );
  return buildAnalysisInput(
    store,
    sources,
    docs.map((d) => camelize(d)),
    asOf,
  );
}

async function storeResults(db: Db, analysisId: string, storeId: string, result: FullAnalysisResult, parts: readonly AnalysisPart[]) {
  if (parts.includes("revenue")) {
    await db.query(`delete from revenue_verifications where analysis_id = $1`, [analysisId]);
    for (const c of result.revenue.checks) {
      await db.query(
        `insert into revenue_verifications (analysis_id, store_id, check_type, status, year_month, expected_amount,
           actual_amount, difference_amount, difference_rate, basis, evidence)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [analysisId, storeId, c.checkType, c.status, c.yearMonth, c.expectedAmount, c.actualAmount, c.differenceAmount, c.differenceRate, c.basis, JSON.stringify(c.evidence)],
      );
    }
  }
  if (parts.includes("profit")) {
    await db.query(`delete from profit_analyses where analysis_id = $1`, [analysisId]);
    const rows = [...result.profit.monthly, ...(result.profit.average ? [result.profit.average] : [])];
    for (const p of rows) {
      await db.query(
        `insert into profit_analyses (analysis_id, store_id, period_type, year_month, total_revenue, revenue_basis,
           material_cost, labor_cost, rent_cost, maintenance_cost, utilities_cost, delivery_fee, advertising_cost,
           other_cost, total_operating_cost, operating_profit, operating_margin, missing_cost_categories, is_complete)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [analysisId, storeId, p.periodType, p.yearMonth, p.totalRevenue, p.revenueBasis, p.materialCost, p.laborCost, p.rentCost, p.maintenanceCost, p.utilitiesCost, p.deliveryFee, p.advertisingCost, p.otherCost, p.totalOperatingCost, p.operatingProfit, p.operatingMargin, pgArray(p.missingCostCategories), p.isComplete],
      );
    }
  }
  if (parts.includes("premium")) {
    const p = result.premium;
    await db.query(`delete from premium_analyses where analysis_id = $1`, [analysisId]);
    await db.query(
      `insert into premium_analyses (analysis_id, store_id, deposit, premium, facility_investment, other_initial_cost,
         total_initial_investment, monthly_cash_flow, payback_months, payback_status, market_data_available, basis, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [analysisId, storeId, p.deposit, p.premium, p.facilityInvestment, p.otherInitialCost, p.totalInitialInvestment, p.monthlyCashFlow, p.paybackMonths, p.paybackStatus, p.marketDataAvailable, p.basis, JSON.stringify(p.notes)],
    );
  }
  if (parts.includes("risk")) {
    await db.query(`delete from risk_assessments where analysis_id = $1`, [analysisId]);
    for (const r of result.risks) {
      await db.query(
        `insert into risk_assessments (analysis_id, store_id, rule_id, category, level, title, cause, evidence,
           required_documents, recommended_action)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [analysisId, storeId, r.ruleId, r.category, r.level, r.title, r.cause, JSON.stringify(r.evidence), pgArray(r.requiredDocuments), r.recommendedAction],
      );
    }
  }
}

/** 분석을 실행한다. parts 가 전체면 분석을 완료 처리하고 점포 상태와 활동 기록을 갱신한다. */
async function execute(db: Db, viewer: Viewer, analysis: Analysis, store: Store, parts: readonly AnalysisPart[]): Promise<FullAnalysisResult> {
  const input = await buildInputForStore(db, store);
  const result = runFullAnalysis(input);
  const full = ANALYSIS_PARTS.every((p) => parts.includes(p));
  await db.transaction(async (tx) => {
    await storeResults(tx, analysis.id, store.id, result, parts);
    const snapshot = {
      asOf: input.asOf,
      normalizedDataIds: Object.keys(input.sourceDocuments),
      documentIds: input.documents.map((d) => d.id),
      /** 비용 항목별 출처 (증빙 / 계약서 / 양도인 입력 / 확인 안 됨) */
      costSources: result.profit.costSources,
      /** 월별 총매출 산정 방식과 주의 사항 */
      revenueMethods: result.revenue.monthlyTotals.map((t) => ({ yearMonth: t.yearMonth, method: t.method, caveats: t.caveats })),
    };
    if (!full) {
      await tx.query(
        `update analyses set status = 'running', started_at = coalesce(started_at, now()), input_snapshot = $2 where id = $1`,
        [analysis.id, JSON.stringify(snapshot)],
      );
      return;
    }
    await tx.query(
      `update analyses set status = 'completed', input_snapshot = $2, basis = $3, verification_level = $4,
         missing_data = $5, summary = $6, started_at = coalesce(started_at, now()), completed_at = now()
       where id = $1`,
      [analysis.id, JSON.stringify(snapshot), JSON.stringify(result.basis), result.verificationLevel, JSON.stringify(result.missingData), result.summary],
    );
    // 핵심 항목이 증빙으로 확인되면 검증 완료. 선택 자료(광고비 등) 부족은 보고서의 부족 자료로만 표시한다.
    await setStoreStatus(tx, store.id, result.verificationLevel === "verified" ? "verified" : "needs_more_documents");
    const level = overallRiskLevel(result.risks);
    await recordActivity(tx, {
      storeId: store.id,
      actorId: viewer.id,
      type: "analysis_completed",
      title: `실사 분석 완료 (검증 수준: ${result.verificationLevel}, 최고 위험 ${level})`,
      analysisId: analysis.id,
    });
    for (const r of result.risks.filter((x) => RISK_LEVEL_ORDER[x.level] >= RISK_LEVEL_ORDER.HIGH)) {
      await recordActivity(tx, {
        storeId: store.id,
        actorId: null,
        type: "risk_detected",
        title: `${r.level} 위험 탐지: ${r.title}`,
        analysisId: analysis.id,
        detail: { ruleId: r.ruleId, category: r.category, level: r.level },
      });
    }
  });
  return result;
}

export async function createAnalysis(db: Db, viewer: Viewer, storeId: string): Promise<Analysis> {
  const store = await getEditableStore(db, viewer, storeId);
  const rows = await db.query(
    `insert into analyses (store_id, requested_by, status, engine_version, basis)
     values ($1, $2, 'pending', $3, $4) returning *`,
    [store.id, viewer.id, ENGINE_VERSION, JSON.stringify(ANALYSIS_BASIS)],
  );
  await setStoreStatus(db, store.id, "verifying");
  return camelize<Analysis>(rows[0]);
}

export async function getAnalysis(db: Db, viewer: Viewer, id: string): Promise<{ analysis: Analysis; store: Store }> {
  if (!z.uuid().safeParse(id).success) throw notFound("분석");
  const rows = await db.query(`select * from analyses where id = $1`, [id]);
  if (rows.length === 0) throw notFound("분석");
  const analysis = camelize<Analysis>(rows[0]);
  const store = await getStore(db, viewer, analysis.storeId).catch(() => {
    throw notFound("분석");
  });
  return { analysis, store };
}

export async function runAnalysisParts(db: Db, viewer: Viewer, analysisId: string, parts: readonly AnalysisPart[]) {
  const { analysis, store } = await getAnalysis(db, viewer, analysisId);
  assertCanEdit(viewer, store);
  if (analysis.status === "completed") {
    // 완료된 분석은 이력 보존을 위해 다시 계산하지 않는다
    throw new AppError(409, "ANALYSIS_COMPLETED", "완료된 분석은 다시 계산하지 않습니다. 새 분석을 실행하세요.");
  }
  await execute(db, viewer, analysis, store, parts);
  return getAnalysisBundle(db, viewer, analysisId);
}

export async function createAndRunFullAnalysis(db: Db, viewer: Viewer, storeId: string) {
  const analysis = await createAnalysis(db, viewer, storeId);
  return runAnalysisParts(db, viewer, analysis.id, ANALYSIS_PARTS);
}

export interface AnalysisBundle {
  analysis: Analysis;
  store: Store;
  revenueChecks: RevenueVerification[];
  profits: ProfitAnalysis[];
  premium: PremiumAnalysis | null;
  risks: RiskAssessment[];
  report: Report | null;
  overallRisk: RiskLevel;
}

export async function getAnalysisBundle(db: Db, viewer: Viewer, analysisId: string): Promise<AnalysisBundle> {
  const { analysis, store } = await getAnalysis(db, viewer, analysisId);
  const [checks, profits, premiums, risks, reports] = await Promise.all([
    db.query(`select * from revenue_verifications where analysis_id = $1 order by check_type, year_month nulls first`, [analysisId]),
    db.query(
      `select p.*, p.missing_cost_categories::text[] as mcc from profit_analyses p
        where analysis_id = $1 order by period_type desc, year_month`,
      [analysisId],
    ),
    db.query(`select * from premium_analyses where analysis_id = $1`, [analysisId]),
    db.query(`select * from risk_assessments where analysis_id = $1`, [analysisId]),
    db.query(`select * from reports where analysis_id = $1`, [analysisId]),
  ]);
  const riskRows = camelizeAll<RiskAssessment>(risks).sort(
    (a, b) => RISK_LEVEL_ORDER[b.level] - RISK_LEVEL_ORDER[a.level],
  );
  return {
    analysis,
    store,
    revenueChecks: camelizeAll<RevenueVerification>(checks),
    profits: profits.map((p) => {
      const { mcc, ...rest } = p as Record<string, unknown> & { mcc: string[] };
      return { ...camelize<ProfitAnalysis>(rest), missingCostCategories: mcc as ProfitAnalysis["missingCostCategories"] };
    }),
    premium: premiums[0] ? camelize<PremiumAnalysis>(premiums[0]) : null,
    risks: riskRows,
    report: reports[0] ? camelize<Report>(reports[0]) : null,
    overallRisk: analysis.status === "completed" ? overallRiskLevel(riskRows) : "UNKNOWN",
  };
}

export async function listStoreAnalyses(db: Db, storeId: string): Promise<Analysis[]> {
  const rows = await db.query(`select * from analyses where store_id = $1 order by created_at desc`, [storeId]);
  return camelizeAll<Analysis>(rows);
}

/** 점포별 최근 완료 분석 요약 (대시보드·비교·목록용) */
export interface AnalysisSummary {
  storeId: string;
  analysisId: string;
  completedAt: string;
  verificationLevel: Analysis["verificationLevel"];
  missingData: string[];
  avgRevenue: number | null;
  avgOperatingProfit: number | null;
  avgOperatingMargin: number | null;
  avgMaterialCost: number | null;
  avgRentCost: number | null;
  profitComplete: boolean | null;
  totalInitialInvestment: number | null;
  paybackMonths: number | null;
  paybackStatus: PremiumAnalysis["paybackStatus"] | null;
  overallRisk: RiskLevel;
  riskCounts: Record<RiskLevel, number>;
  hasReport: boolean;
}

export async function latestAnalysisSummaries(db: Db, storeIds: string[]): Promise<Map<string, AnalysisSummary>> {
  const map = new Map<string, AnalysisSummary>();
  if (storeIds.length === 0) return map;
  const rows = await db.query<Record<string, unknown>>(
    `select distinct on (a.store_id) a.store_id, a.id as analysis_id, a.completed_at, a.verification_level, a.missing_data,
            p.total_revenue as avg_revenue, p.operating_profit as avg_operating_profit,
            p.operating_margin as avg_operating_margin, p.material_cost as avg_material_cost,
            p.rent_cost as avg_rent_cost, p.is_complete as profit_complete,
            pr.total_initial_investment, pr.payback_months, pr.payback_status,
            coalesce((select jsonb_agg(r.level) from risk_assessments r where r.analysis_id = a.id), '[]') as levels,
            exists (select 1 from reports rp where rp.analysis_id = a.id) as has_report
       from analyses a
       left join profit_analyses p on p.analysis_id = a.id and p.period_type = 'average'
       left join premium_analyses pr on pr.analysis_id = a.id
      where a.store_id = any($1::uuid[]) and a.status = 'completed'
      order by a.store_id, a.completed_at desc`,
    [pgArray(storeIds)],
  );
  for (const row of rows) {
    const { levels, ...rest } = row as { levels: RiskLevel[] } & Record<string, unknown>;
    const s = camelize<Omit<AnalysisSummary, "overallRisk" | "riskCounts">>(rest);
    const riskCounts: Record<RiskLevel, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    for (const l of levels) riskCounts[l]++;
    map.set(s.storeId, {
      ...s,
      riskCounts,
      overallRisk: overallRiskLevel(levels.map((level) => ({ level }))),
    });
  }
  return map;
}
