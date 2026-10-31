"use client";

// 통합 대시보드 (PRD 9번 화면 1): 양도인은 매물·자료·요청·AI 질문 현황, 양수인은 조건·추천·실사 현황

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@/components/RoleSwitch";
import Tag from "@/components/Tag";
import { apiFetch } from "@/lib/api-client";
import type { BuyerProfile } from "@/lib/facts";
import { formatTime, won } from "@/lib/format";
import type { DiligenceSummary } from "@/lib/openai";

type SellerData = {
  role: "seller";
  listings: {
    id: string;
    business_name: string | null;
    address: string;
    status: string;
    is_sample: boolean;
    documents: Record<string, number>;
    grants: Record<string, number>;
    questions: Record<string, number>;
  }[];
};
type BuyerData = {
  role: "buyer";
  profile: BuyerProfile | null;
  tasks: { id: string; created_at: string; listing_ids: string[] }[];
  questions: { total: number; answered: number; pending_approval: number; needs_documents: number; denied: number };
  summaries: { created_at: string; listing_ids: string[]; result: DiligenceSummary }[];
};

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

export default function DashboardPage() {
  const user = useUser();
  const [data, setData] = useState<SellerData | BuyerData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<SellerData | BuyerData>("/api/dashboard")
      .then((d) => (setData(d), setError(null)))
      .catch((e: Error) => setError(e.message));
  }, [user.id]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">대시보드</h1>
        <p className="text-sm text-muted">{user.name}</p>
      </div>
      {error && <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{error}</p>}
      {!data && !error && <p className="text-sm text-muted">불러오는 중...</p>}
      {data?.role === "seller" && <Seller data={data} />}
      {data?.role === "buyer" && <Buyer data={data} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "warn" | "caution" | "outline" }) {
  return (
    <div className="rounded-xl bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        {value} {tone && Number(value) > 0 && <Tag tone={tone}>확인</Tag>}
      </p>
    </div>
  );
}

function Seller({ data }: { data: SellerData }) {
  const all = data.listings;
  const docs = all.reduce((a, l) => a + sum(l.documents), 0);
  const analyzed = all.reduce((a, l) => a + (l.documents.analyzed ?? 0), 0);
  const pending = all.reduce((a, l) => a + (l.grants.requested ?? 0), 0);
  const questions = all.reduce((a, l) => a + sum(l.questions), 0);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="등록한 매물" value={all.length} />
        <Stat label="올린 자료" value={docs} />
        <Stat label="AI 분석 완료" value={analyzed} />
        <Stat label="열람 승인 대기" value={pending} tone="caution" />
        <Stat label="받은 AI 질문" value={questions} />
      </div>
      {all.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted">
          아직 매물이 없어요.{" "}
          <Link href="/listings/new" className="text-accent">
            매물 등록
          </Link>{" "}
          또는{" "}
          <Link href="/listings" className="text-accent">
            샘플 데이터로 시연하기
          </Link>
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">매물</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">자료 (분석 완료/전체)</th>
                <th className="px-4 py-3 font-medium">열람 요청</th>
                <th className="px-4 py-3 font-medium">AI 질문</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {all.map((l) => (
                <tr key={l.id} className="border-t border-bg">
                  <td className="px-4 py-3">
                    <Link href={`/listings/${l.id}`} className="font-medium hover:text-accent">
                      {l.business_name ?? l.address}
                    </Link>{" "}
                    {l.is_sample && <Tag>샘플</Tag>}
                  </td>
                  <td className="px-4 py-3">{l.status === "published" ? <Tag tone="outline">공개 중</Tag> : <Tag>초안</Tag>}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {l.documents.analyzed ?? 0}/{sum(l.documents)} {(l.documents.ai_failed ?? 0) > 0 && <Tag tone="warn">{`분석 실패 ${l.documents.ai_failed}`}</Tag>}
                  </td>
                  <td className="px-4 py-3">{(l.grants.requested ?? 0) > 0 ? <Tag tone="caution">{`승인 대기 ${l.grants.requested}`}</Tag> : <span className="text-muted">{sum(l.grants)}건</span>}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    전체 {sum(l.questions)} · 답변 {l.questions.answered ?? 0} · 승인 대기 {l.questions.pending_approval ?? 0} · 자료 요청 {l.questions.needs_documents ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/listings/${l.id}/requests`} className="text-accent">
                      요청 관리
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Buyer({ data }: { data: BuyerData }) {
  const p = data.profile;
  const q = data.questions;
  const latest = data.tasks[0];
  return (
    <>
      <section className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-card p-5">
        <div>
          <p className="font-medium">인수 조건</p>
          {p ? (
            <p className="mt-1 text-sm text-muted">
              예산 {won(p.budget_total)} · 목표 월 순수익 {won(p.target_monthly_profit)} · 주 {p.weekly_hours ?? "-"}시간 · {p.regions.join(", ") || "지역 무관"} · {p.business_types.join(", ") || "업종 무관"}
            </p>
          ) : (
            <p className="mt-1 text-sm text-caution">아직 인수 조건이 없어요. 조건이 있어야 AI가 맞춤 질문을 만들어요.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/buyer/profile" className="rounded-lg bg-bg px-4 py-2 text-sm font-medium">
            인수 조건 {p ? "수정" : "입력"}
          </Link>
          <Link href="/listings" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
            추천 매물 보기
          </Link>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="AI 질문" value={q.total} />
        <Stat label="답변 완료" value={q.answered} />
        <Stat label="양도인 승인 대기" value={q.pending_approval} tone="caution" />
        <Stat label="자료 추가 대기" value={q.needs_documents} tone="caution" />
        <Stat label="NDA 필요·거부" value={q.denied} tone="warn" />
      </div>

      <section className="rounded-xl bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">AI 실사</p>
          {latest && (
            <Link href={`/diligence?task=${latest.id}`} className="text-sm text-accent">
              최근 실사 열기 ({formatTime(latest.created_at)}, 매물 {latest.listing_ids.length}개)
            </Link>
          )}
        </div>
        {data.summaries.length === 0 ? (
          <p className="mt-2 text-sm text-muted">아직 AI 통합 분석이 없어요. 매물을 골라 AI 실사를 시작해보세요.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.summaries.map((s) => (
              <li key={s.created_at} className="rounded-lg bg-bg p-3 text-sm">
                <p className="font-medium">{s.result.headline}</p>
                <p className="mt-1 text-xs text-muted">
                  {formatTime(s.created_at)} · 매물 {s.listing_ids.length}개 ·{" "}
                  <Link href={`/compare?ids=${s.listing_ids.join(",")}`} className="text-accent">
                    비교표
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
