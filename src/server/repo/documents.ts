import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  type AllowedMimeType,
  type Document,
  type DocumentStatus,
  type DocumentType,
} from "@/types/domain";
import { pgArray, type Db } from "../db/client";
import { badRequest, notFound } from "../errors";
import { safeFileName, saveFile } from "../storage";
import type { Viewer } from "../viewer";
import { recordActivity } from "./activities";
import { camelize, camelizeAll } from "./mappers";
import { getEditableStore, getStore } from "./stores";

export const MAX_FILE_SIZE = 20 * 1024 * 1024;

const EXTENSIONS: Record<AllowedMimeType, string[]> = {
  "application/pdf": ["pdf"],
  "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
};

/** 파일 앞부분(매직 넘버)과 확장자로 형식을 판별한다. 브라우저가 보낸 MIME은 신뢰하지 않는다. */
export function detectMimeType(bytes: Uint8Array, fileName: string): AllowedMimeType | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  let mime: AllowedMimeType | null = null;
  if (starts(0x25, 0x50, 0x44, 0x46)) mime = "application/pdf";
  else if (starts(0x89, 0x50, 0x4e, 0x47)) mime = "image/png";
  else if (starts(0xff, 0xd8, 0xff)) mime = "image/jpeg";
  else if (starts(0xd0, 0xcf, 0x11, 0xe0)) mime = "application/vnd.ms-excel";
  else if (starts(0x50, 0x4b, 0x03, 0x04) && ext === "xlsx")
    mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (!mime || !EXTENSIONS[mime].includes(ext)) return null;
  return mime;
}

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

export interface UploadInput {
  storeId: string;
  documentType: DocumentType;
  fileName: string;
  bytes: Uint8Array;
  replacesDocumentId?: string | null;
}

export interface UploadResult {
  document: Document;
  /** 같은 점포에 내용이 같은 파일이 이미 있으면 그 문서 ID */
  duplicateOf: string[];
}

export async function uploadDocument(db: Db, viewer: Viewer, input: UploadInput): Promise<UploadResult> {
  const store = await getEditableStore(db, viewer, input.storeId);
  return saveDocument(db, viewer, store, input);
}

/**
 * 권한 확인을 마친 뒤 호출한다. 거래 메신저에서는 양수인도 파일을 공유하므로 호출 측이 권한을 확인한다.
 * dealId를 주면 해당 거래에서 공유한 파일로 기록한다.
 */
