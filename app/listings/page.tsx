"use client";

// 매물 목록 / 탐색 (PRD 9번 화면 6)
// 양도인: 내 매물 + 공개 매물 / 양수인: 추천 점수(가중치 공개)·필터·비교 대상 선택(최대 3개)

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/RoleSwitch";
import Tag from "@/components/Tag";
import Gauge from "@/components/viz/Gauge";
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
          <h1 className="text-xl font-bold">{user.role === "buyer" ? "매물 찾기" : "내 매물"}</h1>
          <p className="text-sm text-muted">{user.role === "buyer" ? "내 조건에 잘 맞는 매물부터 보여드려요." : "매물마다 자료실과 양도인 AI가 있어요."}</p>
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
      setMsg(`샘플 매물 ${r.listings.length}개를 준비했어요.`);
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
        title="샘플 매물 3개와 양수인 조건을 처음 상태로 다시 만들어요. 직접 등록한 매물은 그대로 둬요."
        className="rounded-lg bg-card px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {busy ? "준비하는 중... (1분 이내)" : "샘플 매물로 둘러보기"}
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
          아직 등록한 매물이 없어요. 첫 매물을 등록해 보세요.{" "}
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

// ---- 양수인: 추천 카드 + 화면 아래 비교 트레이 (docs/DESIGN.md 10.5) ----

