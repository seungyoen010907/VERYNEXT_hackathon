"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Notice } from "../ui";
import { api } from "./api";

function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T>(fn: () => Promise<T>, after?: (r: T) => void) {
    setPending(true);
    setError(null);
    try {
      const r = await fn();
      after?.(r);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청을 처리하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }
  return { pending, error, run, router };
}

export function RunAnalysisButton({ storeId, label = "실사 분석 실행", variant = "primary" }: { storeId: string; label?: string; variant?: "primary" | "secondary" }) {
  const { pending, error, run } = useAction();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant={variant} disabled={pending} onClick={() => run(() => api(`/api/stores/${storeId}/analyses`, { method: "POST" }))}>
        {pending ? "분석 중…" : label}
      </Button>
      {error && <span className="text-[11px] text-red-700">{error}</span>}
    </span>
  );
}

export function GenerateReportButton({ analysisId, regenerate }: { analysisId: string; regenerate?: boolean }) {
  const { pending, error, run } = useAction();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant={regenerate ? "secondary" : "primary"} disabled={pending} onClick={() => run(() => api(`/api/analysis/${analysisId}/report`, { method: "POST" }))}>
        {pending ? "생성 중…" : regenerate ? "보고서 다시 생성" : "보고서 생성"}
      </Button>
      {error && <span className="text-[11px] text-red-700">{error}</span>}
    </span>
  );
}

export function AnalyzeDocumentButton({ documentId, label = "분석" }: { documentId: string; label?: string }) {
  const { pending, error, run } = useAction();
  return (
    <span className="inline-flex flex-col gap-0.5">
      <Button className="h-7 px-2 text-[12px]" disabled={pending} onClick={() => run(() => api(`/api/documents/${documentId}/analyze`, { method: "POST" }))}>
        {pending ? "분석 중…" : label}
      </Button>
      {error && <span className="max-w-56 text-[11px] text-red-700">{error}</span>}
    </span>
  );
}

export function DeleteStoreButton({ storeId, name }: { storeId: string; name: string }) {
  const { pending, error, run, router } = useAction();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => {
          if (!confirm(`'${name}' 매물과 모든 자료·분석 이력을 삭제합니다. 되돌릴 수 없습니다.`)) return;
          run(() => api(`/api/stores/${storeId}`, { method: "DELETE" }), () => router.push("/stores"));
        }}
      >
        삭제
      </Button>
      {error && <span className="text-[11px] text-red-700">{error}</span>}
    </span>
  );
}

export function CopyButton({ text, label = "복사" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <Button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 2000);
      }}
    >
      {state === "copied" ? "복사됨" : state === "failed" ? "복사 실패" : label}
    </Button>
  );
}

export function PrintButton() {
  return (
    <Button variant="primary" onClick={() => window.print()}>
      PDF로 저장 / 인쇄
    </Button>
  );
}

export function ResetTestDataButton() {
  const { pending, error, run } = useAction();
  const [done, setDone] = useState(false);
  return (
    <div className="space-y-2">
      <Button
        disabled={pending}
        onClick={() => {
          if (!confirm("테스트 매물 6개를 지우고 다시 만듭니다. 직접 등록한 매물은 유지됩니다.")) return;
          run(() => api("/api/dev/reset-test-data", { method: "POST" }), () => setDone(true));
        }}
      >
        {pending ? "초기화 중…" : "테스트 데이터 초기화"}
      </Button>
      {done && <Notice>테스트 데이터를 다시 만들었습니다.</Notice>}
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  );
}
