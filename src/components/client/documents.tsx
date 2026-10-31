"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES, type DocumentType } from "@/types/domain";
import { Button, Field, Notice, Panel, Select, inputClass } from "../ui";
import { api } from "./api";

interface UploadResponse {
  document: { id: string; fileName: string };
  duplicateOf: string[];
  analysis: { warnings: string[]; revenueCount: number; expenseCount: number } | null;
  analysisError: { code: string; message: string } | null;
}

type Phase = { kind: "idle" } | { kind: "uploading" } | { kind: "done"; result: UploadResponse } | { kind: "error"; message: string };

export function UploadPanel({ storeId, replaceOptions, providerLabel }: {
  storeId: string;
  /** 재업로드 대상으로 고를 수 있는 문서 */
  replaceOptions: Array<{ id: string; label: string; documentType: DocumentType }>;
  providerLabel: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<DocumentType>("pos_sales");
  const [replaces, setReplaces] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setPhase({ kind: "error", message: "파일을 선택하세요." });
    const fd = new FormData();
    fd.set("storeId", storeId);
    fd.set("documentType", type);
    fd.set("file", file);
    if (replaces) fd.set("replacesDocumentId", replaces);
    setPhase({ kind: "uploading" });
    try {
      const result = await api<UploadResponse>("/api/documents", { method: "POST", body: fd });
      setPhase({ kind: "done", result });
      if (fileRef.current) fileRef.current.value = "";
      setReplaces("");
      router.refresh();
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "업로드하지 못했습니다." });
    }
  }

  const sameType = replaceOptions.filter((o) => o.documentType === type);
  return (
    <Panel title="자료 업로드" description={`PDF · XLS · XLSX · JPG · PNG, 20MB 이하. 문서 분석: ${providerLabel}`}>
      <form onSubmit={onSubmit} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[180px_1fr_220px_auto]">
        <Field label="문서 종류">
          <Select value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="파일">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.xls,.xlsx,.jpg,.jpeg,.png"
            className={`${inputClass} py-1 file:mr-3 file:h-6 file:rounded-sm file:border-0 file:bg-neutral-100 file:px-2 file:text-[12px]`}
          />
        </Field>
        <Field label="재업로드 (이전 문서 대체)">
          <Select value={replaces} onChange={(e) => setReplaces(e.target.value)} disabled={sameType.length === 0}>
            <option value="">새 자료로 등록</option>
            {sameType.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="primary" disabled={phase.kind === "uploading"}>
          {phase.kind === "uploading" ? "업로드·분석 중…" : "업로드"}
        </Button>
      </form>
      <div className="mt-3 space-y-2">
        {phase.kind === "error" && <Notice tone="negative">{phase.message}</Notice>}
        {phase.kind === "done" && (
          <>
            <Notice>
              업로드 완료: {phase.result.document.fileName}
              {phase.result.analysis &&
                ` · 분석 완료 (매출 ${phase.result.analysis.revenueCount}건, 비용 ${phase.result.analysis.expenseCount}건)`}
            </Notice>
            {phase.result.duplicateOf.length > 0 && (
              <Notice tone="caution">같은 내용의 파일이 이미 {phase.result.duplicateOf.length}건 있습니다. 중복 업로드인지 확인하세요. 분석에는 최신 파일 1건만 사용합니다.</Notice>
            )}
            {phase.result.analysis && phase.result.analysis.warnings.length > 0 && (
              <Notice tone="caution">
                분석 경고 {phase.result.analysis.warnings.length}건: {phase.result.analysis.warnings.slice(0, 3).join(" / ")}
              </Notice>
            )}
            {phase.result.analysisError && (
              <Notice tone="caution">문서는 저장했지만 분석하지 못했습니다: {phase.result.analysisError.message}</Notice>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

const JSON_EXAMPLE = `{
  "schema_version": "1.0",
  "provider": "team-doc-ai",
  "document_type": "pos_sales",
  "revenues": [
    { "source": "pos", "year_month": "2026-09", "amount": 30000000,
      "aggregation_basis": "gross_sales", "vat_included": true,
      "includes_card": true, "includes_delivery": true }
  ],
  "expenses": [],
  "review_flags": []
}`;

export function ImportJsonPanel({ storeId, documents }: { storeId: string; documents: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "caution" | "negative"; text: string } | null>(null);

  async function submit() {
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return setMessage({ tone: "negative", text: "JSON 형식이 올바르지 않습니다." });
    }
    setPending(true);
    setMessage(null);
    try {
      const r = await api<{ warnings: string[]; revenueCount: number; expenseCount: number }>("/api/analysis/import", {
        method: "POST",
        json: { storeId, documentId: documentId || null, payload },
      });
      setMessage({
        tone: r.warnings.length ? "caution" : "info",
        text: `가져오기 완료: 매출 ${r.revenueCount}건, 비용 ${r.expenseCount}건${r.warnings.length ? ` · 경고 ${r.warnings.length}건: ${r.warnings.slice(0, 3).join(" / ")}` : ""}`,
      });
      setText("");
      router.refresh();
    } catch (err) {
      setMessage({ tone: "negative", text: err instanceof Error ? err.message : "가져오지 못했습니다." });
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel title="AI 분석 결과 가져오기 (JSON)" description="팀 문서 분석 모듈의 결과(추출 스키마 v1)를 붙여 넣습니다. 원본 JSON은 수정 없이 보존됩니다.">
      <div className="grid gap-3 md:grid-cols-[1fr_260px]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={JSON_EXAMPLE}
          rows={9}
          spellCheck={false}
          className={`${inputClass} h-auto py-2 font-mono text-[12px]`}
        />
        <div className="space-y-3">
          <Field label="연결할 문서" hint="분석 대기 문서에 연결하면 해당 문서가 '분석 완료'로 바뀝니다.">
            <Select value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
              <option value="">문서 없이 가져오기</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" disabled={pending || !text.trim()} onClick={submit} className="w-full">
            {pending ? "가져오는 중…" : "가져오기"}
          </Button>
          <p className="text-[11px] text-neutral-500">형식: docs/ai-integration.md</p>
        </div>
      </div>
      {message && (
        <div className="mt-3">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}
    </Panel>
  );
}
