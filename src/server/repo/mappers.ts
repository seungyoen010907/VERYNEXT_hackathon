/** DB 행(snake_case) ↔ 도메인 객체(camelCase) 변환 */

export function camelize<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return out as T;
}

export function camelizeAll<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map((r) => camelize<T>(r));
}

export function snake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}
