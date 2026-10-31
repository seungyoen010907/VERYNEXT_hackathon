// 상태 표시용 작은 태그 (docs/DESIGN.md 9번: 상태는 태그로 통일)

export type TagTone = "accent" | "warn" | "caution" | "muted" | "outline";

const STYLE: Record<TagTone, string> = {
  accent: "bg-accent text-white",
  warn: "bg-warn/10 text-warn",
  caution: "bg-caution/10 text-caution",
  muted: "bg-border/70 text-muted",
  outline: "bg-accent/10 text-accent",
};

export default function Tag({ tone = "muted", children }: { tone?: TagTone; children: React.ReactNode }) {
  return <span className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${STYLE[tone]}`}>{children}</span>;
}
