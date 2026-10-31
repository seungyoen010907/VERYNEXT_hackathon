/** 화면 표시용 포맷 (서버·클라이언트 공용) */

export function won(v: number | null | undefined, empty = "—"): string {
  if (v === null || v === undefined || Number.isNaN(v)) return empty;
  return `${Math.round(v).toLocaleString("ko-KR")}원`;
}

/** 원 단위 없이 숫자만 (표의 열 제목에 단위를 적을 때) */
export function num(v: number | null | undefined, empty = "—"): string {
  if (v === null || v === undefined || Number.isNaN(v)) return empty;
  return Math.round(v).toLocaleString("ko-KR");
}

/** 3,000만 / 1.2억 */
export function manwon(v: number | null | undefined, empty = "—"): string {
  if (v === null || v === undefined) return empty;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(abs % 100_000_000 === 0 ? 0 : 2)}억`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 10_000).toLocaleString("ko-KR")}만`;
  return `${sign}${abs.toLocaleString("ko-KR")}`;
}

/** 0.1234 → 12.3% */
export function rate(v: number | null | undefined, digits = 1, empty = "—"): string {
  if (v === null || v === undefined) return empty;
  return `${(v * 100).toFixed(digits)}%`;
}

/** 이미 퍼센트 값인 숫자 (12.34 → 12.3%) */
export function pct(v: number | null | undefined, digits = 1, empty = "—"): string {
  if (v === null || v === undefined) return empty;
  return `${Number(v).toFixed(digits)}%`;
}

export function signedRate(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;
}

/** "2026-04-01" → "2026.04" */
export function ym(v: string | null | undefined): string {
  if (!v) return "—";
  return v.slice(0, 7).replace("-", ".");
}

/** ISO → "2026.10.31 14:05" (한국 시간) */
export function dateTime(v: string | null | undefined): string {
  if (!v) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(v))
    .replace(/\. /g, ".")
    .replace(/\.$/, "");
}

export function date(v: string | null | undefined): string {
  if (!v) return "—";
  return v.slice(0, 10).replace(/-/g, ".");
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function months(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const y = Math.floor(v / 12);
  const m = v % 12;
  return y > 0 ? `${y}년${m ? ` ${m}개월` : ""}` : `${m}개월`;
}
