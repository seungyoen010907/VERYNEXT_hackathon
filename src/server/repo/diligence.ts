/**
 * 실사 진행 관리: 체크리스트, 추가 자료 요청, 진행률, 검토 필요 항목
 */
import { z } from "zod";
import { RISK_LEVEL_ORDER, type DocumentRequest, type Store } from "@/types/domain";
import {
  buildRequestMessage,
  checklistDefinition,
  computeChecklist,
  type Checklist,
} from "../diligence/checklist";
import { pgArray, type Db } from "../db/client";
import { badRequest } from "../errors";
import { loadNormalizedSources } from "../ingest/service";
import type { Viewer } from "../viewer";
import { recordActivity } from "./activities";
import type { AnalysisSummary } from "./analyses";
import { camelizeAll } from "./mappers";
import { getStore } from "./stores";

interface DocState {
  id: string;
  document_type: string;
  status: string;
  superseded: boolean;
  created_at: string;
  warning_count: number;
  duplicate: boolean;
}

async function documentStates(db: Db, storeId: string): Promise<DocState[]> {
  return db.query<DocState>(
    `select d.id, d.document_type, d.status, d.created_at,
            exists (select 1 from documents r where r.replaces_document_id = d.id) as superseded,
            exists (select 1 from documents o where o.store_id = d.store_id and o.content_hash = d.content_hash
                     and o.id <> d.id and o.created_at <= d.created_at) as duplicate,
            coalesce((select jsonb_array_length(n.warnings) from normalized_data n
                       join extracted_data e on e.id = n.extracted_data_id
                      where e.document_id = d.id order by n.created_at desc limit 1), 0) as warning_count
       from documents d where d.store_id = $1
        -- 양수인이 거래 메신저에서 공유한 참고 파일은 매물 증빙 진행률에 넣지 않는다
        and (d.deal_id is null or d.uploaded_by = (select owner_id from stores where id = d.store_id))`,
    [storeId],
  );
}

export async function getChecklist(db: Db, store: Store): Promise<Checklist> {
  const [docs, sources] = await Promise.all([documentStates(db, store.id), loadNormalizedSources(db, store.id)]);
  return computeChecklist(
    store.industry,
    docs.map((d) => ({
      id: d.id,
      documentType: d.document_type as never,
      status: d.status as never,
      superseded: d.superseded,
    })),
    sources.map((s) => s.payload),
  );
}

export async function listRequests(db: Db, storeIds: string[]): Promise<Array<DocumentRequest & { storeName: string; requesterName: string | null }>> {
  if (storeIds.length === 0) return [];
  const rows = await db.query(
    `select q.*, s.name as store_name, u.display_name as requester_name
       from document_requests q join stores s on s.id = q.store_id left join users u on u.id = q.requested_by
      where q.store_id = any($1::uuid[]) order by q.created_at desc`,
    [pgArray(storeIds)],
  );
  return camelizeAll(rows);
}

export const createRequestSchema = z.object({
  checklistKeys: z.array(z.string().min(1).max(50)).min(1, "요청할 자료를 하나 이상 선택하세요").max(20),
  message: z.string().trim().min(1).max(5000).optional(),
});

export async function createDocumentRequest(
  db: Db,
  viewer: Viewer,
  storeId: string,
  input: z.infer<typeof createRequestSchema>,
): Promise<DocumentRequest> {
  const store = await getStore(db, viewer, storeId);
  const defs = checklistDefinition(store.industry, true);
  const selected = defs.filter((d) => input.checklistKeys.includes(d.key));
  if (selected.length !== new Set(input.checklistKeys).size) throw badRequest("알 수 없는 체크리스트 항목이 있습니다.");
  const message = input.message ?? buildRequestMessage(store.name, selected);
  return db.transaction(async (tx) => {
    const rows = await tx.query(
      `insert into document_requests (store_id, requested_by, checklist_keys, message)
       values ($1, $2, $3, $4) returning *`,
      [store.id, viewer.id, pgArray(selected.map((s) => s.key)), message],
    );
    await recordActivity(tx, {
      storeId: store.id,
      actorId: viewer.id,
      type: "documents_requested",
      title: `추가 자료 요청: ${selected.map((s) => s.label).join(", ")}`,
      detail: { checklistKeys: selected.map((s) => s.key) },
    });
    return camelizeAll<DocumentRequest>(rows)[0];
  });
}

