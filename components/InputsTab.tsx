"use client";

// 데이터룸 "비용·시설 입력" 탭 (양도인만, PRD F08).
// 1) 기본 정보 추가(관리비·임대차 잔여기간·주장 현금매출) 2) 월 비용(변동/고정 자동 분류, 바꿀 수 있음) 3) 시설 목록(AI 시세 추정)
// 비용과 시설 목록은 데이터룸 항목이라 공개 등급을 따로 정한다.

import { useEffect, useState } from "react";
import Tag from "@/components/Tag";
import { facilityResult, FACILITY_VERDICT_LABEL, premiumParts } from "@/lib/analysis";
import { apiFetch } from "@/lib/api-client";
import { classifyCost, COST_GROUP_LABEL, COST_KIND_LABEL, DEFAULT_COST_LINES } from "@/lib/costs";
import { won } from "@/lib/format";
import { ACCESS_LABEL } from "@/lib/labels";
import {
  ACCESS_LEVELS,
  type AccessLevel,
  type CostGroup,
  type CostInput,
  type CostKind,
  type FacilityInput,
  type FacilityOwnership,
  type InputKey,
  type LaborInput,
  type Listing,
  type ListingInputs,
} from "@/lib/types";

const INPUT = "w-full rounded-lg bg-bg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent/30";

type CostRow = { name: string; amount: string; group: CostGroup; kind: CostKind | "auto" };
type FacilityRow = Omit<FacilityInput, "qty" | "purchase_year" | "purchase_price" | "claimed_value"> & {
  qty: string;
  purchase_year: string;
  purchase_price: string;
  claimed_value: string;
};

const toNum = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[^0-9]/g, "")));
const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

function toCostRows(costs: CostInput[]): CostRow[] {
  if (costs.length === 0) return DEFAULT_COST_LINES.map((l) => ({ name: l.name, amount: "", group: l.group, kind: "auto" }));
  return costs.map((c) => ({ name: c.name, amount: String(c.amount), group: c.group, kind: c.kind_source === "user" ? c.kind : "auto" }));
}

function toFacilityRows(items: FacilityInput[]): FacilityRow[] {
  return items.map((f) => ({ ...f, qty: String(f.qty), purchase_year: str(f.purchase_year), purchase_price: str(f.purchase_price), claimed_value: str(f.claimed_value) }));
}

const EMPTY_FACILITY: FacilityRow = {
  name: "",
  brand_model: "",
  qty: "1",
  purchase_year: "",
  purchase_price: "",
  condition: "",
  ownership: "owned",
  is_interior: false,
  has_receipt: false,
  claimed_value: "",
};

export default function InputsTab({ listing, onChanged }: { listing: Listing; onChanged: () => void }) {
  const [data, setData] = useState<ListingInputs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ListingInputs>(`/api/listings/${listing.id}/inputs`)
      .then((d) => (setData(d), setError(null)))
      .catch((e: Error) => setError(e.message));
  }, [listing.id]);

  if (error) return <p className="rounded-lg bg-warn/10 p-3 text-sm text-warn">{error}</p>;
  if (!data) return <p className="text-sm text-muted">불러오는 중...</p>;

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-card p-4 text-sm text-muted">
        여기 넣은 값으로 양수인에게 월 예상 순수익과 권리금 회수 기간을 계산해 보여줘요. 자세히 넣을수록 양수인이 덜 물어봐요.
      </p>
      <BasicExtras listing={listing} onChanged={onChanged} />
      <CostsSection listingId={listing.id} data={data} onSaved={setData} />
      <FacilitiesSection listing={listing} data={data} onSaved={setData} />
    </div>
  );
}

// ---- 1. 기본 정보 추가 ----

