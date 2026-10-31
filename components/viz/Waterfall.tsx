// 폭포 막대: 매출 → −변동비 → 매출총이익 → −고정비 → 월순수익 (docs/DESIGN.md 10.3). 조정하면 막대가 부드럽게 바뀐다.

import { won } from "@/lib/format";

export type WaterStep = { label: string; value: number; kind: "total" | "minus" };

export default function Waterfall({ steps }: { steps: WaterStep[] }) {
  // 누적 위치 계산: total은 0부터, minus는 직전 누적에서 내려간다
  const bars: (WaterStep & { from: number; to: number })[] = [];
  for (const s of steps) {
    const prev = bars.length ? (bars[bars.length - 1].kind === "total" ? bars[bars.length - 1].to : bars[bars.length - 1].from) : 0;
    bars.push(s.kind === "total" ? { ...s, from: 0, to: s.value } : { ...s, from: prev - s.value, to: prev });
  }
  const top = Math.max(...bars.map((b) => Math.max(b.from, b.to)), 1);
  const bottom = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
  const span = top - bottom || 1;
  const W = 340;
  const H = 150;
  const bw = W / bars.length;
  const y = (v: number) => ((top - v) / span) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H + 34}`} className="w-full" role="img" aria-label={steps.map((s) => `${s.label} ${s.kind === "minus" ? "−" : ""}${won(s.value)}`).join(", ")}>
      {bottom < 0 && <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--border)" />}
      {bars.map((b, i) => {
        const x = i * bw + bw * 0.18;
        const w = bw * 0.64;
        const y1 = y(Math.max(b.from, b.to));
        const h = Math.max(2, Math.abs(y(b.from) - y(b.to)));
        const negative = b.kind === "total" && b.value < 0;
        const fill = b.kind === "minus" ? "var(--muted)" : negative ? "var(--warn)" : "var(--accent)";
        return (
          <g key={b.label}>
            <rect x={x} y={y1} width={w} height={h} rx="3" fill={fill} opacity={b.kind === "minus" ? 0.45 : 0.9} className="viz-bar viz-grow-y" style={{ animationDelay: `${i * 90}ms` }} />
            {/* 다음 막대로 잇는 선: 이 단계가 끝난 누적 금액 높이 */}
            {i < bars.length - 1 && <line x1={x + w} x2={x + bw + bw * 0.18} y1={y(b.kind === "total" ? b.to : b.from)} y2={y(b.kind === "total" ? b.to : b.from)} stroke="var(--border)" strokeDasharray="3 3" />}
            <text x={x + w / 2} y={y1 - 4} textAnchor="middle" fontSize="9" fill="var(--text)" className="tabular-nums">
              {b.kind === "minus" ? "−" : ""}
              {Math.round(b.value / 10_000).toLocaleString("ko-KR")}만
            </text>
            <text x={x + w / 2} y={H + 16} textAnchor="middle" fontSize="10" fill="var(--muted)">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
