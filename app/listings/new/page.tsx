"use client";

// 매물 등록 폼 (PRD 4.1 Step 1). 기본 정보는 폼으로 받고, 자료는 등록 뒤 데이터룸에서 올린다.
// 입력 규칙은 lib/listings.ts parseListingInput과 같다 (서버가 다시 검사한다).

import { useRouter } from "next/navigation";
import { useState } from "react";
import { premiumParts } from "@/lib/analysis";
import { useUser } from "@/components/RoleSwitch";
import { apiFetch } from "@/lib/api-client";
import { won } from "@/lib/format";
import { BUSINESS_TYPES } from "@/lib/types";

const THEMES = ["무권리", "급매", "프랜차이즈", "사무실", "공식 매물", "임대인 매물"];

type Form = Record<string, string>;

const EMPTY: Form = {
  address: "",
  building_name: "",
  business_name: "",
  business_type: "음식점",
  deposit: "",
  monthly_rent: "",
  premium: "",
  pb_business: "",
  pb_facility: "",
  pb_floor: "",
  pb_basis: "",
  franchise: "",
  floor: "",
  total_floors: "",
  area_pyeong: "",
  parking_total: "",
  parking_store: "",
  claimed_monthly_sales: "",
  claimed_monthly_profit: "",
  claimed_monthly_cash_sales: "",
  maintenance_fee: "",
  lease_remaining_months: "",
};

