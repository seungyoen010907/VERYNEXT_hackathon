// 계약 로드맵: 전체 단계와 현재 위치를 가로 한 줄로

import type { RoadmapStep } from "@/lib/types";

export default function Roadmap({ steps }: { steps: RoadmapStep[] }) {
  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-[640px]">
        {steps.map((step, i) => (
          <li key={step.key} className="relative flex flex-1 flex-col items-center text-center">
            {/* 앞 단계와 잇는 선 */}
            {i > 0 && (
              <span
                className={
                  "absolute top-3 right-1/2 h-0.5 w-full -translate-y-1/2 " +
                  (step.status === "todo" ? "bg-card" : "bg-accent/40")
                }
                aria-hidden
              />
            )}
            <span
              className={
                "relative z-10 flex size-6 items-center justify-center rounded-full text-xs " +
                (step.status === "done"
                  ? "bg-card text-accent"
                  : step.status === "current"
                    ? "bg-accent font-bold text-white"
                    : "bg-card text-muted")
              }
            >
              {step.status === "done" ? "✓" : i + 1}
            </span>
            <span
              className={
                "mt-1.5 px-1 text-xs " +
                (step.status === "current" ? "font-bold text-accent" : "text-muted")
              }
            >
              {step.title}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
