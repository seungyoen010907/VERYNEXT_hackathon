// 금액·날짜 표시. 브라우저/서버 공용.

export function won(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

// 0.409 -> "+40.9%"
export function percent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "-";
  const sign = rate > 0 ? "+" : "";
  return `${sign}${(rate * 100).toFixed(1)}%`;
}

// 서버와 브라우저 결과가 같도록 시간대를 고정한다.
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
