"use client";

// 헤더의 데모 사용자 전환 (양도인 / 양수인). 실제 로그인 대신 쓰는 시연용 방식 (docs/API.md 10.1).
// 고른 사용자 id는 localStorage에 저장하고, 다른 컴포넌트는 useUser()·useRole()로 읽는다.

import { createContext, useContext, useSyncExternalStore } from "react";
import { DEFAULT_USER_ID, SWITCH_USERS, findDemoUser, type DemoUser } from "@/lib/demo-users";
import type { Role } from "@/lib/types";

const STORAGE_KEY = "demo-user-id";
const CHANGE_EVENT = "demo-user-change";

export function readUserId(): string {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    // 예전에 고른 양도인 B·C가 남아 있으면 기본값(양수인)으로 돌린다
    return SWITCH_USERS.some((u) => u.id === id) ? (id as string) : DEFAULT_USER_ID;
  } catch {
    return DEFAULT_USER_ID;
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

function writeUserId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // 저장이 막힌 브라우저면 이번 화면에서만 바뀐다
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const UserContext = createContext<DemoUser>(findDemoUser(DEFAULT_USER_ID)!);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  // 서버에는 localStorage가 없어서 기본값(양수인)으로 그리고, 브라우저에서 저장된 값으로 바꾼다.
  const id = useSyncExternalStore(subscribe, readUserId, () => DEFAULT_USER_ID);
  return <UserContext.Provider value={findDemoUser(id)!}>{children}</UserContext.Provider>;
}

export function useUser(): DemoUser {
  return useContext(UserContext);
}

export function useRole(): Role {
  return useContext(UserContext).role;
}

export const ROLE_LABEL: Record<Role | "agent", string> = {
  buyer: "양수인",
  seller: "양도인",
  agent: "에이전트",
};

export default function RoleSwitch() {
  const user = useUser();

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-muted sm:inline">데모 사용자</span>
      <div className="flex rounded-lg bg-bg p-0.5 text-sm whitespace-nowrap" role="group" aria-label="데모 사용자 전환">
        {SWITCH_USERS.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => writeUserId(u.id)}
            aria-pressed={user.id === u.id}
            className={
              user.id === u.id
                ? "rounded-md bg-accent px-2 py-1 font-medium text-white sm:px-2.5"
                : "rounded-md px-2 py-1 text-muted hover:text-text sm:px-2.5"
            }
          >
            {u.short}
          </button>
        ))}
      </div>
    </div>
  );
}
