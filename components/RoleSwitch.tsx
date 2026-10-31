"use client";

// 헤더의 "양도인으로 보기 / 양수인으로 보기" 전환.
// 고른 역할은 localStorage에 저장하고, 다른 컴포넌트는 useRole()로 읽는다.

import { createContext, useContext, useSyncExternalStore } from "react";
import type { Role } from "@/lib/types";

const STORAGE_KEY = "role";
const CHANGE_EVENT = "role-change";
const DEFAULT_ROLE: Role = "buyer";

function readRole(): Role {
  try {
    return localStorage.getItem(STORAGE_KEY) === "seller" ? "seller" : "buyer";
  } catch {
    return DEFAULT_ROLE;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange); // 다른 탭에서 바꾼 경우
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function writeRole(role: Role) {
  try {
    localStorage.setItem(STORAGE_KEY, role);
  } catch {
    // 저장이 막힌 브라우저면 이번 화면에서만 바뀐다
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const RoleContext = createContext<Role>(DEFAULT_ROLE);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  // 서버에는 localStorage가 없어서 기본값(양수인)으로 그리고, 브라우저에서 저장된 값으로 바꾼다.
  const role = useSyncExternalStore(subscribe, readRole, () => DEFAULT_ROLE);
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): Role {
  return useContext(RoleContext);
}

export const ROLE_LABEL: Record<Role | "agent", string> = {
  buyer: "양수인",
  seller: "양도인",
  agent: "에이전트",
};

export default function RoleSwitch() {
  const role = useRole();
  const options: Role[] = ["seller", "buyer"];

  return (
    <div className="flex rounded-lg border border-border bg-card p-0.5 text-sm" role="group" aria-label="역할 전환">
      {options.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => writeRole(r)}
          aria-pressed={role === r}
          className={
            role === r
              ? "rounded-md bg-accent px-2.5 py-1 font-medium text-white"
              : "rounded-md px-2.5 py-1 text-muted hover:text-text"
          }
        >
          {ROLE_LABEL[r]}으로 보기
        </button>
      ))}
    </div>
  );
}