/** 요청한 항목이 모두 제출되면 요청을 완료 처리한다. */
export async function fulfillRequests(db: Db, store: Store): Promise<void> {
  const open = await db.query<{ id: string; checklist_keys: string[] }>(
    `select id, checklist_keys from document_requests where store_id = $1 and status = 'open'`,
    [store.id],
  );
  if (open.length === 0) return;
  const checklist = await getChecklist(db, store);
  const done = new Set(checklist.items.filter((i) => i.state === "complete" || i.state === "submitted").map((i) => i.key));
  for (const r of open) {
    if (r.checklist_keys.every((k) => done.has(k))) {
      await db.query(`update document_requests set status = 'fulfilled', fulfilled_at = now() where id = $1`, [r.id]);
    }
  }
}

export type DiligenceStage =
  | "collecting"
  | "document_analysis"
  | "awaiting_analysis"
  | "review"
  | "reporting"
  | "completed";

export const STAGE_LABELS: Record<DiligenceStage, string> = {
  collecting: "자료 수집",
  document_analysis: "문서 분석",
  awaiting_analysis: "실사 분석 대기",
  review: "검토 필요",
  reporting: "보고서 작성",
  completed: "실사 완료",
};

export interface StoreProgress {
  percent: number;
  stage: DiligenceStage;
  checklist: Checklist;
  documentCount: number;
  analyzedCount: number;
  pendingDocuments: number;
  failedDocuments: number;
  /** 최근 분석 이후 새로 들어온 자료가 있음 */
  analysisOutdated: boolean;
  reviewReasons: string[];
  openRequests: number;
}

export async function computeProgress(
  db: Db,
  store: Store,
  summary: AnalysisSummary | undefined,
): Promise<StoreProgress> {
  const [docs, checklist, requests, latestNormalized] = await Promise.all([
    documentStates(db, store.id),
    getChecklist(db, store),
    db.query<{ n: number }>(`select count(*)::int as n from document_requests where store_id = $1 and status = 'open'`, [store.id]),
    db.query<{ at: string | null }>(`select max(created_at) as at from normalized_data where store_id = $1`, [store.id]),
  ]);
  const active = docs.filter((d) => !d.superseded);
  const analyzed = active.filter((d) => d.status === "analyzed").length;
  const pending = active.filter((d) => d.status === "uploaded" || d.status === "analyzing").length;
  const failed = active.filter((d) => d.status === "failed").length;
  const lastInput = [latestNormalized[0]?.at, ...active.map((d) => d.created_at)].filter(Boolean).sort().pop();
  const outdated = !!summary && !!lastInput && lastInput > summary.completedAt;

  const reviewReasons: string[] = [];
  if (summary) {
    const serious = summary.riskCounts.CRITICAL + summary.riskCounts.HIGH;
    if (serious > 0) reviewReasons.push(`HIGH 이상 위험 ${serious}건`);
  }
  if (outdated) reviewReasons.push("분석 이후 새 자료 제출됨 (재분석 필요)");
  if (failed > 0) reviewReasons.push(`분석 실패 문서 ${failed}건`);
  const warned = active.filter((d) => d.warning_count > 0).length;
  if (warned > 0) reviewReasons.push(`분석 경고가 있는 문서 ${warned}건`);
  const dup = active.filter((d) => d.duplicate).length;
  if (dup > 0) reviewReasons.push(`중복 업로드 가능성 ${dup}건`);

  const checklistPart = checklist.requiredCount ? (checklist.submittedCount / checklist.requiredCount) * 50 : 0;
  const docPart = active.length ? (analyzed / active.length) * 20 : 0;
  const analysisPart = summary ? (outdated ? 10 : 20) : 0;
  const reportPart = summary?.hasReport && !outdated ? 10 : 0;
  const percent = Math.round(checklistPart + docPart + analysisPart + reportPart);

  let stage: DiligenceStage;
  if (!summary) {
    stage = pending > 0 ? "document_analysis" : checklist.submittedCount < checklist.requiredCount && analyzed === 0 ? "collecting" : "awaiting_analysis";
  } else if (reviewReasons.length > 0 && (outdated || summary.riskCounts.CRITICAL + summary.riskCounts.HIGH > 0 || failed > 0)) {
    stage = "review";
  } else if (!summary.hasReport) {
    stage = "reporting";
  } else {
    stage = "completed";
  }

  return {
    percent,
    stage,
    checklist,
    documentCount: active.length,
    analyzedCount: analyzed,
    pendingDocuments: pending,
    failedDocuments: failed,
    analysisOutdated: outdated,
    reviewReasons,
    openRequests: requests[0]?.n ?? 0,
  };
}

export function isSerious(level: string): boolean {
  return RISK_LEVEL_ORDER[level as keyof typeof RISK_LEVEL_ORDER] >= RISK_LEVEL_ORDER.HIGH;
}
