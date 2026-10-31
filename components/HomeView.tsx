"use client";

// 역할별 홈 (docs/DESIGN.md 10.5). 양수인: 여정 바 + 다음 할 일 + 실사 연결도 + 에이전트 / 양도인: 매물별 준비도 + 요청 + 에이전트.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@/components/RoleSwitch";
import Tag from "@/components/Tag";
import AgentGraph, { type GraphNode } from "@/components/viz/AgentGraph";
import AgentIcon from "@/components/viz/AgentIcon";
import JourneyBar from "@/components/viz/JourneyBar";
import { AGENTS, type AgentActivity } from "@/lib/agent-registry";
import { apiFetch } from "@/lib/api-client";
import type { BuyerProfile } from "@/lib/facts";
import { formatTime, won } from "@/lib/format";

type Status = "done" | "current" | "todo";
type BuyerHome = {
  role: "buyer";
  profile: BuyerProfile | null;
  steps: Status[];
  next: { label: string; href: string; hint: string };
  nodes: (GraphNode & { is_sample: boolean })[];
  agents: AgentActivity[];
  deal_rooms: number;
};
type SellerListing = {
  id: string;
  name: string;
  business_type: string;
  status: string;
  is_sample: boolean;
  steps: Status[];
  documents: number;
  analyzed: number;
  failed: number;
  pending_requests: number;
  answered: number;
  questions: number;
  buyers: number;
  deal_rooms: number;
};
type SellerHome = { role: "seller"; listings: SellerListing[]; agents: AgentActivity[]; pending_total: number };

const BUYER_STEPS = [
  { label: "내 조건", href: "/buyer/profile" },
  { label: "매물 고르기", href: "/listings" },
  { label: "AI 실사", href: "/diligence" },
  { label: "비교·결정", href: "/compare" },
  { label: "거래 진행", href: "/deals" },
];
const SELLER_STEPS = ["매물 등록", "자료 올리기", "공개 범위", "매물 공개", "요청 응대", "거래 진행"];
const SELLER_NEXT: Record<number, string> = {
  1: "자료를 올리면 AI가 숫자를 정리해요",
  2: "자료마다 누구에게 보일지 정해요",
  3: "준비됐으면 매물을 공개해요",
  4: "요청함에서 열람 요청을 처리해요",
  5: "거래방에서 양수인과 이야기해요",
};

export default function HomeView() {
  const user = useUser();
  const [data, setData] = useState<BuyerHome | SellerHome | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    apiFetch<BuyerHome | SellerHome>("/api/home")
      .then((d) => !stop && (setData(d), setError(null)))
      .catch((e: Error) => !stop && setError(e.message));
    return () => {
      stop = true;
    };
  }, [user.id]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="viz-fade">
        <p className="text-sm text-muted">{user.role === "buyer" ? "양수인 모드" : `양도인 모드 · ${user.store ?? user.short}`}</p>
        <h1 className="text-xl font-bold">{user.role === "buyer" ? "인수 준비, 여기까지 왔어요" : "매물 준비, 여기까지 왔어요"}</h1>
      </div>
      {error && <p className="rounded-lg bg-warn/10 p-3 text-sm text-warn">{error}</p>}
      {!data && !error && <p className="text-sm text-muted">불러오는 중...</p>}
      {data?.role === "buyer" && user.role === "buyer" && <Buyer data={data} />}
      {data?.role === "seller" && user.role === "seller" && <Seller data={data} />}
    </div>
  );
}

