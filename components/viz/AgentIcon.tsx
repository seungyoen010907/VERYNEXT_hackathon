// 에이전트 4종 아이콘 (기하학 도형, 캐릭터 금지 — docs/DESIGN.md 10.1). 색은 currentColor.

import type { AgentKey } from "@/lib/agent-registry";

export default function AgentIcon({ agent, className = "size-5" }: { agent: AgentKey; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {agent === "buyer" && (
        <>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
          <circle cx="11" cy="11" r="2" fill="currentColor" stroke="none" />
        </>
      )}
      {agent === "seller" && (
        <>
          <path d="M4 10.5L12 4l8 6.5" />
          <path d="M6 9.5V20h12V9.5" />
          <path d="M10 20v-5h4v5" />
        </>
      )}
      {agent === "document" && (
        <>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v4h4" />
          <path d="M10 12h5M10 15.5h5" />
        </>
      )}
      {agent === "diligence" && (
        <>
          <path d="M4 20h16" />
          <path d="M7 20v-6M12 20V8M17 20v-9" />
          <path d="M6 9l5-4 6 3" />
        </>
      )}
    </svg>
  );
}
