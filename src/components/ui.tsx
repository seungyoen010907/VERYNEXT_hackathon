/**
 * 공통 UI 기본 요소 (서버 컴포넌트에서도 사용 가능)
 * 원칙: 흰 배경 + 1px 회색 테두리, 그림자·그라데이션 없음, 모서리는 작게(2px),
 * 상태 색상은 Badge의 tone 하나로만 표현한다.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(" ");
}

// -----------------------------------------------------------------------------
// 상태 표시
// -----------------------------------------------------------------------------
export type Tone = "neutral" | "positive" | "caution" | "negative" | "critical" | "muted" | "info";

const TONE: Record<Tone, string> = {
  neutral: "border-neutral-300 bg-white text-neutral-700",
  positive: "border-emerald-200 bg-emerald-50 text-emerald-800",
  caution: "border-amber-200 bg-amber-50 text-amber-800",
  negative: "border-red-200 bg-red-50 text-red-700",
  critical: "border-red-700 bg-red-700 text-white",
  muted: "border-dashed border-neutral-300 bg-neutral-50 text-neutral-500",
  info: "border-slate-300 bg-slate-100 text-slate-700",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex h-5 items-center whitespace-nowrap rounded-sm border px-1.5 text-[11px] font-medium leading-none",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  const color: Record<Tone, string> = {
    neutral: "bg-neutral-400",
    positive: "bg-emerald-600",
    caution: "bg-amber-500",
    negative: "bg-red-600",
    critical: "bg-red-800",
    muted: "bg-neutral-300",
    info: "bg-slate-500",
  };
  return <span className={cx("inline-block size-1.5 shrink-0 rounded-full", color[tone])} />;
}

// -----------------------------------------------------------------------------
// 버튼·입력
// -----------------------------------------------------------------------------
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const BTN: Record<ButtonVariant, string> = {
  primary: "border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800 disabled:border-neutral-400 disabled:bg-neutral-400",
  secondary: "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 disabled:text-neutral-400",
  ghost: "border-transparent bg-transparent text-neutral-700 hover:bg-neutral-100 disabled:text-neutral-400",
  danger: "border-red-300 bg-white text-red-700 hover:bg-red-50 disabled:text-red-300",
};
const BTN_BASE =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border px-3 text-[13px] font-medium disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-700";

export function Button({ variant = "secondary", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button type="button" {...props} className={cx(BTN_BASE, BTN[variant], className)} />;
}

export function ButtonLink({ variant = "secondary", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link {...props} className={cx(BTN_BASE, BTN[variant], className)} />;
}

export const inputClass =
  "h-8 w-full rounded-sm border border-neutral-300 bg-white px-2.5 text-[13px] text-neutral-900 placeholder:text-neutral-400 focus:border-blue-700 focus:outline-none disabled:bg-neutral-50";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cx(inputClass, "pr-7", props.className)} />;
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-[12px] font-medium text-neutral-700">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-[11px] text-red-700">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[11px] text-neutral-500">{hint}</span>
      ) : null}
    </label>
  );
}

// -----------------------------------------------------------------------------
// 레이아웃 블록
// -----------------------------------------------------------------------------
export function Panel({ title, description, actions, children, className, flush }: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** 표처럼 내부 여백 없이 꽉 채울 때 */
  flush?: boolean;
}) {
  return (
    <section className={cx("min-w-0 rounded-sm border border-neutral-200 bg-white", className)}>
      {(title || actions) && (
        <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2">
          <div className="min-w-0">
            {title && <h2 className="text-[13px] font-semibold text-neutral-900">{title}</h2>}
            {description && <p className="text-[12px] text-neutral-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, href, emphasis }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; emphasis?: boolean }) {
  const body = (
    <>
      <p className="text-[12px] text-neutral-500">{label}</p>
      <p className={cx("mt-1 text-2xl font-semibold tabular-nums tracking-tight", emphasis ? "text-red-700" : "text-neutral-900")}>{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-neutral-500">{sub}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="block border-neutral-200 bg-white px-4 py-3 hover:bg-neutral-50">
      {body}
    </Link>
  ) : (
    <div className="bg-white px-4 py-3">{body}</div>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-neutral-200 bg-neutral-200 lg:grid-cols-4">
      {children}
    </div>
  );
}

export function Progress({ value, tone = "neutral" }: { value: number; tone?: "neutral" | "positive" | "caution" }) {
  const color = { neutral: "bg-neutral-800", positive: "bg-emerald-600", caution: "bg-amber-500" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-[13px] font-medium text-neutral-700">{title}</p>
      {children && <div className="mt-1 text-[12px] text-neutral-500">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "caution" | "negative"; children: ReactNode }) {
  const style = {
    info: "border-slate-200 bg-slate-50 text-slate-700",
    caution: "border-amber-200 bg-amber-50 text-amber-900",
    negative: "border-red-200 bg-red-50 text-red-800",
  }[tone];
  return <div className={cx("rounded-sm border px-3 py-2 text-[12px] leading-relaxed", style)}>{children}</div>;
}

export function DefinitionList({ items, columns = 2 }: { items: Array<[string, ReactNode]>; columns?: 2 | 3 | 4 }) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columns];
  return (
    <dl className={cx("grid grid-cols-1 gap-x-6 gap-y-3", grid)}>
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] text-neutral-500">{k}</dt>
          <dd className="mt-0.5 text-[13px] text-neutral-900 tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TestDataBadge() {
  return <Badge tone="info">테스트 데이터</Badge>;
}
