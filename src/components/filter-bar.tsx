/**
 * 목록 화면 상단 검색·필터 (GET 폼, 자바스크립트 없이 동작)
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { inputClass } from "./ui";

export function FilterBar({ action, children, resetHref, total }: { action: string; children: ReactNode; resetHref: string; total?: number }) {
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 rounded-sm border border-neutral-200 bg-white px-3 py-2.5">
      {children}
      <button type="submit" className="h-8 rounded-sm border border-neutral-900 bg-neutral-900 px-3 text-[13px] font-medium text-white hover:bg-neutral-800">
        적용
      </button>
      <Link href={resetHref} className="inline-flex h-8 items-center rounded-sm px-2 text-[13px] text-neutral-600 hover:text-neutral-900">
        초기화
      </Link>
      {total !== undefined && <span className="ml-auto self-center text-[12px] text-neutral-500">{total}건</span>}
    </form>
  );
}

export function FilterSelect({ name, label, value, options }: { name: string; label: string; value?: string; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-neutral-500">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={`${inputClass} w-auto min-w-32`}>
        <option value="">전체</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterSearch({ name = "q", value, placeholder }: { name?: string; value?: string; placeholder: string }) {
  return (
    <label className="block min-w-56 flex-1">
      <span className="mb-1 block text-[11px] text-neutral-500">검색</span>
      <input name={name} defaultValue={value ?? ""} placeholder={placeholder} className={inputClass} />
    </label>
  );
}

export function param(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return typeof v === "string" && v !== "" ? v : undefined;
}
