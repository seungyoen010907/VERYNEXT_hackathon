import Link from "next/link";
import { FilterBar, FilterSelect, param } from "@/components/filter-bar";
import { ChecklistStateBadge, RiskBadge } from "@/components/status";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/table";
import { Badge, Kpi, KpiRow, Panel, Progress, TestDataBadge } from "@/components/ui";
import { requestContext } from "@/server/http";
import { STAGE_LABELS, type DiligenceStage } from "@/server/repo/diligence";
import { storeOverviews } from "@/server/views";

export default async function DiligencePage({ searchParams }: PageProps<"/diligence">) {
  const [sp, { db, viewer }] = await Promise.all([searchParams, requestContext()]);
  const stage = param(sp, "stage") as DiligenceStage | undefined;
  const all = await storeOverviews(db, viewer);
  const rows = stage ? all.filter((o) => o.progress.stage === stage) : all;
  const count = (s: DiligenceStage) => all.filter((o) => o.progress.stage === s).length;
  const review = all.filter((o) => o.progress.reviewReasons.length > 0);
  const avg = all.length ? Math.round(all.reduce((a, o) => a + o.progress.percent, 0) / all.length) : 0;
  const itemKeys = all[0]?.progress.checklist.items.map((i) => ({ key: i.key, label: i.label })) ?? [];

  return (
    <div className="space-y-4">
      <KpiRow>
        <Kpi label="전체 실사 진행률 (평균)" value={`${avg}%`} sub={`${all.length}개 매물`} />
        <Kpi label="자료 수집 · 문서 분석" value={count("collecting") + count("document_analysis") + count("awaiting_analysis")} href="/diligence?stage=collecting" />
        <Kpi label="검토 필요" value={count("review")} href="/diligence?stage=review" emphasis={count("review") > 0} />
        <Kpi label="실사 완료 (보고서 생성)" value={count("completed")} href="/diligence?stage=completed" />
      </KpiRow>

      <FilterBar action="/diligence" resetHref="/diligence" total={rows.length}>
        <FilterSelect name="stage" label="실사 단계" value={stage} options={(Object.keys(STAGE_LABELS) as DiligenceStage[]).map((s) => ({ value: s, label: STAGE_LABELS[s] }))} />
      </FilterBar>

      <Panel title="점포별 실사 상태" flush description="진행률 = 필수 자료 제출(50) + 문서 분석(20) + 실사 분석(20, 최신 자료 반영 시) + 보고서(10)">
        <Table>
          <thead>
            <tr>
              <Th>매물</Th>
              <Th>단계</Th>
              <Th width="140px">진행률</Th>
              <Th align="right">필수 자료</Th>
              <Th align="right">분석 대기 문서</Th>
              <Th align="right">열린 요청</Th>
              <Th>최고 위험</Th>
              <Th>검토 필요 사유</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={8}>해당 단계의 매물이 없습니다.</EmptyRow>}
            {rows.map(({ store, progress, summary }) => (
              <Tr key={store.id}>
                <Td>
                  <Link href={`/stores/${store.id}?tab=documents`} className="font-medium hover:underline">{store.name}</Link>
                  {store.isTestData && <span className="ml-1"><TestDataBadge /></span>}
                </Td>
                <Td>
                  <Badge tone={progress.stage === "completed" ? "positive" : progress.stage === "review" ? "caution" : "neutral"}>{STAGE_LABELS[progress.stage]}</Badge>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <Progress value={progress.percent} tone={progress.stage === "completed" ? "positive" : progress.stage === "review" ? "caution" : "neutral"} />
                    <span className="w-8 text-right text-[12px] tabular-nums">{progress.percent}%</span>
                  </div>
                </Td>
                <Td align="right" strong>{progress.checklist.submittedCount}/{progress.checklist.requiredCount}</Td>
                <Td align="right">{progress.pendingDocuments}</Td>
                <Td align="right">{progress.openRequests}</Td>
                <Td>{summary ? <RiskBadge level={summary.overallRisk} /> : <Badge tone="muted">분석 전</Badge>}</Td>
                <Td className="text-[12px]">{progress.reviewReasons.length ? progress.reviewReasons.join(" · ") : <span className="text-neutral-400">—</span>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <Panel title="자료 제출 매트릭스" flush description="점포별 체크리스트 항목 상태. 셀을 누르면 해당 점포의 증빙 자료 화면으로 이동합니다.">
        <Table>
          <thead>
            <tr>
              <Th>매물</Th>
              {itemKeys.map((i) => <Th key={i.key}>{i.label}</Th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ store, progress }) => (
              <Tr key={store.id}>
                <Td className="whitespace-nowrap font-medium">{store.name}</Td>
                {progress.checklist.items.map((i) => (
                  <Td key={i.key}>
                    <Link href={`/stores/${store.id}?tab=documents`}><ChecklistStateBadge state={i.state} required={i.required} /></Link>
                  </Td>
                ))}
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      {review.length > 0 && (
        <Panel title={`검토가 필요한 항목 (${review.length})`} flush>
          <ul className="divide-y divide-neutral-100">
            {review.map(({ store, progress }) => (
              <li key={store.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2 text-[13px]">
                <Link href={`/stores/${store.id}?tab=risk`} className="font-medium hover:underline">{store.name}</Link>
                <span className="text-[12px] text-neutral-600">{progress.reviewReasons.join(" · ")}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
