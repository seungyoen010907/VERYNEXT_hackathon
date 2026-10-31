import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, type ExpenseCategory, type ProfitAnalysis } from "@/types/domain";
import { pct, won, ym } from "@/lib/format";
import type { StoreDetail } from "@/server/views";
import { MonthlyBarChart, ProfitBarChart } from "../charts";
import { Amount, Findings } from "../findings";
import { Table, Td, Th, Tr } from "../table";
import { Badge, Kpi, KpiRow, Panel } from "../ui";
import { NoAnalysis } from "./revenue-section";

const COST_COLUMN: Record<ExpenseCategory, keyof ProfitAnalysis> = {
  material: "materialCost",
  labor: "laborCost",
  rent: "rentCost",
  maintenance: "maintenanceCost",
  utilities: "utilitiesCost",
  delivery_fee: "deliveryFee",
  advertising: "advertisingCost",
  other: "otherCost",
};

export function ProfitSection({ detail }: { detail: StoreDetail }) {
  const { bundle, store } = detail;
  if (!bundle) return <NoAnalysis />;
  const avg = bundle.profits.find((p) => p.periodType === "average") ?? null;
  const monthly = bundle.profits.filter((p) => p.periodType === "monthly");
  if (!avg) return <NoAnalysis>매출 증빙이 없어 수익성을 계산하지 못했습니다.</NoAnalysis>;
  const snapshot = bundle.analysis.inputSnapshot as { costSources?: Array<{ category: ExpenseCategory; source: string }> };
  const sources = new Map((snapshot.costSources ?? []).map((c) => [c.category, c.source]));
  const costRisks = bundle.risks.filter((r) => r.category === "missing_costs" || r.category === "profit_exaggeration");

  const chart = monthly.map((m) => ({ yearMonth: m.yearMonth!, operatingProfit: m.operatingProfit }));
  const costChart = monthly.map((m) => ({
    yearMonth: m.yearMonth!,
    ...Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, m[COST_COLUMN[c]] as number | null])),
  }));
  // 값이 없지만 미확인 목록에도 없는 항목 = 해당 없음 (예: 배달 매출 자료가 없을 때의 배달 수수료)
  const notApplicable = (c: ExpenseCategory) => avg.missingCostCategories.indexOf(c) === -1 && monthly.every((m) => m[COST_COLUMN[c]] === null);
  const cell = (c: ExpenseCategory, v: number | null) =>
    v === null && notApplicable(c) ? <span className="text-neutral-400">해당 없음</span> : <Amount value={v} />;
  const usedCategories = EXPENSE_CATEGORIES.filter((c) => monthly.some((m) => m[COST_COLUMN[c]] !== null));

  return (
    <div className="space-y-4">
      <KpiRow>
        <Kpi label="월평균 총매출" value={won(avg.totalRevenue)} />
        <Kpi label="월평균 총영업비용" value={won(avg.totalOperatingCost, "계산 불가")} />
        <Kpi
          label="월평균 추정 영업이익"
          value={avg.operatingProfit === null ? "계산 불가" : won(avg.operatingProfit)}
          sub={avg.operatingProfit !== null && !avg.isComplete ? "일부 비용 미확인 · 상한값" : undefined}
          emphasis={(avg.operatingProfit ?? 0) < 0}
        />
        <Kpi label="영업이익률" value={pct(avg.operatingMargin, 1, "계산 불가")} sub={`양도인 주장 순수익 ${won(store.claimedMonthlyNetProfit, "미입력")}`} />
      </KpiRow>

      <Panel title="수익성 판단">
        <Findings
          result={
            avg.operatingProfit === null
              ? "필수 비용이 확인되지 않아 영업이익을 계산하지 않았습니다."
              : `월평균 영업이익 ${won(avg.operatingProfit)} (영업이익률 ${pct(avg.operatingMargin)})${avg.isComplete ? "" : " · 확인된 비용 기준 상한값"}`
          }
          basis={<>영업이익 = 총매출 − 총영업비용, 영업이익률 = 영업이익 ÷ 총매출 × 100. {avg.revenueBasis}</>}
          evidence={
            <ul className="space-y-0.5 text-[12px]">
              {EXPENSE_CATEGORIES.map((c) => (
                <li key={c}>
                  <span className="inline-block w-24 text-neutral-500">{EXPENSE_CATEGORY_LABELS[c]}</span>
                  {notApplicable(c) ? "해당 없음 (배달 매출 자료 없음)" : sources.get(c) ?? "—"}
                </li>
              ))}
            </ul>
          }
          unverified={avg.missingCostCategories.map((c) => `${EXPENSE_CATEGORY_LABELS[c]}: 자료 없음 (0원으로 계산하지 않음)`)}
          actions={costRisks.map((r) => `${r.title}: ${r.recommendedAction}`)}
        />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="월별 영업이익" description="음수(손실)는 붉은색. 필수 비용이 없는 달은 표시하지 않습니다.">
          <ProfitBarChart data={chart} dataKey="operatingProfit" label="영업이익" />
        </Panel>
        <Panel title="월별 비용 구성" description="확인된 비용만 표시합니다.">
          <MonthlyBarChart
            data={costChart}
            stacked
            series={usedCategories.map((c, i) => ({
              key: c,
              label: EXPENSE_CATEGORY_LABELS[c],
              color: ["#0f172a", "#1e3a5f", "#4b6584", "#737373", "#a3a3a3", "#c7c7c7", "#d4d4d4", "#e5e5e5"][i],
            }))}
          />
        </Panel>
      </div>

      <Panel title="월별 손익 계산표" flush description="단위: 원. '미확인'은 자료가 없어 계산에 넣지 않은 항목입니다.">
        <Table>
          <thead>
            <tr>
              <Th>항목</Th>
              {monthly.map((m) => (
                <Th key={m.id} align="right">{ym(m.yearMonth)}</Th>
              ))}
              <Th align="right" className="bg-neutral-100 text-neutral-700">월평균</Th>
            </tr>
          </thead>
          <tbody>
            <Tr highlight>
              <Td>총매출</Td>
              {monthly.map((m) => <Td key={m.id} align="right">{won(m.totalRevenue)}</Td>)}
              <Td align="right" strong>{won(avg.totalRevenue)}</Td>
            </Tr>
            {EXPENSE_CATEGORIES.map((c) => (
              <Tr key={c}>
                <Td className="pl-6 text-neutral-700">
                  {EXPENSE_CATEGORY_LABELS[c]}
                  {avg.missingCostCategories.includes(c) && <Badge tone="muted" className="ml-2">미확인</Badge>}
                </Td>
                {monthly.map((m) => (
                  <Td key={m.id} align="right">{cell(c, m[COST_COLUMN[c]] as number | null)}</Td>
                ))}
                <Td align="right">{cell(c, avg[COST_COLUMN[c]] as number | null)}</Td>
              </Tr>
            ))}
            <Tr highlight>
              <Td>총영업비용</Td>
              {monthly.map((m) => <Td key={m.id} align="right">{won(m.totalOperatingCost, "계산 불가")}</Td>)}
              <Td align="right" strong>{won(avg.totalOperatingCost, "계산 불가")}</Td>
            </Tr>
            <Tr highlight>
              <Td>영업이익</Td>
              {monthly.map((m) => <Td key={m.id} align="right"><Amount value={m.operatingProfit} strong /></Td>)}
              <Td align="right"><Amount value={avg.operatingProfit} strong /></Td>
            </Tr>
            <Tr>
              <Td>영업이익률</Td>
              {monthly.map((m) => <Td key={m.id} align="right">{pct(m.operatingMargin)}</Td>)}
              <Td align="right" strong>{pct(avg.operatingMargin)}</Td>
            </Tr>
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
