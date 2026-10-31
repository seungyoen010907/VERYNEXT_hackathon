import {
  REVENUE_CHECK_TYPE_LABELS,
  REVENUE_CHECK_TYPES,
  type Evidence,
  type RevenueCheckType,
} from "@/types/domain";
import { signedRate, won, ym } from "@/lib/format";
import type { StoreDetail } from "@/server/views";
import { MonthlyLineChart } from "../charts";
import { Amount, EvidenceList, Findings } from "../findings";
import { VerificationBadge } from "../status";
import { EmptyRow, Table, Td, Th, Tr } from "../table";
import { Kpi, KpiRow, Notice, Panel } from "../ui";

const REVENUE_CATEGORIES = ["revenue_mismatch", "insufficient_revenue_evidence", "abnormal_monthly_change", "period_mismatch"];

const METHOD_LABEL: Record<string, string> = {
  pos: "POS 기준",
  pos_plus_delivery: "POS + 배달 주문액",
  card_cash_delivery: "카드+현금+배달 추정",
};

export function RevenueSection({ detail }: { detail: StoreDetail }) {
  const { bundle, store, series } = detail;
  if (!bundle) return <NoAnalysis />;
  const checks = bundle.revenueChecks;
  const claimed = checks.find((c) => c.checkType === "claimed_vs_evidence");
  const unverified = checks.filter((c) => c.status === "unverifiable" || c.status === "insufficient_data");
  const relatedRisks = bundle.risks.filter((r) => REVENUE_CATEGORIES.includes(r.category));
  const monthlyProfit = bundle.profits.filter((p) => p.periodType === "monthly");
  const snapshot = bundle.analysis.inputSnapshot as { revenueMethods?: Array<{ yearMonth: string; method: string; caveats: string[] }> };
  const methods = new Map((snapshot.revenueMethods ?? []).map((m) => [m.yearMonth, m]));

  const chartData = series.map((s) => ({
    ...s,
    total: monthlyProfit.find((p) => p.yearMonth === s.yearMonth)?.totalRevenue ?? null,
  }));
  const present = (key: string) => series.some((s) => typeof (s as Record<string, unknown>)[key] === "number");
  const lineSeries = [
    { key: "total", label: "분석 총매출" },
    ...(present("pos") ? [{ key: "pos", label: "POS 매출", color: "#4b6584" }] : []),
    ...(present("card") ? [{ key: "card", label: "카드 매출", color: "#a3a3a3" }] : []),
    ...(present("delivery_order") ? [{ key: "delivery_order", label: "배달 주문액", color: "#737373", dashed: true }] : []),
    ...(present("delivery_settlement") ? [{ key: "delivery_settlement", label: "배달 정산액", color: "#d4d4d4", dashed: true }] : []),
  ];

  const byType = (t: RevenueCheckType) => checks.filter((c) => c.checkType === t);

  return (
    <div className="space-y-4">
      <KpiRow>
        <Kpi label="양도인 주장 월매출" value={won(store.claimedMonthlyRevenue, "미입력")} />
        <Kpi label="증빙 기준 월평균 매출" value={won(claimed?.expectedAmount, "확인 불가")} sub={claimed?.expectedAmount != null ? `${monthlyProfit.length}개월 평균` : undefined} />
        <Kpi label="차이율 (주장 − 증빙)" value={signedRate(claimed?.differenceRate)} emphasis={claimed?.status === "mismatch"} />
        <Kpi label="검증 판정" value={claimed ? <VerificationBadge status={claimed.status} /> : "—"} sub={`불일치 ${checks.filter((c) => c.status === "mismatch").length}건 · 검증 불가 ${unverified.length}건`} />
      </KpiRow>

      <Panel title="양도인 주장 매출 검증">
        <Findings
          result={
            claimed ? (
              <span className="flex flex-wrap items-center gap-2">
                <VerificationBadge status={claimed.status} />
                주장 {won(claimed.actualAmount, "미입력")} / 증빙 {won(claimed.expectedAmount, "확인 불가")}
              </span>
            ) : (
              "검증 결과 없음"
            )
          }
          basis={claimed?.basis ?? "—"}
          evidence={<EvidenceList evidence={(claimed?.evidence ?? []) as Evidence[]} storeId={store.id} />}
          unverified={unverified.map((c) => `${REVENUE_CHECK_TYPE_LABELS[c.checkType]}${c.yearMonth ? ` (${ym(c.yearMonth)})` : ""}: ${c.basis}`)}
          actions={relatedRisks.map((r) => `${r.title}: ${r.recommendedAction}`)}
        />
      </Panel>

      <Panel title="월별 매출 추이" description="분석 총매출은 카드·배달 매출이 POS에 포함된 경우 중복 합산하지 않은 값입니다. 붉은 점선은 양도인 주장 월매출입니다.">
        <MonthlyLineChart
          data={chartData}
          series={lineSeries}
          reference={store.claimedMonthlyRevenue !== null ? { value: store.claimedMonthlyRevenue, label: "주장 매출" } : null}
        />
      </Panel>

      <Panel title="자료별 월 매출 비교" flush description="단위: 원. 빈 칸(—)은 해당 자료가 제출되지 않은 달입니다.">
        <Table>
          <thead>
            <tr>
              <Th>월</Th>
              <Th align="right">POS 매출</Th>
              <Th align="right">카드 매출</Th>
              <Th align="right">현금 매출</Th>
              <Th align="right">배달 주문액</Th>
              <Th align="right">배달 정산액</Th>
              <Th align="right">분석 총매출</Th>
              <Th>산정 방식 · 주의</Th>
            </tr>
          </thead>
          <tbody>
            {series.length === 0 && <EmptyRow colSpan={8}>매출 자료가 없습니다.</EmptyRow>}
            {series.map((s) => {
              const row = s as Record<string, number | string>;
              const m = methods.get(s.yearMonth);
              const total = monthlyProfit.find((p) => p.yearMonth === s.yearMonth)?.totalRevenue ?? null;
              return (
                <Tr key={s.yearMonth}>
                  <Td>{ym(s.yearMonth)}</Td>
                  {["pos", "card", "cash", "delivery_order", "delivery_settlement"].map((k) => (
                    <Td key={k} align="right">{typeof row[k] === "number" ? won(row[k] as number) : <span className="text-neutral-400">—</span>}</Td>
                  ))}
                  <Td align="right" strong>{total === null ? <span className="text-neutral-400">확인 불가</span> : won(total)}</Td>
                  <Td muted className="text-[12px]">
                    {m ? METHOD_LABEL[m.method] : "POS·카드 자료 없음"}
                    {m?.caveats.map((c) => <span key={c} className="block text-amber-800">{c}</span>)}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>

      <Panel title="교차 검증 상세" flush description="자료 간 집계 기준(총매출/순매출, 부가세, 포함 범위)이 다르면 단순 비교하지 않고 '검증 불가'로 표시합니다.">
        <Table>
          <thead>
            <tr>
              <Th>검증 항목</Th>
              <Th>월</Th>
              <Th>판정</Th>
              <Th align="right">기준값</Th>
              <Th align="right">비교값</Th>
              <Th align="right">차이율</Th>
              <Th>판단 근거</Th>
              <Th>근거 자료</Th>
            </tr>
          </thead>
          <tbody>
            {REVENUE_CHECK_TYPES.flatMap((t) =>
              byType(t).map((c, i) => (
                <Tr key={c.id}>
                  <Td className="whitespace-nowrap">{i === 0 ? REVENUE_CHECK_TYPE_LABELS[t] : ""}</Td>
                  <Td className="whitespace-nowrap">{c.yearMonth ? ym(c.yearMonth) : "전체"}</Td>
                  <Td>
                    <VerificationBadge status={c.status} label={t === "monthly_change" && c.status === "mismatch" ? "급변" : undefined} />
                  </Td>
                  <Td align="right"><Amount value={c.expectedAmount} /></Td>
                  <Td align="right"><Amount value={c.actualAmount} /></Td>
                  <Td align="right">{signedRate(c.differenceRate)}</Td>
                  <Td className="min-w-64 text-[12px]">{c.basis}</Td>
                  <Td className="text-[12px]">
                    {c.evidence.length > 0 ? (
                      <details>
                        <summary className="cursor-pointer text-neutral-600">{c.evidence.length}건</summary>
                        <div className="mt-1 min-w-64">
                          <EvidenceList evidence={c.evidence} storeId={store.id} />
                        </div>
                      </details>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </Td>
                </Tr>
              )),
            )}
            {checks.length === 0 && <EmptyRow colSpan={8}>검증 결과가 없습니다.</EmptyRow>}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}

export function NoAnalysis({ children }: { children?: React.ReactNode }) {
  return (
    <Notice tone="caution">
      아직 완료된 실사 분석이 없습니다. 증빙 자료를 제출한 뒤 상단의 &apos;실사 분석 실행&apos;을 누르세요. {children}
    </Notice>
  );
}
