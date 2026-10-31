/**
 * 정규화 데이터 → 분석 엔진 입력 변환
 * 저장소(DB)와 테스트가 같은 변환 규칙을 쓰도록 분리했다.
 */
import type { DocumentStatus, DocumentType, NormalizedPayload } from "@/types/domain";
import type { AnalysisInput, ContractNote, ExpenseRecord, RevenueRecord } from "./types";

export interface NormalizedSource {
  normalizedDataId: string;
  createdAt: string;
  documentId: string | null;
  fileName: string | null;
  payload: NormalizedPayload;
}

export function buildAnalysisInput(
  store: AnalysisInput["store"],
  sources: NormalizedSource[],
  documents: Array<{ id: string; documentType: DocumentType; status: DocumentStatus; fileName: string }>,
  asOf: string,
): AnalysisInput {
  const revenues: RevenueRecord[] = [];
  const expenses: ExpenseRecord[] = [];
  const contractNotes: ContractNote[] = [];
  const sourceDocuments: AnalysisInput["sourceDocuments"] = {};

  for (const s of sources) {
    sourceDocuments[s.normalizedDataId] = {
      documentId: s.documentId,
      fileName: s.fileName,
      documentType: s.payload.documentType,
    };
    for (const r of s.payload.revenues) {
      if (r.source === "claimed") continue;
      revenues.push({ ...r, source: r.source, normalizedDataId: s.normalizedDataId, createdAt: s.createdAt });
    }
    for (const e of s.payload.expenses) {
      expenses.push({ ...e, normalizedDataId: s.normalizedDataId });
    }
    for (const n of s.payload.notes) {
      contractNotes.push({ ...n, normalizedDataId: s.normalizedDataId });
    }
  }
  return { store, revenues, expenses, contractNotes, documents, sourceDocuments, asOf };
}
