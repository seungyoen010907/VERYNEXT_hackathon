import {
  EXPENSE_CATEGORY_LABELS,
  REVENUE_CHECK_TYPE_LABELS,
  RISK_CATEGORY_LABELS,
  VERIFICATION_LEVEL_LABELS,
  VERIFICATION_STATUS_LABELS,
  type RevenueCheckType,
  type VerificationLevel,
  type VerificationStatus,
} from "@/types/domain";
import { dateTime, months, pct, signedRate, won, ym } from "@/lib/format";
import type { ReportContent } from "@/server/repo/reports";
import { PaybackBadge, RiskBadge, VerificationBadge } from "../status";
import { Table, Td, Th, Tr } from "../table";
import { Badge } from "../ui";

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-neutral-200 pt-4">
      <h2 className="mb-2 text-[14px] font-semibold text-neutral-900">
        <span className="mr-2 text-neutral-400 tabular-nums">{n}.</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ReportView({ content, saved }: { content: ReportContent; saved: boolean }) {
  const s = content.store;
  const avg = content.profit.average;
  const p = content.premium;
  const claimedCheck = content.revenue.checks.find((c) => c.type === "claimed_vs_evidence");
  const diffRate =
    content.revenue.claimed !== null && content.revenue.evidenceAverage
      ? (content.revenue.claimed - content.revenue.evidenceAverage) / content.revenue.evidenceAverage
      : null;
  const mismatches = content.revenue.checks.filter((c) => c.status === "mismatch");

  return (
    <article className="space-y-5 bg-white text-[13px]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] text-neutral-500">종합 실사 보고서 {saved ? "" : "(미리보기 · 저장 전)"}</p>
          <h1 className="text-lg font-semibold text-neutral-900">{s.name}</h1>
          <p className="text-[12px] text-neutral-500">{s.address}</p>
        </div>
        <div className="text-right text-[12px] text-neutral-600">
          <p>작성 {dateTime(content.generatedAt)}</p>
          <p>분석 완료 {dateTime(content.analysisBasis.completedAt)} · 엔진 v{content.analysisBasis.engineVersion}</p>
          <p className="mt-1 flex justify-end gap-1.5">
            {content.isTestData && <Badge tone="info">테스트 데이터</Badge>}
            <Badge tone="neutral">검증 수준: {VERIFICATION_LEVEL_LABELS[content.verificationLevel as VerificationLevel] ?? content.verificationLevel}</Badge>
            <RiskBadge level={content.overallRisk} />
          </p>
        </div>
      </header>

      <Section n={1} title="점포 기본 정보">
        <Table>
          <tbody>
            <Tr><Td muted>업종 · 지역</Td><Td>{s.industry} · {s.region}</Td><Td muted>영업 기간</Td><Td>{months(s.businessPeriodMonths)}</Td></Tr>
            <Tr><Td muted>보증금</Td><Td>{won(s.deposit)}</Td><Td muted>월세</Td><Td>{won(s.monthlyRent)}</Td></Tr>
            <Tr><Td muted>권리금</Td><Td>{won(s.premium)}</Td><Td muted>주장 월매출 / 월순수익</Td><Td>{won(s.claimedMonthlyRevenue, "미입력")} / {won(s.claimedMonthlyNetProfit, "미입력")}</Td></Tr>
          </tbody>
        </Table>
      </Section>

      <Section n={2} title="매출 검증 결과">
        <p className="mb-2">
          양도인 주장 {won(content.revenue.claimed, "미입력")} · 증빙 기준 월평균 {won(content.revenue.evidenceAverage, "확인 불가")} · 차이율 {signedRate(diffRate)}{" "}
          {claimedCheck && <VerificationBadge status={claimedCheck.status as VerificationStatus} />}
        </p>
        {claimedCheck && <p className="text-[12px] text-neutral-600">{claimedCheck.basis}</p>}
        {mismatches.length > 0 && (
          <ul className="mt-2 list-disc pl-4 text-[12px]">
            {mismatches.map((c, i) => (
              <li key={i}>
                {REVENUE_CHECK_TYPE_LABELS[c.type as RevenueCheckType]}
                {c.yearMonth ? ` (${ym(c.yearMonth)})` : ""}: {c.basis}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section n={3} title="수익성 분석">
        {avg ? (
          <Table>
            <thead>
              <tr>
                <Th>항목</Th>
                <Th align="right">월평균</Th>
              </tr>
            </thead>
            <tbody>
              <Tr><Td>총매출</Td><Td align="right">{won(avg.totalRevenue)}</Td></Tr>
              {(["materialCost", "laborCost", "rentCost", "maintenanceCost", "utilitiesCost", "deliveryFee", "advertisingCost", "otherCost"] as const).map((k, i) => (
                <Tr key={k}>
                  <Td className="pl-6">{Object.values(EXPENSE_CATEGORY_LABELS)[i]}</Td>
                  <Td align="right">{avg[k] === null ? <span className="text-neutral-400">미확인</span> : won(avg[k])}</Td>
                </Tr>
              ))}
              <Tr highlight><Td>추정 영업이익</Td><Td align="right" strong>{won(avg.operatingProfit, "계산 불가")}</Td></Tr>
              <Tr><Td>영업이익률</Td><Td align="right">{pct(avg.operatingMargin, 1, "계산 불가")}</Td></Tr>
            </tbody>
          </Table>
        ) : (
          <p className="text-neutral-500">매출 증빙이 없어 계산하지 않았습니다.</p>
        )}
        {avg && !avg.isComplete && <p className="mt-2 text-[12px] text-amber-800">일부 비용이 확인되지 않아 영업이익은 상한값입니다.</p>}
      </Section>

      <Section n={4} title="권리금 및 초기 투자금 분석">
        {p ? (
          <p>
            보증금 {won(p.deposit)} + 권리금 {won(p.premium)} + 시설 {won(p.facilityInvestment, "미입력")} + 기타 {won(p.otherInitialCost, "미입력")} = 초기 투자금{" "}
            <strong>{won(p.totalInitialInvestment)}</strong>
          </p>
        ) : (
          "—"
        )}
        <p className="mt-1 text-[12px] text-neutral-600">시장 거래 데이터가 없어 적정 권리금은 판단하지 않습니다.</p>
      </Section>

      <Section n={5} title="투자금 회수 기간">
        {p ? (
          <p className="flex flex-wrap items-center gap-2">
            <PaybackBadge status={p.paybackStatus} />
            {p.paybackMonths !== null && <strong>{p.paybackMonths}개월</strong>}
            <span className="text-[12px] text-neutral-600">{p.basis}</span>
          </p>
        ) : (
          "—"
        )}
      </Section>

      <Section n={6} title="위험 요소">
        {content.risks.length === 0 ? (
          <p className="text-neutral-500">탐지된 위험 없음</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>수준</Th>
                <Th>구분</Th>
                <Th>위험 항목 · 원인</Th>
                <Th>권장 조치</Th>
              </tr>
            </thead>
            <tbody>
              {content.risks.map((r, i) => (
                <Tr key={i}>
                  <Td><RiskBadge level={r.level} /></Td>
                  <Td className="whitespace-nowrap text-[12px]">{RISK_CATEGORY_LABELS[r.category as keyof typeof RISK_CATEGORY_LABELS] ?? r.category}</Td>
                  <Td className="text-[12px]"><strong className="block text-[13px]">{r.title}</strong>{r.cause}</Td>
                  <Td className="text-[12px]">{r.recommendedAction}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section n={7} title="자료 부족 항목">
        {content.missingData.length ? (
          <ul className="list-disc pl-4">{content.missingData.map((m) => <li key={m}>{m}</li>)}</ul>
        ) : (
          <p className="text-neutral-500">없음</p>
        )}
        {content.revenue.unverified.length > 0 && (
          <ul className="mt-2 list-disc pl-4 text-[12px] text-neutral-600">{content.revenue.unverified.map((u) => <li key={u}>{u}</li>)}</ul>
        )}
      </Section>

      <Section n={8} title="추가 요청 자료">
        {content.requestedDocuments.length ? (
          <ul className="list-disc pl-4">
            {content.requestedDocuments.map((d) => (
              <li key={d.key}>
                {d.requestText} <span className="text-[12px] text-neutral-500">({d.reason})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-neutral-500">체크리스트 기준 미제출 필수 자료 없음</p>
        )}
      </Section>

      <Section n={9} title="종합 분석 의견">
        <ul className="list-disc space-y-1 pl-4">{content.opinion.map((o, i) => <li key={i}>{o}</li>)}</ul>
        <p className="mt-3 text-[11px] text-neutral-500">
          분석 기준: 주장 매출 허용 오차 {pct(Number((content.analysisBasis.criteria as { claimedRevenueTolerance?: number }).claimedRevenueTolerance ?? 0) * 100, 0)}, 전월 대비 급변 기준 ±{pct(Number((content.analysisBasis.criteria as { monthlyChangeWarning?: number }).monthlyChangeWarning ?? 0) * 100, 0)}, 최소 증빙 기간 {String((content.analysisBasis.criteria as { minEvidenceMonths?: number }).minEvidenceMonths ?? "—")}개월.
          {" "}검증 상태 표기: {Object.values(VERIFICATION_STATUS_LABELS).join(" / ")}.
        </p>
      </Section>
    </article>
  );
}
