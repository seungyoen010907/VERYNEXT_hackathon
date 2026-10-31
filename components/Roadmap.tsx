// 계약 로드맵: 전체 단계와 현재 위치

import type { RoadmapStep } from "@/lib/types";

export default function Roadmap({ steps }: { steps: RoadmapStep[] }) {
  return (
    <ol className="space-y-1">
      {steps.map((step, i) => (
        <li key={step.key} className="flex items-center gap-3 py-1">
          <span
            className={
              "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs " +
              (step.status === "done"
                ? "border-border bg-bg text-muted"
                : step.status === "current"
                  ? "border-accent bg-accent font-bold text-white"
                  : "border-border text-muted")
            }
          >
            {step.status === "done" ? "✓" : i + 1}
          </span>
          <span
            className={
              step.status === "current"
                ? "font-bold text-accent"
                : step.status === "done"
                  ? "text-muted line-through"
                  : "text-muted"
            }
          >
            {step.title}
          </span>
          {step.status === "current" && <span className="text-xs text-accent">지금 단계</span>}
        </li>
      ))}
    </ol>
  );
}
