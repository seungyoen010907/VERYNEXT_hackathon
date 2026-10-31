"use client";

// 검증 리포트. 섹션 순서는 docs/DESIGN.md 5번.
// 협상 포인트는 양수인에게만 보인다. (Step 3부터는 서버가 양도인 응답에서 아예 뺀다)

import { useRole } from "@/components/RoleSwitch";
import { percent, won } from "@/lib/format";
import type { CheckLevel, Report } from "@/lib/types";

const LEVEL_LABEL: Record<CheckLevel, string> = {
  ok: "통과",
  caution: "주의",
  warn: "확인 필요",
};

export function LevelBadge({ level }: { level: CheckLevel }) {
  const style =
    level === "warn"
      ? "bg-warn/10 text-warn"
      : level === "caution"
        ? "bg-caution/10 text-caution"
        : "border border-border text-muted";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{LEVEL_LABEL[level]}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-medium text-muted">{title}</h2>
      {children}
    </section>
  );
}

export default function ReportView({ report }: { report: Report }) {
  const role = useRole();
  const { summary, claimed_vs_actual: cva } = report;
  const flagged = report.checks.filter((c) => c.level !== "ok");

  return (
    <div className="space-y-4">
      {/* 1. 요약 카드 */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 flex-col items-center justify-center rounded-xl bg-accent/10 text-accent">
            <span className="text-3xl font-bold leading-none">{report.grade}</span>
            <span className="mt-1 text-[10px]">신뢰도</span>
          </div>
          <p className="min-w-0 font-medium">{summary?.headline ?? "요약을 만들지 못했어요. 아래 검증 결과를 확인해주세요."}</p>
        </div>
        {summary && summary.findings.length > 0 && (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
            {summary.findings.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
      </section>

      {/* 2. 확인 필요 항목 */}
      <Section title={`확인 필요 항목 (${flagged.length}개)`}>
        {flagged.length === 0 ? (
          <p className="text-sm text-muted">자료 간에 큰 차이가 없어요.</p>
        ) : (
          <ul className="space-y-3">
            {flagged.map((c) => (
              <li key={c.title + c.month}>
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium">{c.title}</p>
                  <LevelBadge level={c.level} />
                </div>
                <p className="mt-1 text-sm text-muted">{c.detail}</p>
              </li>
            ))}
          </ul>
        )}
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted">통과한 검사 보기</summary>
          <ul className="mt-2 space-y-2">
            {report.checks
              .filter((c) => c.level === "ok")
              .map((c) => (
                <li key={c.title} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    {c.title}
                    <span className="block text-muted">{c.detail}</span>
                  </span>
                  <LevelBadge level={c.level} />
                </li>
              ))}
          </ul>
        </details>
      </Section>

      {/* 3. 주장 vs 실제 */}
      <Section title="양도인 주장 vs 검증 매출">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">주장 월매출</dt>
            <dd className="text-lg font-bold tabular-nums">{won(cva.claimed_monthly_sales)}</dd>
          </div>
          <div>
            <dt className="text-muted">검증 월평균</dt>
            <dd className="text-lg font-bold tabular-nums">{won(cva.verified_monthly_avg)}</dd>
          </div>
        </dl>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <p>
            차이 <span className="font-medium tabular-nums">{won(cva.diff_amount)}</span> ({percent(cva.diff_rate)})
          </p>
          <LevelBadge level={cva.level} />
        </div>
        <p className="mt-2 text-xs text-muted">기준: {cva.basis}</p>
      </Section>

      {/* 4. 월별 매출표 */}
      <Section title="월별 매출표">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-right text-sm tabular-nums">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                <th className="py-2 text-left font-medium">월</th>
                <th className="py-2 font-medium">카드</th>
                <th className="py-2 font-medium">배달</th>
                <th className="py-2 font-medium">카드+배달</th>
                <th className="py-2 font-medium">POS</th>
                <th className="py-2 font-medium">차이</th>
              </tr>
            </thead>
            <tbody>
              {report.monthly.map((row) => (
                <tr key={row.month} className="border-b border-border last:border-0">
                  <td className="py-2 text-left">{row.month}</td>
                  <td className="py-2">{won(row.card)}</td>
                  <td className="py-2">{won(row.delivery)}</td>
                  <td className="py-2">{won(row.card_plus_delivery)}</td>
                  <td className={"py-2 " + (row.level === "warn" ? "font-bold text-warn" : "")}>{won(row.pos)}</td>
                  <td className={"py-2 " + (row.level === "warn" ? "font-bold text-warn" : "text-muted")}>
                    {percent(row.pos_diff_rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">차이 = POS가 카드+배달 합계보다 얼마나 많은지. 10% 이상이면 확인 필요.</p>
      </Section>

      {/* 5. 협상 포인트 (양수인만) */}
      {role === "buyer" && summary && summary.negotiation_points.length > 0 && (
        <Section title="협상 포인트 (양수인에게만 보여요)">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {summary.negotiation_points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* 6. 양도인에게 요청할 것 */}
      {summary && summary.next_requests.length > 0 && (
        <Section title="양도인에게 요청할 자료">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {summary.next_requests.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Section>
      )}

      <p className="text-xs text-muted">
        이 리포트는 제출된 자료를 기준으로 한 참고 자료이며, 법률·세무 판단은 전문가 확인이 필요해요.
      </p>
    </div>
  );
}