function Buyer({ data }: { data: BuyerHome }) {
  const p = data.profile;
  return (
    <>
      <section className="viz-fade rounded-xl bg-card p-5">
        <JourneyBar steps={BUYER_STEPS.map((s, i) => ({ ...s, status: data.steps[i] }))} />
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-accent/5 p-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-accent">다음 할 일</p>
            <p className="font-bold">{data.next.label}</p>
            <p className="text-sm text-muted">{data.next.hint}</p>
          </div>
          <Link href={data.next.href} className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
            {data.next.label} →
          </Link>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <section className="viz-fade rounded-xl bg-card p-5" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">최근 AI 실사</h2>
            {data.nodes.length > 0 && (
              <Link href="/diligence" className="text-sm text-accent">
                자세히 →
              </Link>
            )}
          </div>
          {data.nodes.length === 0 ? (
            <p className="mt-3 text-sm text-muted">아직 AI 실사 전이에요. 매물을 최대 3개 담으면 AI가 양도인들에게 한 번에 물어봐요.</p>
          ) : (
            <AgentGraph nodes={data.nodes} />
          )}
        </section>

        <section className="viz-fade rounded-xl bg-card p-5" style={{ animationDelay: "120ms" }}>
          <div className="flex items-center justify-between">
            <h2 className="font-bold">내 조건</h2>
            <Link href="/buyer/profile" className="text-sm text-accent">
              {p ? "수정" : "입력"}
            </Link>
          </div>
          {p ? (
            <dl className="mt-3 space-y-1.5 text-sm">
              {[
                ["총예산", won(p.budget_total)],
                ["목표 월 순수익", won(p.target_monthly_profit)],
                ["희망 지역", p.regions.join(", ") || "미입력"],
                ["업종", p.business_types.join(", ") || "미입력"],
                ["근무 가능", p.weekly_hours ? `주 ${p.weekly_hours}시간` : "미입력"],
                ["목표 회수기간", p.payback_months ? `${p.payback_months}개월` : "미입력"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted">조건을 넣으면 맞는 매물부터 추천해 드려요.</p>
          )}
        </section>
      </div>

      <AgentCards agents={data.agents} />
    </>
  );
}

function Seller({ data }: { data: SellerHome }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {data.pending_total > 0 ? (
          <Link href="/requests" className="viz-fade flex items-center gap-2 rounded-lg bg-caution/10 px-4 py-2 text-sm font-medium text-caution">
            처리할 요청 {data.pending_total}건 보기 →
          </Link>
        ) : (
          <span className="text-sm text-muted">처리할 요청이 없어요.</span>
        )}
        <Link href="/listings/new" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          + 매물 등록
        </Link>
      </div>

      {data.listings.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted">
          아직 매물이 없어요. 첫 매물을 등록하면 자료실과 양도인 AI가 함께 생겨요.{" "}
          <Link href="/listings" className="text-accent">
            샘플 매물로 둘러보기
          </Link>
        </p>
      ) : (
        <ul className="space-y-3">
          {data.listings.map((l, i) => {
            const current = l.steps.findIndex((s) => s === "current");
            const done = l.steps.filter((s) => s === "done").length;
            return (
              <li key={l.id} className="viz-fade rounded-xl bg-card p-5" style={{ animationDelay: `${i * 70}ms` }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-bold">
                      {l.name} {l.is_sample && <Tag>샘플</Tag>} {l.status === "published" ? <Tag tone="outline">공개 중</Tag> : <Tag>초안</Tag>}
                    </p>
                    <p className="text-sm text-muted">
                      {l.business_type} · 준비 {done}/6
                      {current >= 0 && SELLER_NEXT[current] ? ` · 다음: ${SELLER_NEXT[current]}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {l.pending_requests > 0 && (
                      <Link href={`/listings/${l.id}/requests`} className="rounded-lg bg-caution/10 px-3 py-1.5 text-sm font-medium text-caution">
                        요청 {l.pending_requests}
                      </Link>
                    )}
                    <Link href={`/listings/${l.id}`} className="rounded-lg bg-bg px-3 py-1.5 text-sm">
                      자료실 열기
                    </Link>
                  </div>
                </div>
                {/* 준비도: 6칸 */}
                <ol className="mt-4 grid grid-cols-6 gap-1" aria-label={`준비 ${done}/6단계`}>
                  {SELLER_STEPS.map((s, j) => (
                    <li key={s} className="min-w-0">
                      <span
                        className={
                          "viz-grow-x block h-1.5 rounded-full " + (l.steps[j] === "done" ? "bg-accent" : l.steps[j] === "current" ? "viz-pulse bg-accent/50" : "bg-border")
                        }
                        style={{ animationDelay: `${j * 60}ms` }}
                      />
                      <span className={"mt-1 block truncate text-[11px] " + (l.steps[j] === "current" ? "font-bold text-text" : "text-muted")}>{s}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>AI가 읽은 자료 {l.analyzed}/{l.documents}</span>
                  <span>AI 답변 {l.answered}/{l.questions}</span>
                  <span>관심 보인 양수인 {l.buyers}명</span>
                  <span>거래방 {l.deal_rooms}개</span>
                  {l.failed > 0 && <span className="text-warn">읽지 못한 자료 {l.failed}개</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AgentCards agents={data.agents} />
    </>
  );
}

export function AgentCards({ agents }: { agents: AgentActivity[] }) {
  return (
    <section aria-label="AI 에이전트">
      <h2 className="mb-2 text-sm font-bold text-muted">AI 에이전트</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {agents.map((a, i) => {
          const meta = AGENTS[a.key];
          return (
            <li key={a.key} className="viz-fade rounded-xl bg-card p-4" style={{ animationDelay: `${150 + i * 60}ms` }} title={meta.does}>
              <div className="flex items-center gap-2">
                <span className={"flex size-8 items-center justify-center rounded-lg " + (a.active ? "bg-accent text-white" : "bg-bg text-muted")}>
                  <AgentIcon agent={a.key} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold">
                    {meta.no} {meta.name}
                  </p>
                  <p className="text-[11px] text-muted">{a.active ? "일하는 중" : "대기 중"}</p>
                </div>
                {a.active && <span className="viz-pulse ml-auto size-2 rounded-full bg-accent" aria-label="작업 중" />}
              </div>
              <p className="mt-3 text-sm font-medium">{a.stat}</p>
              <p className="text-xs text-muted">{a.detail}</p>
              <p className="mt-1 text-[11px] text-muted">{a.last_at ? `마지막 활동 ${formatTime(a.last_at)}` : "아직 활동이 없어요"}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
