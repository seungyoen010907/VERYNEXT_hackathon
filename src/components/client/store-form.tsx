"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Store } from "@/types/domain";
import { Button, Field, Input, Notice, Panel, inputClass } from "../ui";
import { api, fieldErrors } from "./api";

type MoneyKey =
  | "deposit"
  | "monthlyRent"
  | "premium"
  | "claimedMonthlyRevenue"
  | "claimedMonthlyNetProfit"
  | "facilityInvestment"
  | "otherInitialCost";

const MONEY_FIELDS: Array<{ key: MoneyKey; label: string; required: boolean; hint?: string; allowNegative?: boolean }> = [
  { key: "deposit", label: "보증금", required: true },
  { key: "monthlyRent", label: "월세", required: true },
  { key: "premium", label: "권리금", required: true },
  { key: "claimedMonthlyRevenue", label: "월평균 매출 (양도인 주장)", required: false, hint: "비워두면 '미입력'으로 저장되며 매출 검증을 할 수 없습니다." },
  { key: "claimedMonthlyNetProfit", label: "월평균 순수익 (양도인 주장)", required: false, allowNegative: true, hint: "손실이면 음수로 입력하세요." },
  { key: "facilityInvestment", label: "시설 투자금 (인수 시 추가 투자)", required: false, hint: "없으면 0을 입력하세요. 비워두면 '미입력'입니다." },
  { key: "otherInitialCost", label: "기타 인수 비용", required: false, hint: "중개수수료 등. 없으면 0, 모르면 비워두세요." },
];

function toInput(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : v.toLocaleString("ko-KR");
}

/** "30,000,000" → 30000000, "" → null, 해석 불가 → NaN */
function parseMoney(v: string): number | null {
  const s = v.replace(/[,\s원]/g, "");
  if (s === "") return null;
  return /^-?\d+$/.test(s) ? Number(s) : NaN;
}

export function StoreForm({ store }: { store?: Store }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [money, setMoney] = useState<Record<MoneyKey, string>>(() =>
    Object.fromEntries(MONEY_FIELDS.map((f) => [f.key, toInput(store?.[f.key])])) as Record<MoneyKey, string>,
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nextErrors: Record<string, string> = {};
    const values: Record<string, number | null> = {};
    for (const f of MONEY_FIELDS) {
      const v = parseMoney(money[f.key]);
      if (Number.isNaN(v)) nextErrors[f.key] = "숫자만 입력하세요 (원 단위)";
      else if (v === null && f.required) nextErrors[f.key] = "필수 항목입니다";
      else if (v !== null && v < 0 && !f.allowNegative) nextErrors[f.key] = "0 이상이어야 합니다";
      values[f.key] = v;
    }
    const period = String(fd.get("businessPeriodMonths") ?? "").trim();
    if (period && !/^\d+$/.test(period)) nextErrors.businessPeriodMonths = "개월 수를 숫자로 입력하세요";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const body = {
      name: String(fd.get("name") ?? ""),
      industry: String(fd.get("industry") ?? ""),
      address: String(fd.get("address") ?? ""),
      businessPeriodMonths: period ? Number(period) : null,
      description: String(fd.get("description") ?? ""),
      isPublished: fd.get("isPublished") === "on",
      ...values,
    };
    setPending(true);
    setFormError(null);
    try {
      const saved = await api<Store>(store ? `/api/stores/${store.id}` : "/api/stores", {
        method: store ? "PATCH" : "POST",
        json: body,
      });
      router.push(`/stores/${saved.id}${store ? "" : "?tab=documents"}`);
      router.refresh();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(err instanceof Error ? err.message : "저장하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-4xl space-y-4" noValidate>
      {formError && <Notice tone="negative">{formError}</Notice>}
      <Panel title="점포 기본 정보">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="점포명 *" error={errors.name}>
            <Input name="name" defaultValue={store?.name} required maxLength={100} />
          </Field>
          <Field label="업종 *" hint="예: 카페, 한식, 치킨, 편의점. 업종에 따라 필요한 증빙 자료가 달라집니다." error={errors.industry}>
            <Input name="industry" defaultValue={store?.industry} required maxLength={50} list="industry-options" />
            <datalist id="industry-options">
              {["카페", "디저트", "베이커리", "한식", "중식", "일식", "분식", "치킨", "피자", "편의점", "주점", "미용실"].map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </Field>
          <Field label="주소 *" hint="시·도와 시·군·구로 지역 필터가 자동 지정됩니다." error={errors.address} className="sm:col-span-2">
            <Input name="address" defaultValue={store?.address} required maxLength={200} placeholder="서울특별시 마포구 ..." />
          </Field>
          <Field label="영업 기간 (개월)" error={errors.businessPeriodMonths}>
            <Input name="businessPeriodMonths" inputMode="numeric" defaultValue={store?.businessPeriodMonths ?? ""} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-1.5 text-[13px]">
            <input type="checkbox" name="isPublished" defaultChecked={store?.isPublished ?? false} className="size-4 accent-neutral-900" />
            양수인에게 매물 공개 (분석 결과 열람 허용, 원본 문서는 비공개)
          </label>
        </div>
      </Panel>

      <Panel title="금액 정보" description="모든 금액은 원 단위입니다. 확인되지 않은 값은 비워두세요. 빈 값은 0원으로 계산하지 않습니다.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MONEY_FIELDS.map((f) => (
            <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`} hint={f.hint} error={errors[f.key]}>
              <div className="relative">
                <input
                  className={`${inputClass} pr-7 text-right tabular-nums`}
                  inputMode="numeric"
                  value={money[f.key]}
                  onChange={(e) => setMoney((m) => ({ ...m, [f.key]: e.target.value }))}
                  onBlur={(e) => {
                    const v = parseMoney(e.target.value);
                    if (v !== null && !Number.isNaN(v)) setMoney((m) => ({ ...m, [f.key]: v.toLocaleString("ko-KR") }));
                  }}
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-neutral-400">원</span>
              </div>
            </Field>
          ))}
        </div>
      </Panel>

      <Panel title="점포 소개">
        <textarea name="description" defaultValue={store?.description} maxLength={5000} rows={4} className={`${inputClass} h-auto py-2`} />
      </Panel>

      <div className="flex justify-end gap-2">
        <Button onClick={() => router.back()}>취소</Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "저장 중…" : store ? "변경 사항 저장" : "매물 등록"}
        </Button>
      </div>
    </form>
  );
}
