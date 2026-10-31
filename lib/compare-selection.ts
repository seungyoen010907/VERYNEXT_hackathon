"use client";

// 비교·실사 대상으로 고른 매물 (최대 3개). 이 브라우저에만 저장하는 편의 기능이다.

import { useSyncExternalStore } from "react";

export const MAX_COMPARE = 3;
const KEY = "compare-listing-ids";
const EVENT = "compare-change";
const EMPTY: string[] = [];
let cache: { raw: string | null; ids: string[] } = { raw: null, ids: EMPTY };

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== cache.raw) {
      const parsed = raw ? JSON.parse(raw) : [];
      cache = { raw, ids: Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string").slice(0, MAX_COMPARE) : EMPTY };
    }
    return cache.ids;
  } catch {
    return EMPTY;
  }
}

export function setCompareIds(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX_COMPARE)));
  } catch {
    // 저장이 막힌 브라우저면 무시
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useCompareIds(): string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
