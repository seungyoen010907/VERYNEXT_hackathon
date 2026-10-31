import Link from "next/link";
import type { ReactNode } from "react";
import { PaybackBadge, RiskBadge } from "@/components/status";
import { Table, Td, Th, Tr } from "@/components/table";
import { Badge, Notice, Panel, TestDataBadge } from "@/components/ui";
import { pct, rate, won } from "@/lib/format";
import { requestContext } from "@/server/http";
import { listStores } from "@/server/repo/stores";
import { comparisonData } from "@/server/views";

type Row = Awaited<ReturnType<typeof comparisonData>>[number];

const MISSING = <span className="text-neutral-400">데이터 부족</span>;

const METRICS: Array<{ label: string; note?: string; render: (r: Row) => ReactNode; value?: (r: Row) => number | null; better?: "high" | "low" }> = [
  { label: "월평균 매출 (증빙)", render: (r) => (r.summary ? won(r.summary.avgRevenue, "") || MISSING : MISSING), value: (r) => r.summary?.avgRevenue ?? null, better: "high" },
  { label: "월평균 영업이익", render: (r) => (r.summary?.avgOperatingProfit != null ? <span className={r.summary.avgOperatingProfit < 0 ? "text-red-700" : ""}>{won(r.summary.avgOperatingProfit)}{r.summary.profitComplete === false && <span className="block text-[11px] text-neutral-500">상한값</span>}</span> : MISSING), value: (r) => r.summary?.avgOperatingProfit ?? null, better: "high" },
  { label: "영업이익률", render: (r) => (r.summary?.avgOperatingMargin != null ? pct(r.summary.avgOperatingMargin) : MISSING), value: (r) => r.summary?.avgOperatingMargin ?? null, better: "high" },
  { label: "월세 비율 (임대료 ÷ 매출)", render: (r) => (r.rentRatio !== null ? rate(r.rentRatio) : MISSING), value: (r) => r.rentRatio, better: "low" },
  { label: "재료비 비율 (재료비 ÷ 매출)", render: (r) => (r.materialRatio !== null ? rate(r.materialRatio) : MISSING), value: (r) => r.materialRatio, better: "low" },
  { label: "권리금", render: (r) => won(r.store.premium), value: (r) => r.store.premium, better: "low" },
  { label: "초기 투자금", render: (r) => (r.summary?.totalInitialInvestment != null ? <>{won(r.summary.totalInitialInvestment)}{(r.store.facilityInvestment === null || r.store.otherInitialCost === null) && <span className="block text-[11px] text-neutral-500">일부 미입력 · 최소값</span>}</> : MISSING), value: (r) => r.summary?.totalInitialInvestment ?? null, better: "low" },
  { label: "투자금 회수 기간", render: (r) => (r.summary?.paybackMonths != null ? `${r.summary.paybackMonths}개월` : r.summary?.paybackStatus ? <PaybackBadge status={r.summary.paybackStatus} /> : MISSING), value: (r) => r.summary?.paybackMonths ?? null, better: "low" },
  { label: "위험 수준 (최고)", render: (r) => (r.summary ? <RiskBadge level={r.summary.overallRisk} /> : MISSING) },
  { label: "HIGH 이상 위험 수", render: (r) => (r.summary ? r.summary.riskCounts.CRITICAL + r.summary.riskCounts.HIGH : MISSING), value: (r) => (r.summary ? r.summary.riskCounts.CRITICAL + r.summary.riskCounts.HIGH : null), better: "low" },
];

export default async function ComparePage({ searchParams }: PageProps<"/compare">) {
  const [sp, { db, viewer }] = await Promise.all([searchParams, requestContext()]);
  const raw = sp.ids;
  const selected = (Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : []).filter(Boolean);
  const stores = await listStores(db, viewer);
  const ids = selected.length ? selected : stores.slice(0, 4).map((s) => s.id);
  const rows = await comparisonData(db, viewer, ids);

  return (
    <div className="space-y-4">
      <Panel title="비교할 매물 선택" description="최대 6개. 각 매물의 최신 완료 분석 결과만 사용합니다.">
        <form action="/compare" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {stores.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-[13px]">
              <input type="checkbox" name="ids" value={s.id} defaultChecked={ids.includes(s.id)} className="size-4 accent-neutral-900" />
              {s.name}
            </label>
          ))}
          <button type="submit" className="ml-auto h-8 rounded-sm border border-neutral-900 bg-neutral-900 px-3 text-[13px] font-medium text-white hover:bg-neutral-800">
            비교
          </button>
        </form>
      </Panel>

      {rows.length < 2 ? (
        <Notice tone="caution">비교하려면 매물을 2개 이상 선택하세요.</Notice>
      ) : (
        <Panel title="점포 데이터 비교" flush description="굵은 값은 해당 지표에서 가장 유리한 매물입니다. '데이터 부족'은 분석 결과가 없거나 계산할 수 없는 항목입니다.">
          <Table>
            <thead>
              <tr>
                <Th width="200px">지표</Th>
                {rows.map((r) => (
                  <Th key={r.store.id} align="right">
                    <Link href={`/stores/${r.store.id}`} className="text-neutral-900 hover:underline">{r.store.name}</Link>
                    <span className="mt-0.5 flex justify-end gap-1">
                      {r.store.isTestData && <TestDataBadge />}
                      {!r.summary && <Badge tone="muted">분석 전</Badge>}
                    </span>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => {
                const values = m.value ? rows.map((r) => m.value!(r)) : [];
                const known = values.filter((v): v is number => v !== null);
                const best = known.length >= 2 ? (m.better === "high" ? Math.max(...known) : Math.min(...known)) : null;
                return (
                  <Tr key={m.label}>
                    <Td muted>{m.label}</Td>
                    {rows.map((r, i) => (
                      <Td key={r.store.id} align="right" strong={best !== null && values[i] === best}>
                        {m.render(r)}
                      </Td>
                    ))}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