export default function NewListingPage() {
  const router = useRouter();
  const user = useUser();
  const [form, setForm] = useState<Form>(EMPTY);
  const [themes, setThemes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.value });
  const num = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value.replace(/[^0-9]/g, "") });

  // 단계마다 꼭 필요한 값 (docs/DESIGN.md 10.5: 3단계 마법사)
  const missing = [
    step === 0 && !form.address.trim() && "주소",
    step === 1 && !form.deposit && "보증금",
    step === 1 && !form.monthly_rent && "월세",
    step === 1 && !form.premium && "희망 권리금",
    step === 1 && !form.claimed_monthly_sales && "월매출",
  ].filter(Boolean) as string[];

  function next() {
    if (missing.length) return setError(`${missing.join(", ")}을(를) 넣어 주세요.`);
    setError(null);
    setStep((n) => Math.min(2, n + 1));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step < 2) return next(); // 엔터를 눌러도 다음 단계로만
    setLoading(true);
    setError(null);
    try {
      const body = {
        address: form.address,
        building_name: form.building_name,
        business_name: form.business_name,
        business_type: form.business_type,
        deposit: form.deposit,
        monthly_rent: form.monthly_rent,
        premium: form.premium,
        maintenance_fee: form.maintenance_fee,
        lease_remaining_months: form.lease_remaining_months,
        claimed_monthly_cash_sales: form.claimed_monthly_cash_sales,
        premium_breakdown: { business: form.pb_business, facility: form.pb_facility, floor: form.pb_floor, basis: form.pb_basis },
        is_franchise: form.franchise === "" ? null : form.franchise === "yes",
        floor: form.floor,
        total_floors: form.total_floors,
        area_pyeong: form.area_pyeong,
        themes,
        parking: { building_total: form.parking_total, for_store: form.parking_store },
        claimed_monthly_sales: form.claimed_monthly_sales,
        claimed_monthly_profit: form.claimed_monthly_profit,
      };
      const { id } = await apiFetch<{ id: string }>("/api/listings", { method: "POST", body: JSON.stringify(body) });
      router.push(`/listings/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록하지 못했어요. 잠시 후 다시 해 주세요.");
      setLoading(false);
    }
  }

  if (user.role !== "seller") {
    return (
      <p className="mx-auto max-w-2xl rounded-xl bg-card p-6 text-center text-sm text-muted">
        매물 등록은 양도인 모드에서 할 수 있어요. 위에서 &quot;양도인&quot;을 눌러 주세요.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-bold">매물 등록</h1>
        <p className="mt-1 text-sm text-muted">
          세 단계면 끝나요. 등록해도 공개하기 전까지는 나만 볼 수 있어요.
        </p>
      </div>

      <ol className="flex gap-2" aria-label={`${step + 1}/3단계`}>
        {WIZARD.map((w, i) => (
          <li key={w} className="flex-1">
            <span className={"viz-bar block h-1.5 rounded-full " + (i <= step ? "bg-accent" : "bg-border")} />
            <span className={"mt-1 block text-xs " + (i === step ? "font-bold" : "text-muted")}>
              {i + 1}. {w}
            </span>
          </li>
        ))}
      </ol>

      <div className={step === 0 ? "viz-fade space-y-8" : "hidden"}>
      <Fieldset title="어디에 있는 어떤 가게인가요?">
        <Field label="주소 *" full>
          <input value={form.address} onChange={set("address")} maxLength={200} placeholder="서울 마포구 ○○로 12, 1층" className={INPUT} />
        </Field>
        <Field label="건물명">
          <input value={form.building_name} onChange={set("building_name")} maxLength={100} className={INPUT} />
        </Field>
        <Field label="상호명">
          <input value={form.business_name} onChange={set("business_name")} maxLength={100} placeholder="샘플분식" className={INPUT} />
        </Field>
        <Field label="업종">
          <select value={form.business_type} onChange={set("business_type")} className={INPUT}>
            {BUSINESS_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="브랜드">
          <select value={form.franchise} onChange={set("franchise")} className={INPUT}>
            <option value="">고르지 않음</option>
            <option value="no">개인 매장</option>
            <option value="yes">프랜차이즈</option>
          </select>
        </Field>
      </Fieldset>

      </div>

      <div className={step === 1 ? "viz-fade space-y-8" : "hidden"}>
      <Fieldset title="보증금·월세·권리금">
        <Amount label="보증금 *" value={form.deposit} onChange={num("deposit")} placeholder="30000000" />
        <Amount label="월세 *" value={form.monthly_rent} onChange={num("monthly_rent")} placeholder="2500000" />
        <Amount label="월 관리비" value={form.maintenance_fee} onChange={num("maintenance_fee")} placeholder="300000" />
        <Field label="임대차 잔여기간 (개월)">
          <input value={form.lease_remaining_months} onChange={num("lease_remaining_months")} inputMode="numeric" placeholder="14" className={INPUT} />
        </Field>
        <Amount label="희망 권리금 *" value={form.premium} onChange={num("premium")} placeholder="60000000" />
        <Amount label="영업권리금" value={form.pb_business} onChange={num("pb_business")} />
        <Amount label="시설권리금" value={form.pb_facility} onChange={num("pb_facility")} />
        <Amount label="바닥권리금" value={form.pb_floor} onChange={num("pb_floor")} />
        <Field label="권리금을 이렇게 정한 이유" full>
          <textarea value={form.pb_basis} onChange={set("pb_basis")} maxLength={1000} rows={2} placeholder="예: 최근 6개월 순수익의 8개월분" className={INPUT} />
          <span className="mt-1 block text-xs text-muted">나누지 않은 금액은 &quot;미분류&quot;로 보여요. 월 비용과 시설 목록은 등록한 뒤 자료실에서 넣어요.</span>
        </Field>
      </Fieldset>

      <Fieldset title="한 달에 얼마나 버나요? (나중에 자료로 확인해요)">
        <Amount label="월매출 *" value={form.claimed_monthly_sales} onChange={num("claimed_monthly_sales")} placeholder="35000000" />
        <Amount label="월 순수익" value={form.claimed_monthly_profit} onChange={num("claimed_monthly_profit")} placeholder="8000000" />
        <Amount label="그중 월 현금매출" value={form.claimed_monthly_cash_sales} onChange={num("claimed_monthly_cash_sales")} placeholder="3000000" />
      </Fieldset>

      </div>

      <div className={step === 0 ? "viz-fade space-y-8" : "hidden"}>
      <Fieldset title="가게 크기와 주차">
        <Field label="층 / 전체 층">
          <div className="flex items-center gap-2">
            <input value={form.floor} onChange={num("floor")} inputMode="numeric" placeholder="1" className={INPUT} />
            <span className="text-muted">/</span>
            <input value={form.total_floors} onChange={num("total_floors")} inputMode="numeric" placeholder="5" className={INPUT} />
          </div>
        </Field>
        <Field label="면적 (평)">
          <input value={form.area_pyeong} onChange={num("area_pyeong")} inputMode="numeric" placeholder="20" className={INPUT} />
        </Field>
        <Field label="주차: 건물 전체 / 점포 사용 (대)">
          <div className="flex items-center gap-2">
            <input value={form.parking_total} onChange={num("parking_total")} inputMode="numeric" className={INPUT} />
            <span className="text-muted">/</span>
            <input value={form.parking_store} onChange={num("parking_store")} inputMode="numeric" className={INPUT} />
          </div>
        </Field>
        <Field label="매물 테마 (여러 개 선택)" full>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => {
              const on = themes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setThemes(on ? themes.filter((x) => x !== t) : [...themes, t])}
                  aria-pressed={on}
                  className={"rounded-full px-3 py-1 text-sm " + (on ? "bg-accent text-white" : "bg-bg text-muted hover:text-text")}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </Field>
      </Fieldset>

      </div>

      {step === 2 && <Review form={form} themes={themes} />}

      {error && <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{error}</p>}
      <div className="flex gap-2">
        {step > 0 && (
          <button type="button" onClick={() => (setError(null), setStep(step - 1))} className="rounded-lg bg-card px-5 py-3 font-medium">
            이전
          </button>
        )}
        {step < 2 ? (
          <button type="button" onClick={next} className="flex-1 rounded-lg bg-accent py-3 font-medium text-white">
            다음
          </button>
        ) : (
          <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-accent py-3 font-medium text-white disabled:opacity-60">
            {loading ? "만드는 중..." : "매물 등록하고 자료실 열기"}
          </button>
        )}
      </div>
    </form>
  );
}

const INPUT = "w-full rounded-lg border border-border bg-card px-3 py-2 tabular-nums";

function Fieldset({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-bold">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={"block " + (full ? "sm:col-span-2" : "")}>
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Amount({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <input value={value} onChange={onChange} inputMode="numeric" placeholder={placeholder} className={INPUT} />
      {value && <span className="mt-1 block text-xs text-muted">{won(Number(value))}</span>}
    </Field>
  );
}

const WIZARD = ["가게 정보", "돈 이야기", "확인"];

// 3단계: 넣은 값 확인 + 권리금 구성 띠
function Review({ form, themes }: { form: Form; themes: string[] }) {
  const n = (k: string) => (form[k] ? Number(form[k]) : null);
  const parts = premiumParts(n("premium") ?? 0, { business: n("pb_business"), facility: n("pb_facility"), floor: n("pb_floor") });
  const seg = [
    { label: "영업", v: parts.business, cls: "bg-accent" },
    { label: "시설", v: parts.facility, cls: "bg-accent/55" },
    { label: "바닥", v: parts.floor, cls: "bg-caution/70" },
    { label: "미분류", v: parts.unclassified || null, cls: "bg-muted/40" },
  ].filter((x): x is { label: string; v: number; cls: string } => !!x.v);
  const rows: [string, string][] = [
    ["주소", form.address],
    ["업종 · 상호", `${form.business_type}${form.business_name ? ` · ${form.business_name}` : ""}`],
    ["보증금 / 월세", `${won(n("deposit"))} / ${won(n("monthly_rent"))}`],
    ["관리비 · 잔여기간", `${form.maintenance_fee ? won(n("maintenance_fee")) : "미입력"} · ${form.lease_remaining_months ? `${form.lease_remaining_months}개월` : "미입력"}`],
    ["주장 월매출 (현금)", `${won(n("claimed_monthly_sales"))}${form.claimed_monthly_cash_sales ? ` (현금 ${won(n("claimed_monthly_cash_sales"))})` : ""}`],
    ["테마", themes.join(", ") || "없음"],
  ];
  return (
    <section className="viz-fade space-y-4 rounded-xl bg-card p-5">
      <h2 className="font-bold">이대로 등록할까요?</h2>
      <dl className="divide-y divide-bg text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-1.5">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="mb-1.5 text-sm">
          희망 권리금 <b className="tabular-nums">{won(parts.total)}</b>
        </p>
        {parts.total > 0 && (
          <>
            <div className="flex h-3 overflow-hidden rounded-full bg-border">
              {seg.map((x) => (
                <span key={x.label} className={"viz-grow-x h-full " + x.cls} style={{ width: `${(x.v / parts.total) * 100}%` }} />
              ))}
            </div>
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
              {seg.map((x) => (
                <span key={x.label}>
                  {x.label} {won(x.v)}
                </span>
              ))}
            </p>
          </>
        )}
      </div>
      <p className="text-xs text-muted">등록하면 자료실과 이 매물의 양도인 AI가 함께 생겨요. 다음 단계는 자료 올리기예요.</p>
    </section>
  );
}
