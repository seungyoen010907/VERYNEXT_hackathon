// 에이전트 연결도 (AI 실사, docs/DESIGN.md 10.5): 가운데 양수인 AI ↔ 양도인 AI 최대 3개.
// 선 색 = 그 매물 질문들의 실제 상태. 점선이 흐르는 건 실제로 전달 대기·응답 중인 질문이 있을 때만.

import AgentIcon from "@/components/viz/AgentIcon";

export type GraphNode = {
  id: string;
  name: string;
  answered: number;
  waiting: number; // 전달 대기·응답 중
  pending: number; // 양도인 승인 대기
  blocked: number; // 거절·자료 없음·오류
  total: number;
};

export default function AgentGraph({ nodes, onSelect, selected }: { nodes: GraphNode[]; onSelect?: (id: string) => void; selected?: string | null }) {
  const W = 560;
  const H = 230;
  const cx = 110;
  const cy = H / 2;
  const xs = W - 150;
  const ys = nodes.map((_, i) => (nodes.length === 1 ? cy : 40 + (i * (H - 80)) / (nodes.length - 1)));
  const tone = (n: GraphNode) => (n.waiting > 0 ? "var(--accent)" : n.pending > 0 ? "var(--caution)" : n.answered > 0 && n.blocked === 0 ? "var(--accent)" : n.blocked > 0 ? "var(--warn)" : "var(--border)");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={nodes.map((n) => `${n.name}: 답변 ${n.answered}, 승인 대기 ${n.pending}, 진행 중 ${n.waiting}, 막힘 ${n.blocked}`).join(". ")}>
      {nodes.map((n, i) => {
        const path = `M${cx + 34} ${cy} C ${cx + 150} ${cy}, ${xs - 150} ${ys[i]}, ${xs - 30} ${ys[i]}`;
        return (
          <g key={n.id}>
            <path d={path} fill="none" stroke="var(--border)" strokeWidth="6" strokeLinecap="round" />
            <path d={path} fill="none" stroke={tone(n)} strokeWidth="2.5" strokeLinecap="round" className={n.waiting > 0 ? "viz-flow" : "viz-draw"} style={{ ["--len" as string]: 500 }} />
          </g>
        );
      })}
      {/* 양수인 AI */}
      <g>
        <circle cx={cx} cy={cy} r="34" fill="var(--accent)" />
        <foreignObject x={cx - 13} y={cy - 18} width="26" height="26">
          <div className="text-white">
            <AgentIcon agent="buyer" className="size-[26px]" />
          </div>
        </foreignObject>
        <text x={cx} y={cy + 18} textAnchor="middle" fontSize="10" fill="white" fontWeight="700">
          양수인 AI
        </text>
      </g>
      {/* 양도인 AI */}
      {nodes.map((n, i) => {
        const sel = selected === n.id;
        return (
          <g key={n.id} onClick={() => onSelect?.(n.id)} className={onSelect ? "cursor-pointer" : ""} role={onSelect ? "button" : undefined} aria-label={`${n.name} 질문 보기`}>
            <rect x={xs - 30} y={ys[i] - 26} width="170" height="52" rx="12" fill="var(--card)" stroke={sel ? "var(--accent)" : "var(--border)"} strokeWidth={sel ? 2 : 1} />
            <foreignObject x={xs - 22} y={ys[i] - 12} width="24" height="24">
              <div className="text-muted">
                <AgentIcon agent="seller" className="size-6" />
              </div>
            </foreignObject>
            <text x={xs + 8} y={ys[i] - 5} fontSize="11" fontWeight="700" fill="var(--text)">
              {n.name.length > 13 ? n.name.slice(0, 13) + "…" : n.name}
            </text>
            <text x={xs + 8} y={ys[i] + 11} fontSize="10" fill="var(--muted)">
              답변 {n.answered}/{n.total}
              {n.pending ? ` · 승인 대기 ${n.pending}` : ""}
              {n.waiting ? ` · 진행 ${n.waiting}` : ""}
            </text>
            {n.waiting > 0 && <circle cx={xs + 132} cy={ys[i] - 14} r="4" fill="var(--accent)" className="viz-pulse" />}
          </g>
        );
      })}
    </svg>
  );
}
