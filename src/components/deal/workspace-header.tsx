import Link from "next/link";
import { DEAL_STAGE_FLOW, DEAL_STAGE_LABELS } from "@/types/domain";
import { won } from "@/lib/format";
import type { DealWorkspace } from "@/server/deals/views";
import { StageControl } from "../client/deal-actions";
import { Badge, Progress, TestDataBadge, cx } from "../ui";

export const DEAL_TABS = [
  { key: "overview", label: "개요" },
  { key: "chat", label: "대화" },
  { key: "tasks", label: "실사 관리" },
  { key: "documents", label: "증빙자료" },
  { key: "analysis", label: "분석 및 보고서" },
] as const;
export type DealTab = (typeof DEAL_TABS)[number]["key"];

export function DealStageBadge({ stage }: { stage: keyof typeof DEAL_STAGE_LABELS }) {
  const tone = stage === "completed" ? "positive" : stage === "cancelled" ? "muted" : stage === "terms" || stage === "contract" ? "info" : "neutral";
  return <Badge tone={tone}>{DEAL_STAGE_LABELS[stage]}</Badge>;
}

export function WorkspaceHeader({ w, tab }: { w: DealWorkspace; tab: DealTab }) {
  const idx = DEAL_STAGE_FLOW.indexOf(w.deal.stage);
  const unread = w.messages.filter((m) => m.kind !== "system" && m.senderId !== null).length;
  return (
    <div className="rounded-sm border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <p className="text-[12px] text-neutral-500">
            <Link href="/deals" className="hover:text-neutral-900">거래 관리</Link> / 거래 워크스페이스
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{w.store.name}</h2>
            <DealStageBadge stage={w.deal.stage} />
            {w.store.isTestData && <TestDataBadge />}
          </div>
          <p className="mt-0.5 text-[12px] text-neutral-500">
            {w.role === "buyer" ? "양도인" : "양수인"} {w.counterpartName} · {w.store.industry} · {w.store.region} ·{" "}
            <Link href={`/listings/${w.store.id}`} className="underline">매물 상세 보기</Link>
            {w.role === "seller" && (
              <>
                {" · "}
                <Link href={`/stores/${w.store.id}`} className="underline">내 매물 관리</Link>
              </>
            )}
          </p>
        </div>
        <StageControl dealId={w.deal.id} stage={w.deal.stage} />
      </div>

      <dl className="mt-3 grid grid-cols-2 border-t border-neutral-200 sm:grid-cols-4">
        {[
          ["협의 권리금", won(w.deal.terms.premium, "미정")],
          ["보증금 / 월세", `${won(w.deal.terms.deposit, "미정")} / ${won(w.deal.terms.monthlyRent, "미정")}`],
          ["실사 체크리스트", `${w.tasks.filter((t) => t.status === "done").length}/${w.tasks.length} 완료`],
          [w.role === "buyer" ? "열린 위험 (AI)" : "대화 메시지", w.role === "buyer" ? `${w.findings.filter((f) => f.status === "open").length}건` : `${unread}건`],
        ].map(([k, v]) => (
          <div key={k} className="border-b border-r border-neutral-100 px-5 py-2 sm:border-b-0">
            <dt className="text-[11px] text-neutral-500">{k}</dt>
            <dd className="mt-0.5 text-[13px] font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="border-t border-neutral-200 px-5 py-2.5">
        <ol className="flex flex-wrap gap-x-1 gap-y-1 text-[11px]">
          {DEAL_STAGE_FLOW.map((s, i) => (
            <li key={s} className="flex items-center gap-1">
              <span className={cx("rounded-sm px-1.5 py-0.5", w.deal.stage === s ? "bg-neutral-900 font-semibold text-white" : i < idx ? "text-neutral-800" : "text-neutral-400")}>{DEAL_STAGE_LABELS[s]}</span>
              {i < DEAL_STAGE_FLOW.length - 1 && <span className="text-neutral-300">›</span>}
            </li>
          ))}
          {w.deal.stage === "cancelled" && <li className="rounded-sm bg-neutral-200 px-1.5 py-0.5 font-semibold">거래 중단</li>}
        </ol>
        <div className="mt-2 flex max-w-md items-center gap-2 whitespace-nowrap text-[11px] text-neutral-500">
          실사 진행 <Progress value={w.taskProgress} /> <span className="tabular-nums">{w.taskProgress}%</span>
        </div>
      </div>

      <nav aria-label="거래 탭" className="flex overflow-x-auto border-t border-neutral-200 px-3">
        {DEAL_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/deals/${w.deal.id}?tab=${t.key}`}
            scroll={false}
            aria-current={tab === t.key ? "page" : undefined}
            className={cx(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px]",
              tab === t.key ? "border-neutral-900 font-semibold text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900",
            )}
          >
            {t.label}
            {t.key === "chat" && w.role === "buyer" && w.eligibility.eligible && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-red-600 align-middle" title="AI 분석 가능" />}
          </Link>
        ))}
      </nav>
    </div>
  );
}
