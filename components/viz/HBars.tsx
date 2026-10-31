// 가로 막대 모음 (docs/DESIGN.md 10.3)
// - BepBar: 현재 매출 막대 위 손익분기점 눈금
// - PaybackTimeline: 회수기간 두 줄 + 목표 개월 세로선
// - RangeBars: 시설 AI 추정 범위(띠) + 양도인 반영가(점)
// - CompareBars: 지표 하나를 매물 3개로 비교, 가장 나은 값 강조

import { won } from "@/lib/format";

export function BepBar({ sales, bep }: { sales: number | null; bep: number | null }) {
  if (sales === null || bep === null) return <p className="text-sm text-muted">매출이나 비용을 몰라서 손익분기점을 계산할 수 없어요.</p>;
  const max = Math.max(sales, bep) * 1.15;
  const ok = sales >= bep;
  return (
    <div role="img" aria-label={`현재 월매출 ${won(sales)}, 손익분기점 ${won(bep)}, ${ok ? "여유" : "부족"} ${won(Math.abs(sales - bep))}`}>
      <div className="relative h-8 rounded-lg bg-bg">
        <div className={"viz-bar viz-grow-x absolute inset-y-0 left-0 rounded-lg " + (ok ? "bg-accent/80" : "bg-warn/70")} style={{ width: `${(sales / max) * 100}%` }} />
        <div className="viz-bar absolute -top-1.5 -bottom-1.5 w-0.5 bg-text" style={{ left: `${(bep / max) * 100}%` }} />
      </div>
      <div className="relative mt-1 h-8 text-xs">
        <span className="viz-bar absolute -translate-x-1/2 text-center whitespace-nowrap" style={{ left: `${(bep / max) * 100}%` }}>
          손익분기점
          <br />
          <b className="tabular-nums">{won(bep)}</b>
        </span>
      </div>
      <p className={"mt-1 text-sm font-medium " + (ok ? "text-accent" : "text-warn")}>
        지금 매출이 손익분기점보다 {won(Math.abs(sales - bep))} {ok ? "많아요" : "적어요"}
      </p>
    </div>
  );
}

export function PaybackTimeline({ rows, target }: { rows: { label: string; months: number | null; note: string }[]; target: number | null }) {
  const known = rows.map((r) => r.months ?? 0);
  const max = Math.max(...known, target ?? 0, 12) * 1.15;
  return (
    <div className="space-y-3" role="img" aria-label={rows.map((r) => `${r.label} ${r.months === null ? "회수 불가" : `${r.months}개월`}`).join(", ") + (target ? `, 목표 ${target}개월` : "")}>
      <div className="relative">
        {rows.map((r, i) => {
          const over = target !== null && r.months !== null && r.months > target;
          return (
            <div key={r.label} className="mb-3">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted">{r.label}</span>
                <b className={"tabular-nums " + (r.months === null ? "text-warn" : over ? "text-warn" : "")}>{r.months === null ? "계산할 수 없어요" : `${r.months}개월`}</b>
              </div>
              <div className="relative h-3 rounded-full bg-bg">
                {r.months !== null && (
                  <div
                    className={"viz-bar viz-grow-x absolute inset-y-0 left-0 rounded-full " + (over ? "bg-warn/75" : i === 0 ? "bg-accent/50" : "bg-accent")}
                    style={{ width: `${Math.min(100, (r.months / max) * 100)}%`, animationDelay: `${i * 120}ms` }}
                  />
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-muted">{r.note}</p>
            </div>
          );
        })}
        {target !== null && (
          <div className="viz-bar pointer-events-none absolute -top-1 bottom-4 border-l-2 border-dashed border-text/60" style={{ left: `${(target / max) * 100}%` }}>
            <span className="absolute -top-4 -translate-x-1/2 text-[11px] font-medium whitespace-nowrap">목표 {target}개월</span>
          </div>
        )}
      </div>
    </div>
  );
}

export type RangeRow = { label: string; low: number | null; high: number | null; point: number | null; tag: string; tone: "ok" | "warn" | "muted" };

export function RangeBars({ rows }: { rows: RangeRow[] }) {
  const max = Math.max(...rows.flatMap((r) => [r.high ?? 0, r.point ?? 0]), 1) * 1.1;
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.label} className="viz-fade" style={{ animationDelay: `${i * 50}ms` }}>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="font-medium">{r.label}</span>
            <span className={r.tone === "warn" ? "text-warn" : r.tone === "ok" ? "text-accent" : "text-muted"}>{r.tag}</span>
          </div>
          <div className="relative h-4 rounded-full bg-bg" role="img" aria-label={`${r.label}: 추정 ${won(r.low)}~${won(r.high)}, 반영가 ${won(r.point)}`}>
            {r.low !== null && r.high !== null && (
              <div className="viz-grow-x absolute inset-y-0.5 rounded-full bg-accent/30" style={{ left: `${(r.low / max) * 100}%`, width: `${Math.max(1, ((r.high - r.low) / max) * 100)}%` }} />
            )}
            {r.point !== null && (
              <div
                className={"absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card " + (r.tone === "warn" ? "bg-warn" : r.tone === "ok" ? "bg-accent" : "bg-muted")}
                style={{ left: `${(r.point / max) * 100}%` }}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CompareBars({
  items,
  better,
  format,
}: {
  items: { name: string; value: number | null }[];
  better: "high" | "low";
  format: (v: number) => string;
}) {
  const vals = items.map((i) => i.value).filter((v): v is number => v !== null);
  const max = Math.max(...vals.map(Math.abs), 1);
  const best = vals.length > 1 ? (better === "high" ? Math.max(...vals) : Math.min(...vals)) : null;
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => {
        const isBest = it.value !== null && it.value === best;
        return (
          <li key={it.name} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 text-xs sm:grid-cols-[9rem_1fr_auto]">
            <span className="truncate text-muted" title={it.name}>
              {it.name}
            </span>
            <div className="h-2.5 rounded-full bg-bg">
              {it.value !== null && (
                <div
                  className={"viz-bar viz-grow-x h-full rounded-full " + (it.value < 0 ? "bg-warn/70" : isBest ? "bg-accent" : "bg-accent/35")}
                  style={{ width: `${Math.max(2, (Math.abs(it.value) / max) * 100)}%`, animationDelay: `${i * 80}ms` }}
                />
              )}
            </div>
            <span className={"tabular-nums " + (isBest ? "font-bold text-accent" : it.value === null ? "text-muted" : "")}>{it.value === null ? "미확인" : format(it.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}
