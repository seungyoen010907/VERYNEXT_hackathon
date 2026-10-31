import { RISK_CATEGORY_LABELS, RISK_LEVELS, type RiskAssessment, type RiskLevel } from "@/types/domain";
import type { StoreDetail } from "@/server/views";
import { EvidenceList } from "../findings";
import { RiskBadge } from "../status";
import { Kpi, KpiRow, Notice, Panel } from "../ui";
import { NoAnalysis } from "./revenue-section";

const LEVEL_TITLE: Record<RiskLevel, string> = {
  CRITICAL: "CRITICAL · 즉시 확인 필요",
  HIGH: "HIGH · 계약 전 반드시 확인",
  MEDIUM: "MEDIUM · 확인 권장",
  LOW: "LOW · 참고",
  UNKNOWN: "UNKNOWN · 자료 부족으로 판단 불가",
};

export function RiskItem({ risk, storeId }: { risk: RiskAssessment; storeId: string }) {
  return (
    <article className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <RiskBadge level={risk.level} />
          <span className="text-[11px] text-neutral-500">{RISK_CATEGORY_LABELS[risk.category]}</span>
          <span className="text-[11px] text-neutral-400">{risk.ruleId}</span>
        </div>
        <h3 className="mt-1 text-[13px] font-semibold text-neutral-900">{risk.title}</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-neutral-700">
          <span className="text-neutral-500">발생 원인 </span>
          {risk.cause}
        </p>
        <div className="mt-2 text-[12px]">
          <p className="text-neutral-500">근거 자료</p>
          <div className="mt-0.5">
            <EvidenceList evidence={risk.evidence} storeId={storeId} max={5} />
          </div>
        </div>
      </div>
      <div className="min-w-0 space-y-2 text-[12px]">
        <div>
          <p className="text-neutral-500">추가로 필요한 증빙</p>
          {risk.requiredDocuments.length ? (
            <ul className="mt-0.5 list-disc pl-4 text-neutral-800">{risk.requiredDocuments.map((d) => <li key={d}>{d}</li>)}</ul>
          ) : (
            <p className="mt-0.5 text-neutral-500">없음</p>
          )}
        </div>
        <div>
          <p className="text-neutral-500">권장 조치</p>
          <p className="mt-0.5 text-neutral-900">{risk.recommendedAction}</p>
        </div>
      </div>
    </article>
  );
}

export function RiskSection({ detail }: { detail: StoreDetail }) {
  const { bundle, store } = detail;
  if (!bundle) return <NoAnalysis />;
  const groups = RISK_LEVELS.map((level) => ({ level, items: bundle.risks.filter((r) => r.level === level) })).sort(
    (a, b) => RISK_LEVELS.indexOf(a.level) - RISK_LEVELS.indexOf(b.level),
  );
  const order: RiskLevel[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"];
  const count = (l: RiskLevel) => bundle.risks.filter((r) => r.level === l).length;
  return (
    <div className="space-y-4">
      <KpiRow>
        <Kpi label="최고 위험 수준" value={<RiskBadge level={bundle.overallRisk} />} sub={`총 ${bundle.risks.length}건`} />
        <Kpi label="CRITICAL · HIGH" value={count("CRITICAL") + count("HIGH")} emphasis={count("CRITICAL") + count("HIGH") > 0} />
        <Kpi label="MEDIUM · LOW" value={count("MEDIUM") + count("LOW")} />
        <Kpi label="UNKNOWN (판단 불가)" value={count("UNKNOWN")} sub="자료 부족 · 집계 기준 차이" />
      </KpiRow>
      <Notice>위험은 정해진 규칙으로 탐지하며 판단 근거를 함께 저장합니다. 자료가 부족하다는 이유만으로 허위·사기로 판단하지 않습니다.</Notice>
      {bundle.risks.length === 0 && <Notice>탐지된 위험이 없습니다.</Notice>}
      {order
        .map((l) => groups.find((g) => g.level === l)!)
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <Panel key={g.level} title={`${LEVEL_TITLE[g.level]} (${g.items.length})`} flush>
            <div className="divide-y divide-neutral-100">
              {g.items.map((r) => (
                <RiskItem key={r.id} risk={r} storeId={store.id} />
              ))}
            </div>
          </Panel>
        ))}
    </div>
  );
}
