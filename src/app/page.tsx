import Link from "next/link";
import { DOCUMENT_TYPE_LABELS, RISK_LEVELS, type RiskLevel } from "@/types/domain";
import { ActivityTimeline } from "@/components/store/activity-tab";
import { DocumentStatusBadge, RiskBadge, RISK_TONE, StoreStatusBadge, VerificationLevelBadge } from "@/components/status";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/table";
import { Badge, ButtonLink, Dot, Kpi, KpiRow, Notice, Panel, Progress, TestDataBadge } from "@/components/ui";
import { dateTime, pct, won } from "@/lib/format";
import { requestContext } from "@/server/http";
import { STAGE_LABELS } from "@/server/repo/diligence";
import { dashboardData } from "@/server/views";

const RISK_ORDER: RiskLevel[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"];

export default async function DashboardPage() {
  const { db, viewer } = await requestContext();
  const d = await dashboardData(db, viewer);
  const riskMax = Math.max(1, ...RISK_LEVELS.map((l) => d.riskTotals[l]));
  const recentStores = [...d.overviews].sort((a, b) => b.store.createdAt.localeCompare(a.store.createdAt)).slice(0, 6);
  const recentAnalyses = d.overviews
    .filter((o) => o.summary)
    .sort((a, b) => b.summary!.completedAt.localeCompare(a.summary!.completedAt))
    .slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-neutral-600">
          {viewer.role === "seller" ? "내 매물과 공개 매물" : "공개된 매물"} 기준 · 평균 실사 진행률 {d.kpi.progressAvg}% · 검토 필요 {d.kpi.review}건
        </p>
        {viewer.role !== "buyer" && <ButtonLink href="/stores/new" variant="primary">매물 등록</ButtonLink>}
      </div>

      <KpiRow>
        <Kpi label="전체 매물" value={d.kpi.total} href="/stores" />
        <Kpi label="실사 진행 중" value={d.kpi.inProgress} sub="작성 중 · 검증 신청 · 분석 중" href="/diligence" />
        <Kpi label="검증 완료" value={d.kpi.verified} href="/stores?status=verified" />
        <Kpi label="추가 자료 필요" value={d.kpi.needsDocuments} href="/stores?status=needs_more_documents" emphasis={d.kpi.needsDocuments > 0} />
      </KpiRow>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="실사 진행 현황" flush actions={<Link href="/diligence" className="text-[12px] underline">실사 관리</Link>}>
          <Table>
            <thead>
              <tr>
                <Th>매물</Th>
                <Th>단계</Th>
                <Th width="34%">진행률</Th>
                <Th>검토</Th>
              </tr>
            </thead>
            <tbody>
              {d.overviews.length === 0 && <EmptyRow colSpan={4}>매물이 없습니다.</EmptyRow>}
              {d.overviews.map((o) => (
                <Tr key={o.store.id}>
                  <Td><Link href={`/stores/${o.store.id}`} className="font-medium hover:underline">{o.store.name}</Link></Td>
                  <Td className="whitespace-nowrap text-[12px]">{STAGE_LABELS[o.progress.stage]}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Progress value={o.progress.percent} tone={o.progress.stage === "completed" ? "positive" : o.progress.stage === "review" ? "caution" : "neutral"} />
                      <span className="w-9 text-right text-[12px] tabular-nums">{o.progress.percent}%</span>
                    </div>
                  </Td>
                  <Td>{o.progress.reviewReasons.length > 0 ? <Badge tone="caution">{o.progress.reviewReasons.length}건</Badge> : <span className="text-[12px] text-neutral-400">—</span>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Panel>

        <Panel title="최근 활동 내역" flush>
          <ActivityTimeline activities={d.activities.slice(0, 8)} showStore />
        </Panel>

        <Panel title="자료 제출 현황" flush actions={<Link href="/documents" className="text-[12px] underline">증빙 자료</Link>}>
          <Table>
            <thead>
              <tr>
                <Th>매물</Th>
                <Th align="right">필수 자료</Th>
                <Th>미제출</Th>
                <Th align="right">분석 대기</Th>
                <Th align="right">열린 요청</Th>
              </tr>
            </thead>
            <tbody>
              {d.overviews.map((o) => {
                const c = o.progress.checklist;
                const missing = c.items.filter((i) => i.required && (i.state === "missing" || i.state === "failed"));
                return (
                  <Tr key={o.store.id}>
                    <Td><Link href={`/stores/${o.store.id}?tab=documents`} className="hover:underline">{o.store.name}</Link></Td>
                    <Td align="right" strong>{c.submittedCount}/{c.requiredCount}</Td>
                    <Td className="text-[12px]">{missing.length ? <span className="text-red-700">{missing.map((m) => m.label).join(", ")}</span> : <span className="text-neutral-400">없음</span>}</Td>
                    <Td align="right">{o.progress.pendingDocuments}</Td>
                    <Td align="right">{o.progress.openRequests}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Panel>

        <Panel title="위험 탐지 현황" description="각 매물의 최신 분석 기준" actions={<Link href="/risk" className="text-[12px] underline">위험도 분석</Link>}>
          <ul className="space-y-1.5">
            {RISK_ORDER.map((l) => (
              <li key={l} className="grid grid-cols-[88px_1fr_32px] items-center gap-3 text-[12px]">
                <RiskBadge level={l} />
                <div className="h-2 bg-neutral-100">
                  <div
                    className={RISK_TONE[l] === "critical" ? "h-full bg-red-800" : RISK_TONE[l] === "negative" ? "h-full bg-red-600" : RISK_TONE[l] === "caution" ? "h-full bg-amber-500" : RISK_TONE[l] === "positive" ? "h-full bg-emerald-600" : "h-full bg-neutral-300"}
                    style={{ width: `${(d.riskTotals[l] / riskMax) * 100}%` }}
                  />
                </div>
                <span className="text-right tabular-nums">{d.riskTotals[l]}</span>
              </li>
            ))}
          </ul>
          <p className="mb-1 mt-4 text-[12px] font-medium text-neutral-700">최근 HIGH 이상 탐지</p>
          {d.riskActivities.length === 0 ? (
            <p className="text-[12px] text-neutral-500">없음</p>
          ) : (
            <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
              {d.riskActivities.map((a) => (
                <li key={a.id} className="flex items-start gap-2 py-1.5 text-[12px]">
                  <Dot tone="negative" />
                  <Link href={`/stores/${a.storeId}?tab=risk`} className="min-w-0 flex-1 hover:underline">
                    <span className="text-neutral-500">{a.storeName}</span> · {a.title.replace(/^(CRITICAL|HIGH) 위험 탐지: /, "")}
                  </Link>
                  <span className="whitespace-nowrap text-neutral-400">{dateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="최근 등록 매물" flush actions={<Link href="/stores" className="text-[12px] underline">매물 관리</Link>}>
        <Table>
          <thead>
            <tr>
              <Th>매물</Th>
              <Th>업종 · 지역</Th>
              <Th align="right">보증금</Th>
              <Th align="right">월세</Th>
              <Th align="right">권리금</Th>
              <Th align="right">주장 월매출</Th>
              <Th>상태</Th>
              <Th>등록일</Th>
            </tr>
          </thead>
          <tbody>
            {recentStores.map((o) => (
              <Tr key={o.store.id}>
                <Td>
                  <Link href={`/stores/${o.store.id}`} className="font-medium hover:underline">{o.store.name}</Link>
                  {o.store.isTestData && <span className="ml-1.5"><TestDataBadge /></span>}
                </Td>
                <Td className="whitespace-nowrap text-[12px]">{o.store.industry} · {o.store.region}</Td>
                <Td align="right">{won(o.store.deposit)}</Td>
                <Td align="right">{won(o.store.monthlyRent)}</Td>
                <Td align="right">{won(o.store.premium)}</Td>
                <Td align="right">{won(o.store.claimedMonthlyRevenue, "미입력")}</Td>
                <Td><StoreStatusBadge status={o.store.status} /></Td>
                <Td className="whitespace-nowrap text-[12px]">{dateTime(o.store.createdAt)}</Td>
              </Tr>
            ))}
            {recentStores.length === 0 && <EmptyRow colSpan={8}>매물이 없습니다.</EmptyRow>}
          </tbody>
        </Table>
      </Panel>

      <Panel title="최근 분석 결과" flush>
        <Table>
          <thead>
            <tr>
              <Th>매물</Th>
              <Th>분석 완료</Th>
              <Th>검증 수준</Th>
              <Th align="right">증빙 월매출</Th>
              <Th align="right">월 영업이익</Th>
              <Th align="right">영업이익률</Th>
              <Th align="right">회수 기간</Th>
              <Th>최고 위험</Th>
            </tr>
          </thead>
          <tbody>
            {recentAnalyses.map(({ store, summary: s }) => (
              <Tr key={store.id}>
                <Td><Link href={`/stores/${store.id}?tab=overview`} className="font-medium hover:underline">{store.name}</Link></Td>
                <Td className="whitespace-nowrap text-[12px]">{dateTime(s!.completedAt)}</Td>
                <Td><VerificationLevelBadge level={s!.verificationLevel} /></Td>
                <Td align="right">{won(s!.avgRevenue, "확인 불가")}</Td>
                <Td align="right" className={(s!.avgOperatingProfit ?? 0) < 0 ? "text-red-700" : ""}>{won(s!.avgOperatingProfit, "계산 불가")}</Td>
                <Td align="right">{pct(s!.avgOperatingMargin, 1, "—")}</Td>
                <Td align="right">{s!.paybackMonths !== null ? `${s!.paybackMonths}개월` : s!.paybackStatus === "not_recoverable" ? "회수 불가" : "계산 불가"}</Td>
                <Td><RiskBadge level={s!.overallRisk} /></Td>
              </Tr>
            ))}
            {recentAnalyses.length === 0 && <EmptyRow colSpan={8}>완료된 분석이 없습니다.</EmptyRow>}
          </tbody>
        </Table>
      </Panel>

      {d.uploads.length > 0 && (
        <Panel title="최근 자료 업로드" flush actions={<Link href="/documents" className="text-[12px] underline">전체 보기</Link>}>
          <Table>
            <thead>
              <tr>
                <Th>파일</Th>
                <Th>매물</Th>
                <Th>종류</Th>
                <Th>업로드</Th>
                <Th>상태</Th>
              </tr>
            </thead>
            <tbody>
              {d.uploads.map((u) => (
                <Tr key={u.id}>
                  <Td className="max-w-64 truncate">{u.fileName}</Td>
                  <Td className="text-[12px]"><Link href={`/stores/${u.storeId}?tab=documents`} className="hover:underline">{u.storeName}</Link></Td>
                  <Td className="whitespace-nowrap text-[12px]">{DOCUMENT_TYPE_LABELS[u.documentType]}</Td>
                  <Td className="whitespace-nowrap text-[12px]">{dateTime(u.createdAt)}</Td>
                  <Td><DocumentStatusBadge status={u.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}

      <Notice>문서 분석 모듈: {d.providerStatus.label}. [테스트] 매물은 시연용 가상 데이터입니다.</Notice>
    </div>
  );
}