function BasicExtras({ listing, onChanged }: { listing: Listing; onChanged: () => void }) {
  const [fee, setFee] = useState(str(listing.maintenance_fee));
  const [lease, setLease] = useState(str(listing.lease_remaining_months));
  const [cash, setCash] = useState(str(listing.claimed_monthly_cash_sales));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const parts = premiumParts(listing.premium, listing.premium_breakdown);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch(`/api/listings/${listing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ maintenance_fee: toNum(fee), lease_remaining_months: toNum(lease), claimed_monthly_cash_sales: toNum(cash) }),
      });
      setMsg("저장했어요.");
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="기본 정보 더하기" hint="관리비와 잔여기간은 모두에게 보여요. 현금매출은 매출 검증 결과를 볼 수 있는 양수인에게만 보여요.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Labeled label="월 관리비 (원)" hint={fee ? won(toNum(fee)) : undefined}>
          <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="numeric" placeholder="300000" className={INPUT} />
        </Labeled>
        <Labeled label="임대차 잔여기간 (개월)">
          <input value={lease} onChange={(e) => setLease(e.target.value)} inputMode="numeric" placeholder="14" className={INPUT} />
        </Labeled>
        <Labeled label="월 현금매출 (원)" hint={cash ? won(toNum(cash)) : undefined}>
          <input value={cash} onChange={(e) => setCash(e.target.value)} inputMode="numeric" placeholder="3000000" className={INPUT} />
        </Labeled>
      </div>
      <p className="mt-3 text-xs text-muted">
        권리금 {won(parts.total)} = 영업 {won(parts.business)} · 시설 {won(parts.facility)} · 바닥 {won(parts.floor)}
        {parts.unclassified > 0 && <> · <span className="font-medium text-warn">미분류 {won(parts.unclassified)}</span></>}
        {" "}(나누지 않은 금액은 &quot;미분류&quot;로 보여요)
      </p>
      <SaveRow busy={busy} msg={msg} onSave={save} />
    </Section>
  );
}

// ---- 2. 월 비용 ----

function CostsSection({ listingId, data, onSaved }: { listingId: string; data: ListingInputs; onSaved: (d: ListingInputs) => void }) {
  const [rows, setRows] = useState<CostRow[]>(() => toCostRows(data.costs));
  const [labor, setLabor] = useState<LaborInput>(data.labor ?? { family: 0, staff: 0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const set = (i: number, patch: Partial<CostRow>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const kindOf = (r: CostRow): CostKind => (r.kind === "auto" ? classifyCost(r.name) : r.kind);
  const total = (k: CostKind) => rows.filter((r) => kindOf(r) === k).reduce((a, r) => a + (toNum(r.amount) ?? 0), 0);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const costs = rows
        .filter((r) => r.name.trim() && (toNum(r.amount) ?? 0) > 0)
        .map((r) => ({ name: r.name.trim(), amount: toNum(r.amount), group: r.group, kind: r.kind === "auto" ? "unknown" : r.kind, kind_source: r.kind === "auto" ? "auto" : "user" }));
      const d = await apiFetch<ListingInputs>(`/api/listings/${listingId}/inputs`, { method: "PUT", body: JSON.stringify({ costs, labor }) });
      onSaved(d);
      setMsg(`비용 ${d.costs.length}개를 저장했어요.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="월 비용"
      hint="월세와 관리비는 따로 넣지 않아도 돼요. 이름을 보고 변동비(매출 따라 바뀌는 돈)와 고정비를 자동으로 나눠요. 틀렸다면 바꿔 주세요."
      access={<AccessPicker which="input_cost" data={data} onChanged={onSaved} listingId={listingId} />}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 font-medium">항목</th>
              <th className="py-1 font-medium">종류</th>
              <th className="py-1 font-medium">월 금액 (원)</th>
              <th className="py-1 font-medium">변동·고정</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-bg">
                <td className="py-1.5 pr-2">
                  <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} maxLength={60} className={INPUT} aria-label="비용 이름" />
                </td>
                <td className="py-1.5 pr-2">
                  <select value={r.group} onChange={(e) => set(i, { group: e.target.value as CostGroup })} className={INPUT} aria-label="비용 묶음">
                    {(Object.keys(COST_GROUP_LABEL) as CostGroup[]).map((g) => (
                      <option key={g} value={g}>
                        {COST_GROUP_LABEL[g]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 pr-2">
                  <input value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} inputMode="numeric" placeholder="0" className={INPUT} aria-label="월 금액" />
                </td>
                <td className="py-1.5 pr-2">
                  <select value={r.kind} onChange={(e) => set(i, { kind: e.target.value as CostRow["kind"] })} className={INPUT} aria-label="분류">
                    <option value="auto">자동 ({COST_KIND_LABEL[classifyCost(r.name)]})</option>
                    <option value="variable">변동비</option>
                    <option value="fixed">고정비</option>
                    <option value="unknown">잘 모르겠어요</option>
                  </select>
                </td>
                <td className="py-1.5 text-right">
                  <button type="button" onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))} className="text-xs text-muted hover:text-warn">
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => setRows((prev) => [...prev, { name: "", amount: "", group: "other", kind: "auto" }])} className="mt-2 text-sm text-accent">
        + 비용 더하기
      </button>
      <p className="mt-2 text-xs text-muted">
        변동비 {won(total("variable"))} · 고정비 {won(total("fixed"))} · 확인 필요 {won(total("unknown"))} · 금액이 없는 줄은 저장하지 않아요
      </p>

      <div className="mt-4 rounded-lg bg-bg p-3">
        <p className="text-sm font-medium">함께 일하는 사람</p>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
          <Labeled label="가족·동업자 (명)">
            <input value={labor.family} onChange={(e) => setLabor({ ...labor, family: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })} inputMode="numeric" className={INPUT + " w-20 bg-card"} />
          </Labeled>
          <Labeled label="고용한 직원 (명)">
            <input value={labor.staff} onChange={(e) => setLabor({ ...labor, staff: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })} inputMode="numeric" className={INPUT + " w-20 bg-card"} />
          </Labeled>
          <span className="text-xs text-muted">{labor.family === 0 && labor.staff === 0 ? "지금은 혼자 운영해요" : "가족·동업자 인건비를 비용에 넣지 않았다면 양수인에게 안내가 보여요"}</span>
        </div>
      </div>
      <SaveRow busy={busy} msg={msg} onSave={save} />
    </Section>
  );
}

