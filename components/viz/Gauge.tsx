// 반원 게이지: 0~1 비율 + 기준선 (매출 증빙률 70%·90%, 추천 점수 등). docs/DESIGN.md 10.3

export default function Gauge({
  value,
  marks = [],
  label,
  sub,
  tone = "accent",
  size = 160,
}: {
  value: number | null; // 0~1 (1을 넘으면 1로 그린다)
  marks?: number[];
  label: string; // 가운데 큰 글자
  sub?: string;
  tone?: "accent" | "warn" | "caution";
  size?: number;
}) {
  const r = 70;
  const c = Math.PI * r; // 반원 둘레
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  const point = (t: number, rad: number) => {
    const a = Math.PI * (1 - t);
    return [80 + rad * Math.cos(a), 84 - rad * Math.sin(a)];
  };
  const color = { accent: "var(--accent)", warn: "var(--warn)", caution: "var(--caution)" }[tone];
  return (
    <figure className="flex flex-col items-center" style={{ width: size }} aria-label={`${label}${sub ? `, ${sub}` : ""}`}>
      <svg viewBox="0 0 160 96" className="w-full" role="img" aria-hidden>
        <path d="M10 84 A70 70 0 0 1 150 84" fill="none" stroke="var(--border)" strokeWidth="12" strokeLinecap="round" />
        {value !== null && (
          <path
            d="M10 84 A70 70 0 0 1 150 84"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${c * v} ${c}`}
            className="viz-draw"
            style={{ ["--len" as string]: c }}
          />
        )}
        {marks.map((m) => {
          const [x1, y1] = point(m, 60);
          const [x2, y2] = point(m, 80);
          return <line key={m} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--muted)" strokeWidth="1.5" />;
        })}
      </svg>
      <figcaption className="-mt-9 text-center">
        <span className="block text-2xl font-bold tabular-nums">{label}</span>
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </figcaption>
    </figure>
  );
}
