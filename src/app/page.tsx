import { readSchemaOverview } from "@/lib/schema-overview";

// 스키마 파일은 요청마다 바뀌지 않으므로 모듈 로드 시 한 번만 읽는다.
const TABLES = readSchemaOverview();

const STEPS: Array<{ step: number; title: string; done: boolean }> = [
  { step: 1, title: "기존 프로젝트 구조 및 기술 스택 분석", done: true },
  { step: 2, title: "시스템 아키텍처 및 데이터 흐름 설계", done: true },
  { step: 3, title: "데이터베이스 및 데이터 모델 구현", done: true },
  { step: 4, title: "사용자 인증 및 점포 관리", done: false },
  { step: 5, title: "문서 업로드 및 AI 분석 데이터 연동", done: false },
  { step: 6, title: "매출 교차 검증 엔진", done: false },
  { step: 7, title: "수익성 분석 엔진", done: false },
  { step: 8, title: "권리금 및 투자금 회수 분석", done: false },
  { step: 9, title: "위험도 평가 엔진", done: false },
  { step: 10, title: "종합 실사 보고서", done: false },
  { step: 11, title: "대시보드 및 분석 화면", done: false },
  { step: 12, title: "AI 상담", done: false },
  { step: 13, title: "전체 기능 통합 테스트", done: false },
  { step: 14, title: "배포 준비", done: false },
];

const PIPELINE = [
  "AI 문서 분석 결과 (JSON)",
  "extracted_data (원본 보존)",
  "normalized_data (정규화)",
  "monthly_revenues / monthly_expenses",
  "analyses (분석 실행)",
  "revenue_verifications · profit_analyses · premium_analyses · risk_assessments",
  "reports (종합 보고서)",
  "chat_messages (AI 상담)",
];

export default function Home() {
  return (
    <div className="max-w-5xl space-y-10">
      <header>
        <h1 className="text-xl font-semibold">개발 현황</h1>
        <p className="mt-1 text-sm text-neutral-500">
          현재 STEP 3까지 완료. 데이터베이스 스키마는{" "}
          <code className="text-neutral-700">supabase/migrations/0001_initial_schema.sql</code>
          에서 읽어 표시합니다.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold">진행 단계</h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {STEPS.map((s) => (
              <tr key={s.step} className="border-b border-neutral-100">
                <td className="w-20 py-1.5 text-neutral-500">STEP {s.step}</td>
                <td className="py-1.5">{s.title}</td>
                <td className={`w-20 py-1.5 text-right ${s.done ? "font-medium" : "text-neutral-400"}`}>
                  {s.done ? "완료" : "예정"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">데이터 흐름</h2>
        <ol className="space-y-1 text-sm">
          {PIPELINE.map((p, i) => (
            <li key={p} className="flex gap-3">
              <span className="w-5 text-right text-neutral-400">{i + 1}</span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold">데이터베이스 테이블 ({TABLES.length}개)</h2>
        <p className="mb-4 text-xs text-neutral-500">
          금액은 원 단위 정수. NULL 허용 컬럼에서 NULL은 &quot;확인되지 않은 값&quot;이며 0원으로 계산하지 않습니다.
        </p>
        <div className="space-y-6">
          {TABLES.map((t) => (
            <div key={t.name}>
              <div className="flex flex-wrap items-baseline gap-x-3 border-b border-neutral-300 pb-1">
                <h3 className="font-mono text-sm font-semibold">{t.name}</h3>
                <span className="text-xs text-neutral-500">{t.description}</span>
                {t.references.length > 0 && (
                  <span className="text-xs text-neutral-400">→ {t.references.join(", ")}</span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-left text-neutral-500">
                      <th className="py-1 pr-4 font-normal">컬럼</th>
                      <th className="py-1 pr-4 font-normal">타입</th>
                      <th className="py-1 pr-4 font-normal">NULL</th>
                      <th className="py-1 font-normal">설명</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.columns.map((c) => (
                      <tr key={c.name} className="border-t border-neutral-100">
                        <td className="py-1 pr-4 font-mono">{c.name}</td>
                        <td className="py-1 pr-4 font-mono text-neutral-600">{c.type}</td>
                        <td className="py-1 pr-4 text-neutral-500">{c.nullable ? "허용" : ""}</td>
                        <td className="py-1 text-neutral-600">{c.comment ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
