/**
 * AI 분석 결과 수신 → 원본 보존 → 정규화 → 월별 데이터 저장
 */
import { DOCUMENT_TYPE_LABELS, type DocumentType, type NormalizedPayload } from "@/types/domain";
import type { NormalizedSource } from "../analysis/input";
import type { Db } from "../db/client";
import { AppError, badRequest } from "../errors";
import { recordActivity } from "../repo/activities";
import { getDocument, setDocumentStatus } from "../repo/documents";
import { getEditableStore } from "../repo/stores";
import { readStoredFile } from "../storage";
import type { Viewer } from "../viewer";
import { ExtractionFormatError, normalizeExtraction } from "./normalize";
import { getDocumentAnalysisProvider } from "./provider";

export interface ImportResult {
  extractedDataId: string;
  normalizedDataId: string | null;
  warnings: string[];
  revenueCount: number;
  expenseCount: number;
}

function lastDayOfMonth(ym: string | null): string | null {
  if (!ym) return null;
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** 한 결과 안에서 같은 출처·월(·플랫폼) 또는 같은 비용·월이 반복되면 첫 값만 쓰고 경고한다. */
function dedupePayload(payload: NormalizedPayload, warnings: string[]): NormalizedPayload {
  const seenR = new Set<string>();
  const revenues = payload.revenues.filter((r) => {
    const k = `${r.source}|${r.platform ?? ""}|${r.yearMonth}`;
    if (seenR.has(k)) {
      warnings.push(`중복 매출 항목 무시: ${r.source} ${r.yearMonth}`);
      return false;
    }
    seenR.add(k);
    return true;
  });
  const seenE = new Set<string>();
  const expenses = payload.expenses.filter((e) => {
    const k = `${e.category}|${e.yearMonth}`;
    if (seenE.has(k)) {
      warnings.push(`중복 비용 항목 무시: ${e.category} ${e.yearMonth}`);
      return false;
    }
    seenE.add(k);
    return true;
  });
  return { ...payload, revenues, expenses };
}

export async function importExtraction(
  db: Db,
  viewer: Viewer,
  input: { storeId: string; documentId: string | null; raw: unknown; provider?: string },
): Promise<ImportResult> {
  await getEditableStore(db, viewer, input.storeId);
  let fallbackType: DocumentType | undefined;
  if (input.documentId) {
    const doc = await getDocument(db, viewer, input.documentId);
    if (doc.storeId !== input.storeId) throw badRequest("문서가 이 매물에 속하지 않습니다.");
    fallbackType = doc.documentType;
  }
  const raw = input.raw as Record<string, unknown> | null;
  const provider = (typeof raw?.provider === "string" && raw.provider) || input.provider || "manual-import";

  // 1) 원본은 형식이 틀려도 그대로 보존한다
  const [extracted] = await db.query<{ id: string }>(
    `insert into extracted_data (store_id, document_id, provider, provider_version, schema_version, raw_payload)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [
      input.storeId,
      input.documentId,
      provider.slice(0, 50),
      typeof raw?.provider_version === "string" ? raw.provider_version : null,
      typeof raw?.schema_version === "string" ? raw.schema_version : "unknown",
      JSON.stringify(input.raw ?? null),
    ],
  );

  // 2) 정규화
  let normalized;
  try {
    normalized = normalizeExtraction(input.raw, fallbackType);
  } catch (err) {
    if (err instanceof ExtractionFormatError) {
      if (input.documentId) {
        await setDocumentStatus(db, input.documentId, "failed", { errorMessage: err.message });
        await recordActivity(db, {
          storeId: input.storeId,
          actorId: viewer.id,
          type: "document_failed",
          title: `문서 분석 실패: ${err.message}`,
          documentId: input.documentId,
        });
      }
      throw new AppError(422, "INVALID_EXTRACTION", err.message, { extractedDataId: extracted.id });
    }
    throw err;
  }
  const warnings = [...normalized.warnings];
  const payload = dedupePayload(normalized.payload, warnings);

  // 3) 정규화 결과와 월별 데이터 저장
  return db.transaction(async (tx) => {
    const [n] = await tx.query<{ id: string }>(
      `insert into normalized_data (store_id, extracted_data_id, schema_version, payload, warnings)
       values ($1, $2, $3, $4, $5) returning id`,
      [input.storeId, extracted.id, normalized.schemaVersion, JSON.stringify(payload), JSON.stringify(warnings)],
    );
    for (const r of payload.revenues) {
      await tx.query(
        `insert into monthly_revenues (store_id, normalized_data_id, source, platform, year_month, amount,
           aggregation_basis, vat_included, includes_card, includes_delivery, order_count)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [input.storeId, n.id, r.source, r.platform, r.yearMonth, r.amount, r.aggregationBasis, r.vatIncluded, r.includesCard, r.includesDelivery, r.orderCount],
      );
    }
    for (const e of payload.expenses) {
      await tx.query(
        `insert into monthly_expenses (store_id, normalized_data_id, category, year_month, amount, is_verified, note)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [input.storeId, n.id, e.category, e.yearMonth, e.amount, e.isVerified, e.note],
      );
    }
    if (input.documentId) {
      await setDocumentStatus(tx, input.documentId, "analyzed", {
        periodStart: payload.periodStart,
        periodEnd: lastDayOfMonth(payload.periodEnd),
      });
    }
    await recordActivity(tx, {
      storeId: input.storeId,
      actorId: viewer.id,
      type: "document_analyzed",
      title: `${DOCUMENT_TYPE_LABELS[payload.documentType]} 분석 완료 (매출 ${payload.revenues.length}건, 비용 ${payload.expenses.length}건${warnings.length ? `, 경고 ${warnings.length}건` : ""})`,
      documentId: input.documentId,
      detail: { provider, warnings },
    });
    return {
      extractedDataId: extracted.id,
      normalizedDataId: n.id,
      warnings,
      revenueCount: payload.revenues.length,
      expenseCount: payload.expenses.length,
    };
  });
}

/** 업로드된 문서를 연결된 분석 모듈로 분석한다. */
export async function analyzeDocument(db: Db, viewer: Viewer, documentId: string): Promise<ImportResult> {
  const doc = await getDocument(db, viewer, documentId);
  const store = await getEditableStore(db, viewer, doc.storeId);
  const provider = getDocumentAnalysisProvider(store.isTestData);
  if (!provider) {
    throw new AppError(
      409,
      "NO_ANALYSIS_PROVIDER",
      "문서 분석 모듈이 연결되지 않았습니다. 팀원의 분석 결과 JSON을 '분석 결과 가져오기'로 등록하세요.",
    );
  }
  await setDocumentStatus(db, doc.id, "analyzing");
  let raw: unknown;
  try {
    raw = await provider.analyze({
      storeName: store.name,
      storeIsTestData: store.isTestData,
      documentType: doc.documentType,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      bytes: await readStoredFile(doc.storagePath),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    await setDocumentStatus(db, doc.id, "failed", { errorMessage: message });
    await recordActivity(db, {
      storeId: store.id,
      actorId: viewer.id,
      type: "document_failed",
      title: `문서 분석 실패: ${doc.fileName}`,
      documentId: doc.id,
      detail: { message },
    });
    throw err;
  }
  return importExtraction(db, viewer, { storeId: store.id, documentId: doc.id, raw, provider: provider.name });
}

/**
 * 분석에 사용할 정규화 데이터
 *  - 문서마다 가장 최근 정규화 결과 1건
 *  - 재업로드로 대체된 문서, 분석 실패 문서 제외
 *  - 같은 내용(content_hash)의 문서는 가장 최근 1건만
 *  - 문서 없이 가져온 결과는 내용이 같으면 1건만
 */
export async function loadNormalizedSources(db: Db, storeId: string): Promise<NormalizedSource[]> {
  const rows = await db.query<{
    id: string;
    created_at: string;
    document_id: string | null;
    file_name: string | null;
    payload: NormalizedPayload;
  }>(
    `with latest_per_doc as (
        select distinct on (e.document_id) n.id, n.created_at, e.document_id, n.payload
          from normalized_data n
          join extracted_data e on e.id = n.extracted_data_id
         where n.store_id = $1 and e.document_id is not null
         order by e.document_id, n.created_at desc
     ),
     -- 같은 내용의 파일이 여러 건이면 분석 결과가 있는 것 중 가장 최근 1건만 쓴다
     -- (분석 결과가 없는 사본 때문에 분석된 원본이 빠지지 않도록 분석 결과 기준으로 고른다)
     deduped as (
        select distinct on (coalesce(d.content_hash, d.id::text)) l.id, l.created_at, l.document_id, d.file_name, l.payload
          from latest_per_doc l
          join documents d on d.id = l.document_id
         where d.status <> 'failed'
           and not exists (select 1 from documents r where r.replaces_document_id = d.id)
         order by coalesce(d.content_hash, d.id::text), l.created_at desc
     ),
     standalone as (
        select distinct on (n.payload::text) n.id, n.created_at, null::uuid as document_id, n.payload
          from normalized_data n
          join extracted_data e on e.id = n.extracted_data_id
         where n.store_id = $1 and e.document_id is null
         order by n.payload::text, n.created_at desc
     )
     select id, created_at, document_id, file_name, payload from deduped
     union all
     select s.id, s.created_at, s.document_id, null, s.payload from standalone s
     order by created_at`,
    [storeId],
  );
  return rows.map((r) => ({
    normalizedDataId: r.id,
    createdAt: r.created_at,
    documentId: r.document_id,
    fileName: r.file_name,
    payload: r.payload,
  }));
}
