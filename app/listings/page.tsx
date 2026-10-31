"use client";

// 매물 목록 / 탐색 (PRD 9번 화면 6)
// 양도인: 내 매물 + 공개 매물 / 양수인: 추천 점수(가중치 공개)·필터·비교 대상 선택(최대 3개)

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/RoleSwitch";
import Tag from "@/components/Tag";
import { apiFetch } from "@/lib/api-client";
import { MAX_COMPARE, setCompareIds, useCompareIds } from "@/lib/compare-selection";
import type { Fact, PersonalFit, ScoreItem } from "@/lib/facts";
import { SCORE_LABEL, SCORE_WEIGHTS } from "@/lib/facts";
import { formatDate, won } from "@/lib/format";
import type { Grade, Listing, PublicListing } from "@/lib/types";

type Rec = { total: number; max: number; items: ScoreItem[]; info_lacking: boolean; unknown_count: number };
type BuyerItem = PublicListing & {
  recommendation?: Rec;
  summary?: {
    monthly_sales_avg: Fact;
    expected_profit: PersonalFit["expected_profit"];
    report_grade: Fact<Grade>;
    within_budget: boolean | null;
    visible_points: number;
  };
};
type ListResponse = { mine: Listing[]; published: BuyerItem[]; has_profile: boolean };

export default function ListingsPage() {
  const user = useUser();
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ListResponse>("/api/listings")
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [user.id, reload]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">매물</h1>
          <p className="text-sm text-muted">지금 {user.name}로 보고 있어요.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DemoButton onDone={() => setReload((n) => n + 1)} />
          {user.role === "seller" && (
            <Link href="/listings/new" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
              매물 등록
            </Link>
          )}
        </div>
      </div>

      {error && <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{error}</p>}
      {!data && !error && <p className="text-sm text-muted">불러오는 중...</p>}

      {data && user.role === "seller" && <MyListings items={data.mine} />}
      {data && user.role === "buyer" && <BuyerExplore data={data} />}
      {data && user.role === "seller" && <PublishedTable items={data.published} />}
    </div>
  );
}

// ---- 샘플 데이터로 시연하기 (PRD 11.6) ----

function DemoButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiFetch<{ listings: { name: string }[] }>("/api/demo", { method: "POST" });
      setMsg(`샘플 매물 ${r.listings.length}개를 새로 만들었어요.`);
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted">{msg}</span>}
      <button
        type="button"
        onClick={run}
        disabled={busy}
        title="샘플 매물 3개와 양수인 조건을 다시 만들어요. 샘플이 아닌 매물은 건드리지 않아요."
        className="rounded-lg bg-card px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {busy ? "샘플 만드는 중... (최대 1분)" : "샘플 데이터로 시연하기"}
      </button>
    </span>
  );
}

// ---- 양도인 ----

