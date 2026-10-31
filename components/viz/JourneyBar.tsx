// 여정 바 (docs/DESIGN.md 10.1-3): 단계 점 + 진행 선. 상태는 실제 데이터로 계산해서 받는다.

import Link from "next/link";

export type JourneyStep = { label: string; status: "done" | "current" | "todo"; href?: string; hint?: string };

export default function JourneyBar({ steps }: { steps: JourneyStep[] }) {
  const doneCount = steps.filter((s) => s.status === "done").length;
  const progress = steps.length > 1 ? Math.min(1, (doneCount + (steps.some((s) => s.status === "current") ? 0.5 : 0)) / (steps.length - 1)) : 0;
  return (
    <nav aria-label={`진행 ${doneCount}/${steps.length}단계`} className="overflow-x-auto">
      <ol className="relative flex min-w-[520px] justify-between">
        {/* 첫 점 가운데 ~ 마지막 점 가운데를 잇는 선 */}
        <span className="absolute top-3.5 h-0.5 bg-border" style={{ left: `${50 / steps.length}%`, right: `${50 / steps.length}%` }} aria-hidden />
        <span
          className="viz-bar viz-grow-x absolute top-3.5 h-0.5 bg-accent"
          style={{ left: `${50 / steps.length}%`, width: `${(100 - 100 / steps.length) * progress}%` }}
          aria-hidden
        />
        {steps.map((s, i) => {
          const dot = (
            <span
              className={
                "relative z-10 flex size-7 items-center justify-center rounded-full text-xs font-bold transition-colors " +
                (s.status === "done" ? "bg-accent text-white" : s.status === "current" ? "bg-card text-accent ring-2 ring-accent" : "bg-card text-muted ring-1 ring-border")
              }
            >
              {s.status === "done" ? "✓" : i + 1}
              {s.status === "current" && <span className="viz-pulse absolute -inset-1 rounded-full ring-2 ring-accent/30" aria-hidden />}
            </span>
          );
          return (
            <li key={s.label} className="flex flex-1 flex-col items-center text-center" aria-current={s.status === "current" ? "step" : undefined}>
              {s.href ? <Link href={s.href}>{dot}</Link> : dot}
              <span className={"mt-1.5 text-xs " + (s.status === "current" ? "font-bold text-text" : s.status === "done" ? "text-text" : "text-muted")}>{s.label}</span>
              {s.hint && <span className="text-[11px] text-muted">{s.hint}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