function BuyerExplore({ data }: { data: ListResponse }) {
  const selected = useCompareIds();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [area, setArea] = useState("");
  const [budgetOnly, setBudgetOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const areas = useMemo(() => [...new Set(data.published.map((l) => l.area))], [data.published]);
  const types = useMemo(() => [...new Set(data.published.map((l) => l.business_type))], [data.published]);
  const rows = data.published
    .filter((l) => !q || `${l.area} ${l.business_type} ${l.themes.join(" ")}`.includes(q.trim()))
    .filter((l) => !type || l.business_type === type)
    .filter((l) => !area || l.area === area)
    .filter((l) => !budgetOnly || l.summary?.within_budget !== false)
    .filter((l) => !verifiedOnly || !!l.summary?.report_grade.value)
    .sort((a, b) => (b.recommendation?.total ?? 0) - (a.recommendation?.total ?? 0));
  const byId = new Map(data.published.map((l) => [l.id, l]));

  function toggle(id: string) {
    if (selected.includes(id)) setCompareIds(selected.filter((x) => x !== id));
    else if (selected.length < MAX_COMPARE) setCompareIds([...selected, id]);
  }

  return (
    <section className="space-y-4 pb-28">
      {!data.has_profile && (
        <p className="rounded-xl bg-caution/10 p-4 text-sm text-caution">
          내 조건을 넣으면 더 잘 맞는 매물을 골라 드려요.{" "}
          <Link href="/buyer/profile" className="font-medium underline">
            내 조건 넣기
          </Link>
        </p>
      )}

      {/* 필터: 한 줄 */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="지역·업종·테마 검색" className="min-w-0 flex-1 rounded-lg bg-card px-3 py-2 sm:max-w-xs" />
        <select value={area} onChange={(e) => setArea(e.target.value)} className="rounded-lg bg-card px-3 py-2">
          <option value="">지역 전체</option>
          {areas.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg bg-card px-3 py-2">
          <option value="">업종 전체</option>
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <Chip on={budgetOnly} onClick={() => setBudgetOnly(!budgetOnly)}>
          예산 안에서
        </Chip>
        <Chip on={verifiedOnly} onClick={() => setVerifiedOnly(!verifiedOnly)}>
          매출 검증된 곳만
        </Chip>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted">조건에 맞는 매물이 없어요. 필터를 풀거나 &quot;샘플 매물로 둘러보기&quot;를 눌러 보세요.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((l, i) => {
            const r = l.recommendation;
            const s = l.summary;
            const on = selected.includes(l.id);
            return (
              <li
                key={l.id}
                className={"viz-fade flex flex-col rounded-xl bg-card p-4 transition-shadow " + (on ? "ring-2 ring-accent" : "")}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/listings/${l.id}`} className="font-bold hover:text-accent">
                      {l.area} {l.business_type}
                    </Link>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {l.is_sample && <Tag>샘플</Tag>}
                      {r?.info_lacking && <Tag tone="caution">정보 부족</Tag>}
                      {s?.within_budget === false && <Tag tone="warn">예산 초과</Tag>}
                      {s?.report_grade.value && <Tag tone="outline">{`매출 검증 ${s.report_grade.value}등급`}</Tag>}
                    </span>
                  </div>
                  <Gauge value={r ? r.total / r.max : null} label={r ? String(r.total) : "-"} sub="맞는 정도" size={92} />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Num label="초기 투자금" v={won(l.premium + l.deposit)} />
                  <Num label="월평균 매출" v={s?.monthly_sales_avg.value != null ? won(s.monthly_sales_avg.value) : "미확인"} />
                  <Num label="예상 순수익" v={s?.expected_profit.value != null ? won(s.expected_profit.value) : "미확인"} />
                </dl>
                {open === l.id && r && (
                  <ul className="viz-fade mt-3 space-y-1.5 text-xs">
                    {r.items.map((it) => (
                      <li key={it.key}>
                        <div className="flex justify-between">
                          <span className="font-medium">{SCORE_LABEL[it.key]}</span>
                          <span className="tabular-nums text-muted">{it.score === null ? "정보 부족" : `${it.score}/${it.max}`}</span>
                        </div>
                        <div className="mt-0.5 h-1.5 rounded-full bg-bg">
                          {it.score !== null && <div className="viz-grow-x h-full rounded-full bg-accent" style={{ width: `${(it.score / it.max) * 100}%` }} />}
                        </div>
                        <p className="text-muted">{it.reason}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                  <button type="button" onClick={() => setOpen(open === l.id ? null : l.id)} className="text-xs text-accent">
                    {open === l.id ? "접기" : "왜 이 점수일까요?"}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(l.id)}
                    disabled={!on && selected.length >= MAX_COMPARE}
                    className={"rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 " + (on ? "bg-accent text-white" : "bg-bg text-text")}
                  >
                    {on ? "담았어요 ✓" : "담기"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted">
        맞는 정도 = {Object.entries(SCORE_WEIGHTS).map(([k, w]) => `${SCORE_LABEL[k as keyof typeof SCORE_WEIGHTS]} ${w}`).join(" + ")}점. 지금 볼 수 있는 자료로만 계산하고, 모르는 항목은 빼고 계산해요.
      </p>

      {/* 비교 트레이: 화면 아래 고정 */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="text-sm font-bold tabular-nums">
            {selected.length}/{MAX_COMPARE}
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {selected.length === 0 ? (
              <span className="text-sm text-muted">매물을 최대 3개 담으면 AI가 양도인들에게 한 번에 물어봐요.</span>
            ) : (
              selected.map((id) => {
                const l = byId.get(id);
                return (
                  <button key={id} type="button" onClick={() => toggle(id)} className="viz-fade rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent" title="담기 취소">
                    {l ? `${l.area} ${l.business_type}` : "매물"} ×
                  </button>
                );
              })
            )}
          </div>
          <Link
            href={`/compare?ids=${selected.join(",")}`}
            aria-disabled={selected.length === 0}
            className={"rounded-lg px-4 py-2 text-sm font-medium " + (selected.length ? "bg-bg text-text" : "pointer-events-none bg-bg text-muted opacity-50")}
          >
            비교
          </Link>
          <Link
            href={`/diligence?ids=${selected.join(",")}`}
            aria-disabled={selected.length === 0}
            className={"rounded-lg px-4 py-2 text-sm font-medium text-white " + (selected.length ? "bg-accent" : "pointer-events-none bg-accent opacity-50")}
          >
            AI 실사 시작 →
          </Link>
        </div>
      </div>
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={"rounded-full px-3 py-1.5 text-sm transition-colors " + (on ? "bg-accent text-white" : "bg-card text-muted")}>
      {children}
    </button>
  );
}

function Num({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-lg bg-bg px-1.5 py-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={"text-xs font-bold tabular-nums " + (v === "미확인" ? "text-muted" : "")}>{v}</dd>
    </div>
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
