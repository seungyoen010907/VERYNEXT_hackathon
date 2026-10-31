"use client";

/**
 * 차트 (Recharts). 서버에서 받은 실제 분석 데이터만 그린다. 값이 없는 칸은 그리지 않는다(null).
 * 색은 회색 계열 + 짙은 남색 하나를 기본으로 쓰고, 손실(음수)만 붉은색으로 표시한다.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { manwon, won, ym } from "@/lib/format";

const AXIS = { fontSize: 11, fill: "#737373" };
const GRID = "#e5e5e5";
export const SERIES_COLORS = ["#1e3a5f", "#737373", "#a3a3a3", "#4b6584", "#d4d4d4", "#0f172a"];

function tooltipFormatter(value: unknown) {
  return typeof value === "number" ? won(value) : "—";
}

export interface SeriesDef {
  key: string;
  label: string;
  color?: string;
  dashed?: boolean;
}

export function MonthlyLineChart({ data, series, height = 240, reference }: {
  data: Array<Record<string, number | string | null>>;
  series: SeriesDef[];
  height?: number;
  reference?: { value: number; label: string } | null;
}) {
  if (data.length === 0) return <p className="py-10 text-center text-[12px] text-neutral-500">표시할 월별 데이터가 없습니다.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="yearMonth" tickFormatter={(v) => ym(String(v))} tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} />
        {/* 기준선(주장 매출)이 데이터보다 커도 보이도록 축 범위에 포함한다 */}
        <YAxis
          tickFormatter={(v) => manwon(Number(v))}
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          width={56}
          domain={[0, (dataMax: number) => Math.ceil(Math.max(dataMax, reference?.value ?? 0) * 1.08)]}
        />
        <Tooltip formatter={tooltipFormatter} labelFormatter={(v) => ym(String(v))} contentStyle={{ fontSize: 12, borderRadius: 2, borderColor: "#d4d4d4" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
        {reference && <ReferenceLine y={reference.value} stroke="#b91c1c" strokeDasharray="4 3" label={{ value: reference.label, fontSize: 11, fill: "#b91c1c", position: "insideTopRight" }} />}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="linear"
            dataKey={s.key}
            name={s.label}
            stroke={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={i === 0 ? 2 : 1.5}
            strokeDasharray={s.dashed ? "4 3" : undefined}
            dot={{ r: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MonthlyBarChart({ data, series, height = 240, stacked }: {
  data: Array<Record<string, number | string | null>>;
  series: SeriesDef[];
  height?: number;
  stacked?: boolean;
}) {
  if (data.length === 0) return <p className="py-10 text-center text-[12px] text-neutral-500">표시할 월별 데이터가 없습니다.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }} barCategoryGap="25%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="yearMonth" tickFormatter={(v) => ym(String(v))} tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tickFormatter={(v) => manwon(Number(v))} tick={AXIS} axisLine={false} tickLine={false} width={56} />
        <Tooltip formatter={tooltipFormatter} labelFormatter={(v) => ym(String(v))} contentStyle={{ fontSize: 12, borderRadius: 2, borderColor: "#d4d4d4" }} cursor={{ fill: "#f5f5f5" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" />
        <ReferenceLine y={0} stroke="#a3a3a3" />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId={stacked ? "a" : undefined} fill={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]} isAnimationActive={false} maxBarSize={36} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** 영업이익처럼 음수가 있을 수 있는 단일 값 막대. 음수는 붉은색. */
export function ProfitBarChart({ data, dataKey, label, height = 200 }: {
  data: Array<Record<string, number | string | null>>;
  dataKey: string;
  label: string;
  height?: number;
}) {
  if (data.length === 0) return <p className="py-10 text-center text-[12px] text-neutral-500">표시할 월별 데이터가 없습니다.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="yearMonth" tickFormatter={(v) => ym(String(v))} tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tickFormatter={(v) => manwon(Number(v))} tick={AXIS} axisLine={false} tickLine={false} width={56} />
        <Tooltip formatter={tooltipFormatter} labelFormatter={(v) => ym(String(v))} contentStyle={{ fontSize: 12, borderRadius: 2, borderColor: "#d4d4d4" }} cursor={{ fill: "#f5f5f5" }} />
        <ReferenceLine y={0} stroke="#737373" />
        <Bar dataKey={dataKey} name={label} isAnimationActive={false} maxBarSize={36}>
          {data.map((d, i) => (
            <Cell key={i} fill={typeof d[dataKey] === "number" && (d[dataKey] as number) < 0 ? "#b91c1c" : "#1e3a5f"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
