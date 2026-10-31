import { won } from "@/lib/format";
import type { StoreDetail } from "@/server/views";
import { Amount, Findings } from "../findings";
import { PaybackBadge } from "../status";
import { Table, Td, Th, Tr } from "../table";
import { Kpi, KpiRow, Notice, Panel } from "../ui";
import { NoAnalysis } from "./revenue-section";

export function PremiumSection({ detail }: { detail: StoreDetail }) {
  const { bundle } = detail;
  if (!bundle?.premium) return <NoAnalysis />;
  const p = bundle.premium;
  const avg = bundle.profits.find((x) => x.periodType === "average");
  const unverified: string[] = [];
  if (p.facilityInvestment === null) unverified.push("시설 투자금 미입력 (초기 투자금은 최소 금액)");
  if (p.otherInitialCost === null) unverified.push("기타 인수 비용 미입력");
  if (p.monthlyCashFlow === null) unverified.push("월평균 영업이익 계산 불가 (필수 비용 자료 부족)");
  if (avg && avg.operatingProfit !== null && !avg.isComplete) unverified.push("일부 비용 미확인: 월 현금흐름이 실제보다 클 수 있음");
  unverified.push("시장 거래 데이터 없음: 적정 권리금은 판단하지 않음");
  const premiumMonths = p.monthlyCashFlow && p.monthlyCashFlow > 0 ? p.premium / p.monthlyCashFlow : null;

  return (
    <div className="space-y-4">
      <KpiRow>
        <Kpi label="권리금" value={won(p.premium)} />
        <Kpi label="총 초기 투자금" value={won(p.totalInitialInvestment)} sub={p.facilityInvestment === null || p.otherInitialCost === null ? "미입력 항목 제외 (최소값)" : undefined} />
        <Kpi label="월평균 현금흐름 (영업이익)" value={<Amount value={p.monthlyCashFlow} />} />
        <Kpi
          label="단순 투자금 회수 기간"
          value={p.paybackMonths !== null ? `${p.paybackMonths}개월` : <PaybackBadge status={p.paybackStatus} />}
          sub={p.paybackMonths !== null ? `약 ${(p.paybackMonths / 12).toFixed(1)}년` : undefined}
          emphasis={p.paybackStatus === "not_recoverable"}
        />
      </KpiRow>

      <Panel title="권리금 및 투자금 회수 판단">
        <Findings
          result={
            <span className="flex flex-wrap items-center gap-2">
              <PaybackBadge status={p.paybackStatus} />
              {p.paybackMonths !== null && `초기 투자금 회수까지 ${p.paybackMonths}개월`}
              {premiumMonths !== null && ` · 권리금은 월평균 영업이익의 ${premiumMonths.toFixed(1)}개월분`}
            </span>
          }
          basis={<>단순 회수 기간 = 초기 투자금 ÷ 월평균 현금흐름. {p.basis}</>}
          evidence={
            <ul className="space-y-0.5 text-[12px]">
              <li>보증금·권리금·시설 투자금: 매물 정보 (양도인 입력)</li>
              <li>월평균 현금흐름: 수익성 분석의 월평균 영업이익 ({avg?.revenueBasis ?? "—"})</li>
            </ul>
          }
          unverified={unverified}
          actions={p.notes.filter((n) => !n.startsWith("시장 거래")).concat("같은 상권의 권리금 거래 사례를 별도로 확인하세요.")}
        />
      </Panel>

      <Panel title="초기 투자금 구성" flush>
        <Table>
          <thead>
            <tr>
              <Th>항목</Th>
              <Th align="right">금액</Th>
              <Th>비고</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>보증금</Td><Td align="right">{won(p.deposit)}</Td><Td muted>계약 종료 시 반환 대상이지만 공식에 따라 포함</Td></Tr>
            <Tr><Td>권리금</Td><Td align="right">{won(p.premium)}</Td><Td muted>회수 불가 비용</Td></Tr>
            <Tr><Td>시설 투자금</Td><Td align="right"><Amount value={p.facilityInvestment} /></Td><Td muted>{p.facilityInvestment === null ? "미입력: 0원으로 보지 않음" : ""}</Td></Tr>
            <Tr><Td>기타 인수 비용</Td><Td align="right"><Amount value={p.otherInitialCost} /></Td><Td muted>{p.otherInitialCost === null ? "미입력: 0원으로 보지 않음" : ""}</Td></Tr>
            <Tr highlight><Td>총 초기 투자금</Td><Td align="right" strong>{won(p.totalInitialInvestment)}</Td><Td muted>{p.facilityInvestment === null || p.otherInitialCost === null ? "입력된 항목만 합산한 최소 금액" : ""}</Td></Tr>
          </tbody>
        </Table>
      </Panel>

      <Notice>권리금의 시장 적정성은 판단하지 않습니다. 이 화면은 제출된 자료로 계산한 단순 수익성 분석입니다.</Notice>
    </div>
  );
}