function MyListings({ items }: { items: Listing[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-muted">내 매물 ({items.length})</h2>
      {items.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted">
          아직 등록한 매물이 없어요.{" "}
          <Link href="/listings/new" className="text-accent">
            매물 등록
          </Link>
        </p>
      ) : (
        <Table head={["매물", "업종", "희망 권리금", "보증금 / 월세", "상태", "등록일"]}>
          {items.map((l) => (
            <tr key={l.id} className="border-t border-bg hover:bg-bg/60">
              <td className="px-4 py-3">
                <Link href={`/listings/${l.id}`} className="font-medium hover:text-accent">
                  {l.business_name ?? l.address} {l.is_sample && <Tag>샘플</Tag>}
                  <span className="block text-xs font-normal text-muted">{l.address}</span>
                </Link>
              </td>
              <td className="px-4 py-3">{l.business_type}</td>
              <td className="px-4 py-3 tabular-nums">{won(l.premium)}</td>
              <td className="px-4 py-3 tabular-nums">{`${won(l.deposit)} / ${won(l.monthly_rent)}`}</td>
              <td className="px-4 py-3">{l.status === "published" ? <Tag tone="outline">공개 중</Tag> : <Tag>초안</Tag>}</td>
              <td className="px-4 py-3 text-muted">{formatDate(l.created_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  );
}

function PublishedTable({ items }: { items: PublicListing[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-muted">다른 양도인의 공개 매물 ({items.length})</h2>
      {items.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted">아직 공개된 매물이 없어요.</p>
      ) : (
        <Table head={["위치", "업종", "희망 권리금", "보증금 / 월세", "층 · 면적"]}>
          {items.map((l) => (
            <tr key={l.id} className="border-t border-bg">
              <td className="px-4 py-3">
                <Link href={`/listings/${l.id}`} className="font-medium hover:text-accent">
                  {l.area} {l.is_sample && <Tag>샘플</Tag>}
                </Link>
              </td>
              <td className="px-4 py-3">{l.business_type}</td>
              <td className="px-4 py-3 tabular-nums">{won(l.premium)}</td>
              <td className="px-4 py-3 tabular-nums">{`${won(l.deposit)} / ${won(l.monthly_rent)}`}</td>
              <td className="px-4 py-3">{`${l.floor ?? "-"}층 · ${l.area_pyeong ?? "-"}평`}</td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  );
}

// ---- 양수인: 추천·필터·비교 선택 ----

function BuyerExplore({ data }: { data: ListResponse }) {
  const selected = useCompareIds();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [area, setArea] = useState("");
  const [budgetOnly, setBudgetOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [minProfit, setMinProfit] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const areas = useMemo(() => [...new Set(data.published.map((l) => l.area))], [data.published]);
  const types = useMemo(() => [...new Set(data.published.map((l) => l.business_type))], [data.published]);
  const rows = data.published
    .filter((l) => !q || `${l.area} ${l.business_type} ${l.themes.join(" ")}`.includes(q.trim()))
    .filter((l) => !type || l.business_type === type)
    .filter((l) => !area || l.area === area)
    .filter((l) => !budgetOnly || l.summary?.within_budget !== false)
    .filter((l) => !verifiedOnly || !!l.summary?.report_grade.value)
    .filter((l) => !minProfit || (l.summary?.expected_profit.value ?? -Infinity) >= Number(minProfit) * 10_000)
    .sort((a, b) => (b.recommendation?.total ?? 0) - (a.recommendation?.total ?? 0));

  function toggle(id: string) {
    if (selected.includes(id)) setCompareIds(selected.filter((x) => x !== id));
    else if (selected.length < MAX_COMPARE) setCompareIds([...selected, id]);
  }

  return (
    <section className="space-y-4">
      {!data.has_profile && (
        <p className="rounded-xl bg-caution/10 p-4 text-sm text-caution">
          인수 조건이 없어서 추천 점수가 정확하지 않아요.{" "}
          <Link href="/buyer/profile" className="font-medium underline">
            인수 조건 입력하기
          </Link>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-4">
        <div>
          <p className="font-medium">비교·실사 대상 {selected.length}/{MAX_COMPARE}</p>
          <p className="text-xs text-muted">
            인수 조건을 저장하면 AI가 3개를 자동으로 골라 실사를 시작해요. 여기서는 직접 바꿔 고를 수 있어요.{" "}
            <Link href="/buyer/profile" className="text-accent">
              인수 조건 {data.has_profile ? "수정" : "입력"}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/compare?ids=${selected.join(",")}`}
            aria-disabled={selected.length === 0}
            className={"rounded-lg px-4 py-2 text-sm font-medium " + (selected.length ? "bg-bg text-text" : "pointer-events-none bg-bg text-muted opacity-50")}
          >
            비교표 보기
          </Link>
          <Link
            href={`/diligence?ids=${selected.join(",")}`}
            aria-disabled={selected.length === 0}
            className={"rounded-lg px-4 py-2 text-sm font-medium text-white " + (selected.length ? "bg-accent" : "pointer-events-none bg-accent opacity-50")}
          >
            AI 실사 시작
          </Link>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl bg-card p-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색 (지역, 업종, 테마)" className="rounded-lg bg-bg px-3 py-2 sm:col-span-2" />
        <select value={area} onChange={(e) => setArea(e.target.value)} className="rounded-lg bg-bg px-3 py-2">
          <option value="">지역 전체</option>
          {areas.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg bg-bg px-3 py-2">
          <option value="">업종 전체</option>
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input value={minProfit} onChange={(e) => setMinProfit(e.target.value.replace(/[^0-9]/g, ""))} placeholder="최소 예상 순수익 (만원)" inputMode="numeric" className="rounded-lg bg-bg px-3 py-2" />
        <div className="flex flex-col justify-center gap-1">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={budgetOnly} onChange={(e) => setBudgetOnly(e.target.checked)} /> 예산 안
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} /> 검증 결과 있음
          </label>
        </div>
      </div>

      <p className="text-xs text-muted">
        추천 점수 = {Object.entries(SCORE_WEIGHTS).map(([k, w]) => `${SCORE_LABEL[k as keyof typeof SCORE_WEIGHTS]} ${w}`).join(" + ")} (100점). 지금 볼 수 있는 자료로만 계산해요. 모르는
        항목은 0점이 아니라 &quot;정보 부족&quot;으로 빼고 계산해요.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted">조건에 맞는 매물이 없어요. &quot;샘플 데이터로 시연하기&quot;로 샘플 매물을 만들 수 있어요.</p>
      ) : (
        <Table head={["추천", "매물", "초기 투자금", "월평균 매출", "예상 월 순수익", "검증", ""]}>
          {rows.map((l) => {
            const r = l.recommendation;
            const s = l.summary;
            const on = selected.includes(l.id);
            return [
              <tr key={l.id} className="border-t border-bg align-top">
                <td className="px-4 py-3">
                  <button type="button" onClick={() => setOpen(open === l.id ? null : l.id)} className="text-left">
                    <span className="text-lg font-bold tabular-nums">{r?.total ?? "-"}</span>
                    <span className="text-xs text-muted">/{r?.max ?? 100}</span>
                    <span className="block text-xs text-accent">{open === l.id ? "이유 닫기" : "추천 이유"}</span>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/listings/${l.id}`} className="font-medium hover:text-accent">
                    {l.area} {l.business_type}
                  </Link>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {l.is_sample && <Tag>샘플</Tag>}
                    {r?.info_lacking && <Tag tone="caution">정보 부족</Tag>}
                    {s?.within_budget === false && <Tag tone="warn">예산 초과</Tag>}
                    {l.themes.map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums">{won(l.premium + l.deposit)}</td>
                <td className="px-4 py-3 tabular-nums">{s?.monthly_sales_avg.value != null ? won(s.monthly_sales_avg.value) : <Tag>미확인</Tag>}</td>
                <td className="px-4 py-3 tabular-nums">{s?.expected_profit.value != null ? won(s.expected_profit.value) : <Tag>미확인</Tag>}</td>
                <td className="px-4 py-3">{s?.report_grade.value ? <Tag tone="outline">{`등급 ${s.report_grade.value}`}</Tag> : <Tag>미확인</Tag>}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggle(l.id)}
                    disabled={!on && selected.length >= MAX_COMPARE}
                    className={"rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40 " + (on ? "bg-accent text-white" : "bg-bg text-text")}
                  >
                    {on ? "비교 대상 ✓" : "비교에 추가"}
                  </button>
                </td>
              </tr>,
              open === l.id && r && (
                <tr key={l.id + "-why"} className="bg-bg/50">
                  <td colSpan={7} className="px-4 py-3">
                    <ul className="grid gap-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                      {r.items.map((i) => (
                        <li key={i.key} className="flex gap-2">
                          <span className="w-16 shrink-0 font-medium">{SCORE_LABEL[i.key]}</span>
                          <span className="shrink-0 tabular-nums">{i.score === null ? <Tag>정보 부족</Tag> : `${i.score}/${i.max}`}</span>
                          <span className="text-muted">{i.reason}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-muted">공개된 숫자 {s?.visible_points ?? 0}개로 계산했어요. NDA 동의나 열람 승인을 받으면 더 정확해져요.</p>
                  </td>
                </tr>
              ),
            ];
          })}
        </Table>
      )}
    </section>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-card">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
