/**
 * 데이터 테이블 기본 요소
 * - 열 제목은 회색 배경 한 줄, 금액·수치 열은 align="right"
 * - 행 구분은 얇은 선만 사용하고 줄무늬·그림자는 쓰지 않는다
 */
import type { ReactNode } from "react";
import { cx } from "./ui";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-[13px] tabular-nums">{children}</table>
    </div>
  );
}

type Align = "left" | "right" | "center";
const ALIGN: Record<Align, string> = { left: "text-left", right: "text-right", center: "text-center" };

export function Th({ children, align = "left", className, width }: { children?: ReactNode; align?: Align; className?: string; width?: string }) {
  return (
    <th
      style={width ? { width } : undefined}
      className={cx(
        "whitespace-nowrap border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-[12px] font-medium text-neutral-500",
        ALIGN[align],
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = "left", className, strong, muted, colSpan }: {
  children?: ReactNode;
  align?: Align;
  className?: string;
  strong?: boolean;
  muted?: boolean;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cx(
        "border-b border-neutral-100 px-3 py-2 align-top",
        ALIGN[align],
        strong && "font-semibold text-neutral-900",
        muted && "text-neutral-500",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({ children, highlight, className }: { children: ReactNode; highlight?: boolean; className?: string }) {
  return <tr className={cx("hover:bg-neutral-50", highlight && "bg-neutral-50 font-medium", className)}>{children}</tr>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-[13px] text-neutral-500">
        {children}
      </td>
    </tr>
  );
}
