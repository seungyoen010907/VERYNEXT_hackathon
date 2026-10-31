// 월별 막대: 카드+배달(막대) + POS(점). 자료끼리 어긋난 달은 --warn. docs/DESIGN.md 10.3

import { won } from "@/lib/format";

export type MonthBar = { month: string; bar: number | null; dot: number | null; flagged: boolean; confirmed: boolean };

export default function MonthlyBars({ rows, claimed }: { rows: MonthBar[]; claimed?: number | null }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.flatMap((r) => [r.bar ?? 0, r.dot ?? 0]), claimed ?? 0) * 1.1 || 1;
  const W = 320;
  const H = 140;
  const bw = W / rows.length;
  const y = (v: number) => H - (v / max) * H;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" role="img" aria-label={rows.map((r) => `${r.month} 카드+배달 ${won(r.bar)}${r.dot !== null ? `, POS ${won(r.dot)}` : ""}${r.flagged ? " (자료끼리 어긋남)" : ""}`).join(". ")}>
        {claimed ? (
          <g>
            <line x1="0" x2={W} y1={y(claimed)} y2={y(claimed)} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth="1" />
            <text x={W - 2} y={y(claimed) - 4} textAnchor="end" fontSize="9" fill="var(--muted)">
              양도인이 말한 매출
            </text>
          </g>
        ) : null}
        {rows.map((r, i) => {
          const x = i * bw + bw * 0.2;
          const w = bw * 0.6;
          return (
            <g key={r.month}>
              {r.bar !== null && (
                <rect
                  x={x}
                  y={y(r.bar)}
                  width={w}
                  height={H - y(r.bar)}
                  rx="3"
                  fill={r.flagged ? "var(--warn)" : r.confirmed ? "var(--accent)" : "var(--muted)"}
                  opacity={r.flagged ? 0.85 : r.confirmed ? 0.9 : 0.4}
                  className="viz-grow-y"
                  style={{ animationDelay: `${i * 60}ms` }}
                />
              )}
              {r.dot !== null && <circle cx={x + w / 2} cy={y(r.dot)} r="4" fill="var(--card)" stroke={r.flagged ? "var(--warn)" : "var(--text)"} strokeWidth="2" className="viz-fade" style={{ animationDelay: `${300 + i * 60}ms` }} />}
              <text x={x + w / 2} y={H + 14} textAnchor="middle" fontSize="10" fill={r.flagged ? "var(--warn)" : "var(--muted)"}>
                {Number(r.month.slice(5))}월
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <Legend swatch="bg-accent" text="자료끼리 맞는 달" />
        <Legend swatch="bg-muted/40" text="한 가지 자료만 있는 달" />
        <Legend swatch="bg-warn" text="자료끼리 다른 달" />
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full border-2 border-text" /> POS
        </span>
      </figcaption>
    </figure>
  );
}

function Legend({ swatch, text }: { swatch: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block size-2.5 rounded-sm ${swatch}`} /> {text}
    </span>
  );
}
