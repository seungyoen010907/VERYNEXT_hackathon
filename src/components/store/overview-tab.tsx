import Link from "next/link";
import { dateTime, pct, won } from "@/lib/format";
import type { StoreDetail } from "@/server/views";
import { AnalysisStatusBadge, ChecklistStateBadge, PaybackBadge, RiskBadge, VerificationLevelBadge } from "../status";
import { Table, Td, Th, Tr } from "../table";
import { DefinitionList, Notice, Panel } from "../ui";

export function OverviewTab({ detail }: { detail: StoreDetail }) {
  const { store, bundle, progress, analyses } = detail;
  const avg = bundle?.profits.find((p) => p.periodType === "average");
  const claimed = bundle?.revenueChecks.find((c) => c.checkType === "claimed_vs_evidence");
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <Panel title="실사 요약">
          {bundle ? (
            <>
              <p className="text-[13px] leading-relaxed text-neutral-800">{bundle.analysis.summary}</p>
              <div className="mt-4">
                <DefinitionList
                  columns={4}
                  items={[
                    ["증빙 월평균 매출", won(claimed?.expectedAmount, "확인 불가")],
                    ["월평균 영업이익", won(avg?.operatingProfit, "계산 불가")],
                    ["영업이익률", pct(avg?.operatingMargin, 1, "계산 불가")],
                    ["투자금 회수", bundle.premium?.paybackMonths != null ? `${bundle.premium.paybackMonths}개월` : bundle.premium ? <PaybackBadge status={bundle.premium.paybackStatus} /> : "—"],
                  ]}
                />
              </div>
            </>
          ) : (
            <Notice tone="caution">아직 분석하지 않았습니다. 자료를 제출한 뒤 실사 분석을 실행하세요.</Notice>
          )}
          {store.description && <p className="mt-4 border-t border-neutral-100 pt-3 text-[12px] text-neutral-600">{store.description}</p>}
        </Panel>

        <Panel title="주요 위험" flush actions={<Link href={`/stores/${store.id}?tab=risk`} className="text-[12px] underline">전체 보기</Link>}>
          <Table>
            <thead>
              <tr>
                <Th>수준</Th>
                <Th>위험 항목</Th>
                <Th>권장 조치</Th>
              </tr>
            </thead>
            <tbody>
              {(bundle?.risks ?? []).slice(0, 5).map((r) => (
                <Tr key={r.id}>
                  <Td><RiskBadge level={r.level} /></Td>
                  <Td><span className="font-medium">{r.title}</span><span className="block text-[12px] text-neutral-500">{r.cause}</span></Td>
                  <Td className="text-[12px]">{r.recommendedAction}</Td>
                </Tr>
              ))}
              {!bundle?.risks.length && (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-[12px] text-neutral-500">{bundle ? "탐지된 위험 없음" : "분석 전"}</td></tr>
              )}
            </tbody>
          </Table>
        </Panel>

        <Panel title="분석 이력" flush description="분석은 실행할 때마다 새로 저장되며 이전 결과는 수정되지 않습니다.">
          <Table>
            <thead>
              <tr>
                <Th>실행</Th>
                <Th>상태</Th>
                <Th>검증 수준</Th>
                <Th>부족 자료</Th>
                <Th>엔진</Th>
              </tr>
            </thead>
            <tbody>
              {analyses.map((a, i) => (
                <Tr key={a.id} highlight={i === 0}>
                  <Td className="whitespace-nowrap">{dateTime(a.completedAt ?? a.createdAt)}{i === 0 && <span className="ml-2 text-[11px] text-neutral-500">최신</span>}</Td>
                  <Td><AnalysisStatusBadge status={a.status} /></Td>
                  <Td><VerificationLevelBadge level={a.verificationLevel} /></Td>
                  <Td className="text-[12px]">{a.missingData.length ? a.missingData.join(", ") : "없음"}</Td>
                  <Td muted>v{a.engineVersion}</Td>
                </Tr>
              ))}
              {analyses.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-[12px] text-neutral-500">분석 이력 없음</td></tr>}
            </tbody>
          </Table>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel title="자료 제출 현황" flush actions={<Link href={`/stores/${store.id}?tab=documents`} className="text-[12px] underline">관리</Link>}>
          <ul className="divide-y divide-neutral-100">
            {progress.checklist.items.map((i) => (
              <li key={i.key} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
                <span>{i.label}</span>
                <ChecklistStateBadge state={i.state} required={i.required} />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="검토 필요 항목">
          {progress.reviewReasons.length ? (
            <ul className="list-disc space-y-1 pl-4 text-[13px]">{progress.reviewReasons.map((r) => <li key={r}>{r}</li>)}</ul>
          ) : (
            <p className="text-[12px] text-neutral-500">없음</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
