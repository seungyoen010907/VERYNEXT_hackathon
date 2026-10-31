import Link from "next/link";
import { dateTime, months, won } from "@/lib/format";
import { STAGE_LABELS } from "@/server/repo/diligence";
import type { StoreDetail } from "@/server/views";
import { RunAnalysisButton } from "../client/actions";
import { ListingStatusBadge, RiskBadge, StoreStatusBadge, VerificationLevelBadge } from "../status";
import { Badge, ButtonLink, Notice, Progress, TestDataBadge, cx } from "../ui";

export const STORE_TABS = [
  { key: "overview", label: "개요" },
  { key: "deals", label: "거래 문의" },
  { key: "analysis", label: "실사 분석" },
  { key: "documents", label: "증빙자료" },
  { key: "report", label: "보고서" },
] as const;
export type StoreTab = (typeof STORE_TABS)[number]["key"];

export const ANALYSIS_SUBTABS = [
  { key: "revenue", label: "매출 검증" },
  { key: "profit", label: "수익성 분석" },
  { key: "premium", label: "권리금 분석" },
  { key: "risk", label: "위험도 분석" },
  { key: "missing", label: "누락 자료 · 추가 확인" },
  { key: "chat", label: "AI 상담" },
] as const;
export type AnalysisSubTab = (typeof ANALYSIS_SUBTABS)[number]["key"];

/** 이전 탭 주소(?tab=revenue 등)를 새 구조로 옮긴다 */
export function resolveStoreTab(tab: string | undefined, sub: string | undefined): { tab: StoreTab; sub: AnalysisSubTab } {
  const subs = ANALYSIS_SUBTABS.map((s) => s.key as string);
  if (tab && subs.includes(tab)) return { tab: "analysis", sub: tab as AnalysisSubTab };
  if (tab === "activity") return { tab: "overview", sub: "revenue" };
  const t = STORE_TABS.some((x) => x.key === tab) ? (tab as StoreTab) : "overview";
  return { tab: t, sub: sub && subs.includes(sub) ? (sub as AnalysisSubTab) : "revenue" };
}

export function StoreHeader({ detail, tab, dealCount }: { detail: StoreDetail; tab: StoreTab; dealCount: number }) {
  const { store, progress, summary, canEdit } = detail;
  const missingCount = progress.checklist.items.filter((i) => i.required && (i.state === "missing" || i.state === "failed")).length;
  return (
    <div className="rounded-sm border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-neutral-900">{store.name}</h2>
            <StoreStatusBadge status={store.status} />
            {store.isTestData && <TestDataBadge />}
            {!store.isPublished && <Badge tone="muted">비공개</Badge>}
            <ListingStatusBadge status={store.listingStatus} />
          </div>
          <p className="mt-0.5 text-[12px] text-neutral-500">
            {store.industry} · {store.address} · 영업 {months(store.businessPeriodMonths)} · 등록 {dateTime(store.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {canEdit && (
            <>
              <ButtonLink href={`/listings/${store.id}`}>공개 화면 보기</ButtonLink>
              <ButtonLink href={`/stores/${store.id}/edit`}>정보 수정</ButtonLink>
              <RunAnalysisButton storeId={store.id} label={summary ? "재분석 실행" : "실사 분석 실행"} />
            </>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 border-t border-neutral-200 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["보증금", won(store.deposit)],
          ["월세", won(store.monthlyRent)],
          ["권리금", won(store.premium)],
          ["주장 월매출", won(store.claimedMonthlyRevenue, "미입력")],
          ["주장 월순수익", won(store.claimedMonthlyNetProfit, "미입력")],
          ["증빙 기준 영업이익", summary ? won(summary.avgOperatingProfit, "계산 불가") : "분석 전"],
        ].map(([k, v]) => (
          <div key={k} className="border-b border-r border-neutral-100 px-5 py-2.5 lg:border-b-0">
            <dt className="text-[11px] text-neutral-500">{k}</dt>
            <dd className="mt-0.5 text-[14px] font-semibold tabular-nums text-neutral-900">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 border-t border-neutral-200 px-5 py-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            <span className="font-semibold text-neutral-900">실사 진행 {progress.percent}%</span>
            <span className="text-neutral-600">단계: {STAGE_LABELS[progress.stage]}</span>
            <span className="text-neutral-500">
              필수 자료 {progress.checklist.submittedCount}/{progress.checklist.requiredCount} 제출
            </span>
            <span className="text-neutral-500">
              문서 분석 {progress.analyzedCount}/{progress.documentCount}
            </span>
            {progress.openRequests > 0 && <span className="text-amber-800">열린 자료 요청 {progress.openRequests}건</span>}
          </div>
          <div className="mt-1.5 max-w-xl">
            <Progress value={progress.percent} tone={progress.stage === "completed" ? "positive" : progress.stage === "review" ? "caution" : "neutral"} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-neutral-600">
          검증 수준 <VerificationLevelBadge level={summary?.verificationLevel ?? null} />
          최고 위험 {summary ? <RiskBadge level={summary.overallRisk} /> : <Badge tone="muted">분석 전</Badge>}
        </div>
      </div>

      {(progress.analysisOutdated || missingCount > 0) && (
        <div className="space-y-2 border-t border-neutral-200 px-5 py-3">
          {progress.analysisOutdated && <Notice tone="caution">최근 분석 이후 새 자료가 제출되었습니다. 분석 결과에 반영하려면 재분석을 실행하세요.</Notice>}
          {missingCount > 0 && (
            <Notice tone="caution">
              필수 자료 {missingCount}건이 미제출입니다.{" "}
              <Link href={`/stores/${store.id}?tab=analysis&sub=missing`} className="underline">
                누락 자료 체크리스트 보기
              </Link>
            </Notice>
          )}
        </div>
      )}

      <nav aria-label="매물 상세 탭" className="flex overflow-x-auto border-t border-neutral-200 px-3">
        {STORE_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/stores/${store.id}?tab=${t.key}`}
            scroll={false}
            aria-current={tab === t.key ? "page" : undefined}
            className={cx(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px]",
              tab === t.key ? "border-neutral-900 font-semibold text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900",
            )}
          >
            {t.label}
            {t.key === "deals" && dealCount > 0 && <span className="ml-1 text-[11px] tabular-nums text-neutral-500">{dealCount}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
