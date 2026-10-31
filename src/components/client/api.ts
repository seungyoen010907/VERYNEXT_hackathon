"use client";

import type { ApiResponse } from "@/types/domain";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/** API 호출. 실패하면 서버가 보낸 메시지로 ApiError를 던진다. */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  let body: ApiResponse<T>;
  try {
    body = await res.json();
  } catch {
    throw new ApiError("NETWORK", `서버 응답을 읽을 수 없습니다 (HTTP ${res.status})`);
  }
  if (body.error) throw new ApiError(body.error.code, body.error.message, body.error.details);
  return body.data as T;
}

/** zod flattenError 결과에서 필드별 첫 오류 메시지 */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !err.details || typeof err.details !== "object") return {};
  const fe = (err.details as { fieldErrors?: Record<string, string[]> }).fieldErrors ?? {};
  return Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v[0]]));
}
