"use client";

import { useState } from "react";
import type { ChatMessage } from "@/types/domain";
import { dateTime } from "@/lib/format";
import { Button, Notice, inputClass } from "../ui";
import { api } from "./api";

const EXAMPLES = [
  "이 점포에서 가장 위험한 부분은 무엇인가?",
  "양도인이 주장하는 매출을 신뢰할 수 있는가?",
  "월 순수익이 실제로 얼마나 되는가?",
  "권리금은 부담스러운 수준인가?",
  "양도인에게 어떤 자료를 더 요청해야 하는가?",
  "초기 투자금을 회수하는 데 얼마나 걸리는가?",
];

/** 실사 상담: 질문·답변을 표 형태 기록으로 보여준다 (채팅 말풍선 UI를 쓰지 않음). */
export function ChatPanel({ analysisId, initial, providerLabel }: { analysisId: string; initial: ChatMessage[]; providerLabel: string }) {
  const [messages, setMessages] = useState(initial);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    if (!q.trim()) return;
    setPending(true);
    setError(null);
    try {
      const added = await api<ChatMessage[]>(`/api/analysis/${analysisId}/chat`, { method: "POST", json: { message: q } });
      setMessages((m) => [...m, ...added]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "답변을 받지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  const pairs: Array<{ q: ChatMessage; a?: ChatMessage }> = [];
  for (const m of messages) {
    if (m.role === "user") pairs.push({ q: m });
    else if (pairs.length) pairs[pairs.length - 1].a = m;
  }

  return (
    <div className="space-y-4">
      <Notice>
        답변 방식: {providerLabel}. 저장된 매출 검증·수익성·권리금·위험도 결과만 근거로 답하며, 저장되지 않은 수치는 만들지 않습니다.
      </Notice>
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((q) => (
          <button
            key={q}
            type="button"
            disabled={pending}
            onClick={() => ask(q)}
            className="rounded-sm border border-neutral-300 bg-white px-2 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:text-neutral-400"
          >
            {q}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={2000}
          placeholder="이 매물의 실사 결과에 대해 질문하세요"
          className={inputClass}
        />
        <Button type="submit" variant="primary" disabled={pending || !question.trim()}>
          {pending ? "확인 중…" : "질문"}
        </Button>
      </form>
      {error && <Notice tone="negative">{error}</Notice>}
      {pairs.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-neutral-500">아직 질문 기록이 없습니다.</p>
      ) : (
        <ol className="divide-y divide-neutral-200 rounded-sm border border-neutral-200">
          {[...pairs].reverse().map(({ q, a }) => (
            <li key={q.id} className="grid gap-2 p-4 md:grid-cols-[220px_1fr]">
              <div>
                <p className="text-[11px] text-neutral-500">질문 · {dateTime(q.createdAt)}</p>
                <p className="mt-0.5 text-[13px] font-medium text-neutral-900">{q.content}</p>
              </div>
              <div>
                <p className="text-[11px] text-neutral-500">
                  답변{a && a.citedSources.length > 0 ? ` · 근거 ${a.citedSources.length}건` : ""}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-800">{a?.content ?? "—"}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
