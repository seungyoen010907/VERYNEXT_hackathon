"use client";

// 거래방 메시지. Step 1은 가짜 데이터로 화면에만 추가한다.
// Step 4에서 3초마다 GET /api/deals/[id]/messages?after=... 로 새 메시지를 가져온다.

import { useEffect, useRef, useState } from "react";
import { ROLE_LABEL } from "@/components/RoleSwitch";
import { formatTime } from "@/lib/format";
import type { Message, Role } from "@/lib/types";

export default function Messages({ initial, role }: { initial: Message[]; role: Role }) {
  const [messages, setMessages] = useState(initial);
  const [body, setBody] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  // 새 메시지가 생기면 맨 아래로 스크롤
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), created_at: new Date().toISOString(), role, body: text.slice(0, 2000) },
    ]);
    setBody("");
  }

  return (
    <div className="flex h-full flex-col">
      <ul ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.map((m) => {
          if (m.role === "agent") {
            return (
              <li key={m.id} className="rounded-xl bg-bg px-3 py-2 text-center text-sm text-muted">
                <span className="font-medium">{ROLE_LABEL.agent}</span> · {m.body}
              </li>
            );
          }
          const mine = m.role === role;
          return (
            <li key={m.id} className={mine ? "flex flex-col items-end" : "flex flex-col items-start"}>
              <span className="mb-1 text-xs text-muted">
                {ROLE_LABEL[m.role]} · {formatTime(m.created_at)}
              </span>
              <p
                className={
                  "max-w-[85%] rounded-xl px-3 py-2 text-sm break-words " +
                  (mine ? "bg-accent text-white" : "border border-border bg-card")
                }
              >
                {m.body}
              </p>
            </li>
          );
        })}
      </ul>
      <form onSubmit={send} className="mt-4 flex shrink-0 gap-2 border-t border-border pt-4">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          placeholder={`${ROLE_LABEL[role]}으로 메시지 보내기`}
          className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!body.trim()}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          보내기
        </button>
      </form>
    </div>
  );
}
