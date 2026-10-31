import Link from "next/link";
import {
  RISK_CATEGORIES,
  RISK_CATEGORY_LABELS,
  RISK_LEVELS,
  RISK_LEVEL_ORDER,
  type RiskCategory,
  type RiskLevel,
} from "@/types/domain";
import { RiskItem } from "@/components/analysis/risk-section";
import { FilterBar, FilterSelect, param } from "@/components/filter-bar";
import { RiskBadge } from "@/components/status";
import { Table, Td, Th, Tr } from "@/components/table";
import { Kpi, KpiRow, Notice, Panel, TestDataBadge } from "@/components/ui";
import { requestContext } from "@/server/http";
import { analysisHref, latestBundles } from "@/server/views";
import { DiligenceSubnav } from "@/components/diligence-subnav";

export default async function RiskPage({ searchParams }: PageProps<"/risk">) {
  const [sp, { db, viewer }] = await Promise.all([searchParams, requestContext()]);
  const level = param(sp, "level") as RiskLevel | undefined;
  const category = param(sp, "category") as RiskCategory | undefined;
  const rows = await latestBundles(db, viewer);
  const all = rows.flatMap((r) => (r.bundle?.risks ?? []).map((risk) => ({ risk, store: r.store, href: analysisHref(r, "risk") })));
  const filtered = all
    .filter((x) => (!level || x.risk.level === level) && (!category || x.risk.category === category))
    .sort((a, b) => RISK_LEVEL_ORDER[b.risk.level] - RISK_LEVEL_ORDER[a.risk.level]);
  const count = (l: RiskLevel) => all.filter((x) => x.risk.level === l).length;

  return (
    <div className="space-y-4">
      <DiligenceSubnav active="/risk" />
      <KpiRow>
        <Kpi label="CRITICAL" value={count("CRITICAL")} href="/risk?level=CRITICAL" emphasis={count("CRITICAL") > 0} />
        <Kpi label="HIGH" value={count("HIGH")} href="/risk?level=HIGH" />
        <Kpi label="MEDIUM · LOW" value={count("MEDIUM") + count("LOW")} href="/risk?level=MEDIUM" />
        <Kpi label="UNKNOWN (자료 부족)" value={count("UNKNOWN")} href="/risk?level=UNKNOWN" />
      </KpiRow>

      <Panel title="위험 유형별 탐지 현황" flush description="행: 위험 유형, 열: 심각도. 숫자를 누르면 해당 위험만 볼 수 있습니다.">
        <Table>
          <thead>
            <tr>
              <Th>위험 유형</Th>
              {(["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"] as RiskLevel[]).map((l) => <Th key={l} align="right">{l}</Th>)}
            </tr>
          </thead>
          <tbody>
            {RISK_CATEGORIES.map((c) => (
              <Tr key={c}>
                <Td>{RISK_CATEGORY_LABELS[c]}</Td>
                {(["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"] as RiskLevel[]).map((l) => {
                  const n = all.filter((x) => x.risk.category === c && x.risk.level === l).length;
                  return (
                    <Td key={l} align="right">
                      {n ? <Link href={`/risk?level=${l}&category=${c}`} className="font-semibold underline-offset-2 hover:underline">{n}</Link> : <span className="text-neutral-300">0</span>}
                    </Td>
                  );
                })}
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <FilterBar action="/risk" resetHref="/risk" total={filtered.length}>
        <FilterSelect name="level" label="위험 수준" value={level} options={RISK_LEVELS.map((l) => ({ value: l, label: l }))} />
        <FilterSelect name="category" label="위험 유형" value={category} options={RISK_CATEGORIES.map((c) => ({ value: c, label: RISK_CATEGORY_LABELS[c] }))} />
      </FilterBar>

      <Notice>자료가 부족하다는 이유만으로 허위·사기로 판단하지 않습니다. UNKNOWN은 판단할 근거가 부족하다는 뜻입니다.</Notice>

      {filtered.length === 0 ? (
        <Notice>조건에 맞는 위험이 없습니다.</Notice>
      ) : (
        <Panel title="탐지된 위험 (각 매물의 최신 분석)" flush>
          <div className="divide-y divide-neutral-200">
            {filtered.map(({ risk, store, href }) => (
              <div key={risk.id}>
                <div className="flex items-center gap-2 bg-neutral-50 px-4 py-1.5 text-[12px]">
                  <RiskBadge level={risk.level} />
                  <Link href={href} className="font-medium hover:underline">{store.name}</Link>
                  {store.isTestData && <TestDataBadge />}
                </div>
                <RiskItem risk={risk} storeId={store.id} />
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