// ---- 3. 시설 목록 ----

const OWNERSHIP_LABEL: Record<FacilityOwnership, string> = { owned: "직접 소유", rental: "렌탈", lease: "리스" };

function FacilitiesSection({ listing, data, onSaved }: { listing: Listing; data: ListingInputs; onSaved: (d: ListingInputs) => void }) {
  const [rows, setRows] = useState<FacilityRow[]>(() => toFacilityRows(data.facilities));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (i: number, patch: Partial<FacilityRow>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  // 저장된 값(AI 추정 포함)으로 판정을 미리 보여준다
  const result = facilityResult(data.facilities, listing.premium_breakdown?.facility ?? null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const facilities = rows
        .filter((r) => r.name.trim())
        .map((r) => ({ ...r, qty: toNum(r.qty) ?? 1, purchase_year: toNum(r.purchase_year), purchase_price: toNum(r.purchase_price), claimed_value: toNum(r.claimed_value) }));
      const d = await apiFetch<ListingInputs & { ai_failed: boolean }>(`/api/listings/${listing.id}/inputs`, { method: "PUT", body: JSON.stringify({ facilities }) });
      onSaved(d);
      setRows(toFacilityRows(d.facilities));
      setMsg(d.ai_failed ? "저장했어요. AI가 시세를 추정하지 못해 '시세를 모르겠어요'로 보여요. 다시 저장하면 다시 추정해요." : `시설 ${d.facilities.length}개를 저장했어요.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="시설 목록"
      hint="시설마다 넣으면 시설권리금의 근거가 돼요. 저장하면 AI가 중고로 팔 때 받을 만한 금액을 추정해요. 사진과 영수증은 '자료' 탭에 올려 주세요."
      access={<AccessPicker which="input_facility" data={data} onChanged={onSaved} listingId={listing.id} />}
    >
      <div className="space-y-3">
        {rows.length === 0 && <p className="text-sm text-muted">아직 넣은 시설이 없어요.</p>}
        {rows.map((r, i) => {
          const saved = data.facilities.findIndex((f) => f.name === r.name);
          const row = saved >= 0 ? result.rows[saved] : null;
          return (
            <div key={i} className="rounded-lg bg-bg p-3">
              <div className="grid gap-2 sm:grid-cols-4">
                <Labeled label="시설명 *">
                  <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} maxLength={60} placeholder="업소용 냉장고" className={INPUT + " bg-card"} />
                </Labeled>
                <Labeled label="브랜드·모델">
                  <input value={r.brand_model ?? ""} onChange={(e) => set(i, { brand_model: e.target.value })} maxLength={80} className={INPUT + " bg-card"} />
                </Labeled>
                <Labeled label="수량">
                  <input value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} inputMode="numeric" className={INPUT + " bg-card"} />
                </Labeled>
                <Labeled label="산 연도">
                  <input value={r.purchase_year} onChange={(e) => set(i, { purchase_year: e.target.value })} inputMode="numeric" placeholder="2023" className={INPUT + " bg-card"} />
                </Labeled>
                <Labeled label="산 가격 (원, 전체)">
                  <input value={r.purchase_price} onChange={(e) => set(i, { purchase_price: e.target.value })} inputMode="numeric" className={INPUT + " bg-card"} />
                </Labeled>
                <Labeled label="상태">
                  <input value={r.condition ?? ""} onChange={(e) => set(i, { condition: e.target.value })} maxLength={40} placeholder="양호" className={INPUT + " bg-card"} />
                </Labeled>
                <Labeled label="소유 형태">
                  <select value={r.ownership} onChange={(e) => set(i, { ownership: e.target.value as FacilityOwnership })} className={INPUT + " bg-card"}>
                    {(Object.keys(OWNERSHIP_LABEL) as FacilityOwnership[]).map((o) => (
                      <option key={o} value={o}>
                        {OWNERSHIP_LABEL[o]}
                      </option>
                    ))}
                  </select>
                </Labeled>
                <Labeled label="권리금에 넣은 금액 (원)">
                  <input value={r.claimed_value} onChange={(e) => set(i, { claimed_value: e.target.value })} inputMode="numeric" className={INPUT + " bg-card"} />
                </Labeled>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={r.is_interior} onChange={(e) => set(i, { is_interior: e.target.checked })} /> 인테리어
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={r.has_receipt} onChange={(e) => set(i, { has_receipt: e.target.checked })} /> 영수증·세금계산서 있음
                </label>
                {row && (
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <Tag tone={row.verdict === "ok" ? "outline" : row.verdict === "over" || row.verdict === "excluded" ? "warn" : "muted"}>{FACILITY_VERDICT_LABEL[row.verdict]}</Tag>
                    {row.low !== null && row.high !== null && `AI 추정 ${won(row.low)} ~ ${won(row.high)}`}
                  </span>
                )}
                <button type="button" onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))} className="ml-auto text-xs text-muted hover:text-warn">
                  삭제
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" onClick={() => setRows((prev) => [...prev, { ...EMPTY_FACILITY }])} className="mt-2 text-sm text-accent">
        + 시설 더하기
      </button>
      {data.facilities.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          시설권리금 {won(result.claimed)} · 확인 가능한 시설 가치 {won(result.value)} (AI 추정 하단 합)
          {result.excess !== null && result.excess > 0 && ` · 근거 부족 또는 초과 ${won(result.excess)}`}
        </p>
      )}
      <SaveRow busy={busy} msg={msg} onSave={save} label={busy ? "저장하고 AI가 추정하는 중..." : "저장하기"} />
    </Section>
  );
}

// ---- 공용 ----

function AccessPicker({ which, data, listingId, onChanged }: { which: InputKey; data: ListingInputs; listingId: string; onChanged: (d: ListingInputs) => void }) {
  const current = data.levels[which];
  const [busy, setBusy] = useState(false);
  if (!current) return <span className="text-xs text-muted">저장하면 공개 범위를 정할 수 있어요</span>;
  async function change(level: AccessLevel) {
    setBusy(true);
    try {
      await apiFetch(`/api/documents/${current!.document_id}`, { method: "PATCH", body: JSON.stringify({ summary_access_level: level }) });
      onChanged(await apiFetch<ListingInputs>(`/api/listings/${listingId}/inputs`));
    } finally {
      setBusy(false);
    }
  }
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      공개 범위
      <select value={current.level} disabled={busy} onChange={(e) => change(e.target.value as AccessLevel)} className="rounded-md bg-bg px-2 py-1 text-xs text-text">
        {ACCESS_LEVELS.map((l) => (
          <option key={l} value={l}>
            {ACCESS_LABEL[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

function Section({ title, hint, access, children }: { title: string; hint?: string; access?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-bold">{title}</h2>
        {access}
      </div>
      {hint && <p className="mt-1 mb-3 text-xs text-muted">{hint}</p>}
      {children}
    </section>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

function SaveRow({ busy, msg, onSave, label }: { busy: boolean; msg: string | null; onSave: () => void; label?: string }) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <button type="button" onClick={onSave} disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
        {label ?? (busy ? "저장하는 중..." : "저장하기")}
      </button>
      {msg && <span className="text-sm text-muted">{msg}</span>}
    </div>
  );
}
