import Link from "next/link";
import { notFound } from "next/navigation";
import { DEAL_STAGE_LABELS, DEAL_TASK_GROUP_LABELS, DEAL_TASK_STATUS_LABELS, DEAL_TERM_LABELS, FINDING_CERTAINTY_LABELS, type DealTerms } from "@/types/domain";
import { ReportView } from "@/components/analysis/report-view";
import { PrintButton } from "@/components/client/actions";
import { RiskBadge } from "@/components/status";
import { Table, Td, Th, Tr } from "@/components/table";
import { dateTime, won } from "@/lib/format";
import { buildDealReport, type DealReportContent } from "@/server/deals/report";
import { AppError } from "@/server/errors";
import { requestContext } from "@/server/http";

function term(k: keyof DealTerms, v: unknown) {
  if (v === null || v === undefined || v === "") return "없음";
  return k === "premium" || k === "deposit" || k === "monthlyRent" ? won(Number(v)) : String(v);
}

/** 인쇄용 거래 실사 보고서. 브라우저 인쇄로 PDF를 저장한다. */
export default async function DealReportPage({ params }: PageProps<"/deals/[id]/report">) {
  const [{ id }, { db, viewer }] = await Promise.all([params, requestContext()]);
  let r: DealReportContent;
  try {
    r = await buildDealReport(db, viewer, id);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
  const open = r.findings.filter((f) => f.status === "open");
  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <div className="no-print flex items-center justify-between">
        <Link href={`/deals/${id}?tab=analysis&sub=report`} className="text-[12px] underline">거래로 돌아가기</Link>
        <PrintButton />
      </div>
      <article className="space-y-6 rounded-sm border border-neutral-200 bg-white p-8 text-[13px] print:border-0 print:p-0">
        <header>
          <p className="text-[11px] text-neutral-500">거래 실사 보고서 · 작성 {dateTime(r.generatedAt)} · {r.role === "buyer" ? "양수인용" : "양도인용 (AI 위험 항목 제외)"}</p>
          <h1 className="text-lg font-semibold">{r.storeReport?.store.name ?? "거래"}</h1>
          <p className="text-[12px] text-neutral-600">현재 거래 단계: {DEAL_STAGE_LABELS[r.stage as keyof typeof DEAL_STAGE_LABELS]}</p>
        </header>

        <section>
          <h2 className="mb-2 text-[14px] font-semibold">거래 조건</h2>
          <Table>
            <tbody>
              {(Object.keys(DEAL_TERM_LABELS) as Array<keyof DealTerms>).map((k) => (
                <Tr key={k}>
                  <Td muted>{DEAL_TERM_LABELS[k]}</Td>
                  <Td>{term(k, r.terms[k])}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {r.termChanges.length > 0 && <p className="mt-1 text-[12px] text-neutral-600">조건 변경 {r.termChanges.length}회: {r.termChanges.map((c) => `${DEAL_TERM_LABELS[c.field]} ${term(c.field, c.oldValue)} → ${term(c.field, c.newValue)}`).join(" / ")}</p>}
        </section>

        <section>
          <h2 className="mb-2 text-[14px] font-semibold">실사 체크리스트 ({r.tasks.filter((t) => t.status === "done").length}/{r.tasks.length} 완료)</h2>
          <Table>
            <thead>
              <tr>
                <Th>분류</Th>
                <Th>업무</Th>
                <Th>상태</Th>
              </tr>
            </thead>
            <tbody>
              {r.tasks.map((t) => (
                <Tr key={t.id}>
                  <Td muted>{DEAL_TASK_GROUP_LABELS[t.taskGroup]}</Td>
                  <Td>{t.title}</Td>
                  <Td>{DEAL_TASK_STATUS_LABELS[t.status]}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </section>

        {r.role === "buyer" && (
          <section>
            <h2 className="mb-2 text-[14px] font-semibold">AI 거래 분석 위험 항목 (미해결 {open.length}건, 분석 {r.aiRuns.length}회)</h2>
            {open.length === 0 ? (
              <p className="text-neutral-500">미해결 위험 없음</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>수준</Th>
                    <Th>구분</Th>
                    <Th>내용</Th>
                  </tr>
                </thead>
                <tbody>
                  {open.map((f) => (
                    <Tr key={f.id}>
                      <Td><RiskBadge level={f.level} /></Td>
                      <Td className="whitespace-nowrap text-[12px]">{FINDING_CERTAINTY_LABELS[f.certainty]}</Td>
                      <Td className="text-[12px]"><strong className="block text-[13px]">{f.title}</strong>{f.detail}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
            <p className="mt-2 text-[11px] text-neutral-500">AI 분석은 대화와 제출 자료를 규칙으로 대조한 결과이며 사기 여부나 법률적 안전성을 판단하지 않습니다.</p>
          </section>
        )}

        {r.storeReport ? (
          <section className="border-t border-neutral-200 pt-4">
            <ReportView content={r.storeReport} saved={false} />
          </section>
        ) : (
          <p className="text-neutral-500">매물 실사 분석 결과가 아직 없습니다.</p>
        )}
      </article>
    </div>
  );
}