export async function saveDocument(
  db: Db,
  viewer: Viewer,
  store: { id: string },
  input: UploadInput & { dealId?: string | null; recordStoreActivity?: boolean },
): Promise<UploadResult> {
  if (input.bytes.byteLength === 0) throw badRequest("빈 파일입니다.");
  if (input.bytes.byteLength > MAX_FILE_SIZE) throw badRequest("파일은 20MB 이하만 업로드할 수 있습니다.");
  const mimeType = detectMimeType(input.bytes, input.fileName);
  if (!mimeType) throw badRequest("PDF, XLS, XLSX, JPG, PNG 파일만 업로드할 수 있습니다. (파일 내용과 확장자가 일치해야 합니다)");

  if (input.replacesDocumentId) {
    const prev = await db.query<{ id: string }>(`select id from documents where id = $1 and store_id = $2`, [
      input.replacesDocumentId,
      store.id,
    ]);
    if (prev.length === 0) throw badRequest("재업로드 대상 문서가 이 매물에 없습니다.");
  }

  const contentHash = createHash("sha256").update(input.bytes).digest("hex");
  const duplicates = await db.query<{ id: string }>(
    `select id from documents where store_id = $1 and content_hash = $2 order by created_at`,
    [store.id, contentHash],
  );
  const id = randomUUID();
  const fileName = safeFileName(input.fileName);
  const storagePath = `${store.id}/${id}/${fileName}`;
  await saveFile(storagePath, input.bytes);

  const document = await db.transaction(async (tx) => {
    const rows = await tx.query(
      `insert into documents (id, store_id, uploaded_by, document_type, file_name, storage_path, mime_type,
         file_size, content_hash, replaces_document_id, deal_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [id, store.id, viewer.id, input.documentType, fileName, storagePath, mimeType, input.bytes.byteLength, contentHash, input.replacesDocumentId ?? null, input.dealId ?? null],
    );
    const doc = camelize<Document>(rows[0]);
    // 매물 활동 기록은 매물을 볼 수 있는 모든 사용자에게 보이므로, 양수인이 거래 중에 공유한 파일은 남기지 않는다
    if (input.recordStoreActivity === false) return doc;
    await recordActivity(tx, {
      storeId: store.id,
      actorId: viewer.id,
      type: input.replacesDocumentId ? "document_reuploaded" : "document_uploaded",
      title: `${DOCUMENT_TYPE_LABELS[input.documentType]} ${input.replacesDocumentId ? "재업로드" : "업로드"}: ${fileName}`,
      documentId: doc.id,
      detail: duplicates.length > 0 ? { duplicateOf: duplicates.map((d) => d.id) } : {},
    });
    return doc;
  });
  return { document, duplicateOf: duplicates.map((d) => d.id) };
}

export interface DocumentRow extends Document {
  storeName: string;
  storeIsTestData: boolean;
  uploaderName: string | null;
  /** 이 문서를 대체한 재업로드 문서 */
  replacedById: string | null;
  /** 같은 점포에서 먼저 올라온 같은 내용의 문서 */
  duplicateOfIds: string[];
  /** 최신 정규화 결과의 경고 수 (문서 리뷰 포함) */
  warningCount: number;
  analysisProvider: string | null;
}

export interface DocumentFilters {
  storeId?: string;
  documentType?: DocumentType;
  status?: DocumentStatus;
}

export async function listDocuments(
  db: Db,
  storeIds: string[],
  filters: DocumentFilters = {},
): Promise<DocumentRow[]> {
  if (storeIds.length === 0) return [];
  const params: unknown[] = [pgArray(storeIds)];
  const where = ["d.store_id = any($1::uuid[])"];
  if (filters.storeId) {
    params.push(filters.storeId);
    where.push(`d.store_id = $${params.length}`);
  }
  if (filters.documentType) {
    params.push(filters.documentType);
    where.push(`d.document_type = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`d.status = $${params.length}`);
  }
  const rows = await db.query(
    `select d.*, s.name as store_name, s.is_test_data as store_is_test_data, u.display_name as uploader_name,
            (select r.id from documents r where r.replaces_document_id = d.id order by r.created_at desc limit 1) as replaced_by_id,
            coalesce((select array_agg(o.id::text order by o.created_at) from documents o
                       where o.store_id = d.store_id and o.content_hash = d.content_hash
                         and o.id <> d.id and o.created_at <= d.created_at), '{}') as duplicate_of_ids,
            coalesce((select jsonb_array_length(n.warnings) from normalized_data n
                       join extracted_data e on e.id = n.extracted_data_id
                      where e.document_id = d.id order by n.created_at desc limit 1), 0) as warning_count,
            (select e.provider from extracted_data e where e.document_id = d.id order by e.received_at desc limit 1) as analysis_provider
       from documents d
       join stores s on s.id = d.store_id
       left join users u on u.id = d.uploaded_by
      where ${where.join(" and ")}
      order by d.created_at desc, d.id`,
    params,
  );
  return camelizeAll<DocumentRow>(rows);
}

export async function getDocument(db: Db, viewer: Viewer, id: string): Promise<Document> {
  if (!z.uuid().safeParse(id).success) throw notFound("문서");
  const rows = await db.query(`select * from documents where id = $1`, [id]);
  if (rows.length === 0) throw notFound("문서");
  const doc = camelize<Document>(rows[0]);
  // 원본 문서는 매물 소유자만 볼 수 있다. 거래 메신저로 공유된 문서는 그 거래의 양수인도 볼 수 있다 (RLS 정책과 동일).
  const store = await getStore(db, viewer, doc.storeId);
  if (store.ownerId === viewer.id || viewer.role === "admin") return doc;
  const shared = await db.query(
    `select 1 from deal_messages m join deals d on d.id = m.deal_id where m.document_id = $1 and d.buyer_id = $2 limit 1`,
    [doc.id, viewer.id],
  );
  if (shared.length === 0) throw notFound("문서");
  return doc;
}

export async function setDocumentStatus(
  db: Db,
  id: string,
  status: DocumentStatus,
  extra: { errorMessage?: string | null; periodStart?: string | null; periodEnd?: string | null } = {},
): Promise<void> {
  await db.query(
    `update documents set status = $2, error_message = $3,
        period_start = coalesce($4, period_start), period_end = coalesce($5, period_end)
      where id = $1`,
    [id, status, extra.errorMessage ?? null, extra.periodStart ?? null, extra.periodEnd ?? null],
  );
}
