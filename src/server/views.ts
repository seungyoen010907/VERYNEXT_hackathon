/**
 * 화면용 데이터 조합. 페이지(서버 컴포넌트)와 API가 같은 함수를 사용한다.
 */
import type { RiskLevel, Store, YearMonth } from "@/types/domain";
import type { Db } from "./db/client";
import { analysisProviderStatus } from "./ingest/provider";
import { listActivities } from "./repo/activities";
import {
  buildInputForStore,
  getAnalysisBundle,
  latestAnalysisSummaries,
  listStoreAnalyses,
  type AnalysisSummary,
} from "./repo/analyses";
import { computeProgress, listRequests, type StoreProgress } from "./repo/diligence";
import { listDocuments } from "./repo/documents";
import { getStore, listStores, visibleStoreIds, type StoreFilters } from "./repo/stores";
import { canEdit, type Viewer } from "./viewer";

export interface StoreOverview {
  store: Store;
  summary: AnalysisSummary | null;
  progress: StoreProgress;
  canEdit: boolean;
}

export async function storeOverviews(db: Db, viewer: Viewer, filters: StoreFilters = {}): Promise<StoreOverview[]> {
  const stores = await listStores(db, viewer, filters);
  const summaries = await latestAnalysisSummaries(db, stores.map((s) => s.id));
  return Promise.all(
    stores.map(async (store) => {
      const summary = summaries.get(store.id) ?? null;
      return { store, summary, progress: await computeProgress(db, store, summary ?? undefined), canEdit: canEdit(viewer, store) };
    }),
  );
}

export async function dashboardData(db: Db, viewer: Viewer) {
  const overviews = await storeOverviews(db, viewer);
  const ids = overviews.map((o) => o.store.id);
  const ownedIds = overviews.filter((o) => o.canEdit).map((o) => o.store.id);
  const [activities, uploads] = await Promise.all([
    listActivities(db, { storeIds: ids, limit: 12 }),
    listDocuments(db, ownedIds),
  ]);
  const count = (pred: (o: StoreOverview) => boolean) => overviews.filter(pred).length;
  const riskTotals: Record<RiskLevel, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
  for (const o of overviews) {
    if (!o.summary) continue;
    for (const [level, n] of Object.entries(o.summary.riskCounts)) riskTotals[level as RiskLevel] += n;
  }
  const riskActivities = (await listActivities(db, { storeIds: ids, limit: 200 }))
    .filter((a) => a.type === "risk_detected")
    .slice(0, 8);
  const progressAvg = overviews.length
    ? Math.round(overviews.reduce((a, o) => a + o.progress.percent, 0) / overviews.length)
    : 0;
  return {
    kpi: {
      total: overviews.length,
      inProgress: count((o) => ["draft", "pending_verification", "verifying"].includes(o.store.status)),
      verified: count((o) => o.store.status === "verified"),
      needsDocuments: count((o) => o.store.status === "needs_more_documents"),
      progressAvg,
      review: count((o) => o.progress.stage === "review"),
    },
    overviews,
    activities,
    uploads: uploads.slice(0, 8),
    riskTotals,
    riskActivities,
    providerStatus: analysisProviderStatus(),
  };
}

/** 출처별 월 매출 (차트용). 분석에 실제로 사용하는 자료와 같은 기준(재업로드·중복 제외)을 쓴다. */
export async function revenueSeries(db: Db, store: Store) {
  const input = await buildInputForStore(db, store);
  const byMonth = new Map<YearMonth, Record<string, number>>();
  const latest = new Map<string, { amount: number; createdAt: string }>();
  for (const r of input.revenues) {
    const key = `${r.source}|${r.platform ?? ""}|${r.yearMonth}`;
    const prev = latest.get(key);
    if (!prev || prev.createdAt <= r.createdAt) latest.set(key, { amount: r.amount, createdAt: r.createdAt });
  }
  for (const [key, v] of latest) {
    const [source, , ym] = key.split("|");
    const row = byMonth.get(ym) ?? {};
    row[source] = (row[source] ?? 0) + v.amount;
    byMonth.set(ym, row);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([yearMonth, values]) => ({ yearMonth, ...values }));
}

export async function storeDetail(db: Db, viewer: Viewer, storeId: string) {
  const store = await getStore(db, viewer, storeId);
  const editable = canEdit(viewer, store);
  const summaries = await latestAnalysisSummaries(db, [store.id]);
  const summary = summaries.get(store.id) ?? null;
  const [progress, analyses, activities, requests, documents, series] = await Promise.all([
    computeProgress(db, store, summary ?? undefined),
    listStoreAnalyses(db, store.id),
    listActivities(db, { storeIds: [store.id], limit: 100 }),
    listRequests(db, [store.id]),
    editable ? listDocuments(db, [store.id]) : Promise.resolve([]),
    revenueSeries(db, store),
  ]);
  const bundle = summary ? await getAnalysisBundle(db, viewer, summary.analysisId) : null;
  return { store, canEdit: editable, summary, progress, analyses, activities, requests, documents, bundle, series, providerStatus: analysisProviderStatus() };
}

export type StoreDetail = Awaited<ReturnType<typeof storeDetail>>;

/** 볼 수 있는 모든 매물의 최신 완료 분석 결과 (분석 화면별 매물 목록용) */
export async function latestBundles(db: Db, viewer: Viewer) {
  const overviews = await storeOverviews(db, viewer);
  return Promise.all(
    overviews.map(async (o) => ({
      ...o,
      bundle: o.summary ? await getAnalysisBundle(db, viewer, o.summary.analysisId) : null,
    })),
  );
}

export async function comparisonData(db: Db, viewer: Viewer, storeIds: string[]) {
  const visible = new Set(await visibleStoreIds(db, viewer));
  const ids = storeIds.filter((id) => visible.has(id)).slice(0, 6);
  const stores = (await listStores(db, viewer)).filter((s) => ids.includes(s.id));
  const summaries = await latestAnalysisSummaries(db, ids);
  return ids
    .map((id) => stores.find((s) => s.id === id))
    .filter((s): s is Store => !!s)
    .map((store) => {
      const s = summaries.get(store.id) ?? null;
      const rentRatio = s?.avgRevenue && s.avgRentCost !== null ? s.avgRentCost / s.avgRevenue : null;
      const materialRatio = s?.avgRevenue && s.avgMaterialCost !== null ? s.avgMaterialCost / s.avgRevenue : null;
      return { store, summary: s, rentRatio, materialRatio };
    });
}
