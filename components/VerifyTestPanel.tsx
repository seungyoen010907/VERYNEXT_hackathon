"use client";

// Step 2 임시: 파일을 골라 /api/verify-test로 바로 검증해보는 칸 + 결과 리포트.
// Step 3에서 실제 거래방 업로드·검증으로 바꾸면 이 파일은 지운다.

import { useState } from "react";
import ReportView from "@/components/ReportView";
import type { Report } from "@/lib/types";

export default function VerifyTestPanel({ initial }: { initial: Report }) {
  const [report, setReport] = useState(initial);
  const [isSample, setIsSample] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const body = new FormData();
      files.forEach((f) => body.append("files", f));
      const res = await fetch("/api/verify-test", { method: "POST", body });
      const data = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했어요." }));
      if (!res.ok) throw new Error(data.error ?? "검증에 실패했어요.");
      setReport(data.report);
      setIsSample(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "검증에 실패했어요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={run} className="space-y-3 rounded-xl border border-dashed border-border bg-card p-4">
        <p className="text-sm font-medium">임시: 파일로 검증해보기</p>
        <p className="text-xs text-muted">samples 폴더의 자료 4개를 한 번에 골라 올려보세요. 저장되지 않아요.</p>
        <input
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-bg file:px-3 file:py-2 file:text-sm file:text-text"
        />
        {error && <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{error}</p>}
        <button
          type="submit"
          disabled={loading || files.length === 0}
          className="w-full rounded-lg bg-accent py-3 font-medium text-white disabled:opacity-60"
        >
          {loading ? "검증 중... (30초~1분)" : `검증하기${files.length ? ` (${files.length}개)` : ""}`}
        </button>
      </form>

      <p className="text-xs text-muted">{isSample ? "아래는 가짜 데이터로 만든 예시 리포트예요." : "방금 올린 파일로 만든 리포트예요."}</p>
      <ReportView report={report} />

      {!isSample && (
        <details className="rounded-xl border border-border bg-card p-4 text-xs">
          <summary className="cursor-pointer text-muted">AI가 읽은 원본 JSON 보기 (숫자 확인용)</summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(report.extraction, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
