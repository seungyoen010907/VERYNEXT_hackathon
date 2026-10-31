import Link from "next/link";

const STEPS = [
  ["양도인: 매물과 데이터룸", "기본 정보를 넣고 매출·비용·계약 자료를 올리면 AI가 숫자를 정리하고 자료끼리 맞는지 검증해요."],
  ["양도인: 공개 범위", "자료마다 공개(L0)·NDA 후(L1)·승인 후(L2)·비공개(L3)를 정해요. 원본과 요약은 따로 정할 수 있어요."],
  ["양수인: AI 실사", "내 조건을 넣고 매물 최대 3개를 고르면, 내 AI가 양도인 AI들에 필요한 것만 동시에 물어봐요."],
  ["비교와 리포트", "받은 답으로 투자금·순수익·회수 기간·위험을 같은 기준으로 비교하고, 매물별 실사 리포트를 봐요."],
];

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section>
        <h1 className="text-2xl font-bold">점포 양도양수, AI 에이전트끼리 먼저 확인해요</h1>
        <p className="mt-2 text-muted">
          양도인의 민감한 영업정보는 공개 범위 안에서만 보여주고, 양수인은 여러 점포의 실제 수익성과 인수 적합성을 한 번에 비교해요.
        </p>
      </section>

      <ol className="space-y-3">
        {STEPS.map(([title, desc], i) => (
          <li key={title} className="flex gap-3 rounded-xl border border-border bg-card p-4">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="font-medium">{title}</p>
              <p className="text-sm text-muted">{desc}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="space-y-2">
        <Link href="/listings" className="block rounded-lg bg-accent py-3 text-center font-medium text-white">
          매물 보기 · 샘플로 시연하기
        </Link>
        <Link href="/dashboard" className="block py-2 text-center text-sm text-muted hover:text-text">
          대시보드 보기
        </Link>
      </div>
    </div>
  );
}
