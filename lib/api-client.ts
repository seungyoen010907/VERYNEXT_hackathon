"use client";

// 브라우저 → /api 호출. 모든 요청에 현재 데모 사용자 id를 x-user-id 헤더로 붙이고,
// 실패하면 서버가 준 { error } 메시지로 에러를 던진다.

import { readUserId } from "@/components/RoleSwitch";

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-user-id", readUserId());
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했어요." }));
  if (!res.ok) throw new Error(data.error ?? "요청에 실패했어요.");
  return data as T;
}
