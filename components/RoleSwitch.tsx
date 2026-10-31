"use client";

// 헤더의 모드 전환 (양도인 / 양수인). 실제 로그인 대신 쓰는 시연용 방식 (docs/API.md 10.1).
// 고른 사용자 id는 localStorage에 저장하고, 다른 컴포넌트는 useUser()·useRole()로 읽는다.

import { createContext, useContext, useSyncExternalStore } from "react";
import { DEFAULT_USER_ID, DEMO_USERS, findDemoUser, type DemoUser } from "@/lib/demo-users";
import type { Role } from "@/lib/types";

const STORAGE_KEY = "demo-user-id";
const CHANGE_EVENT = "demo-user-change";

export function readUserId(): string {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return findDemoUser(id) ? (id as string) : DEFAULT_USER_ID;
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

// 헤더: [양도인 | 양수인] 두 모드. 양도인 모드에서만 가게(양도인 A·B·C)를 고른다.
const SELLER_KEY = "demo-seller-id";

function lastSellerId(): string {
  try {
    const id = localStorage.getItem(SELLER_KEY);
    if (findDemoUser(id)?.role === "seller") return id as string;
  } catch {
    // 저장이 막힌 브라우저
  }
  return DEMO_USERS.find((u) => u.role === "seller")!.id;
}

function pick(id: string) {
  const u = findDemoUser(id);
  if (u?.role === "seller") {
    try {
      localStorage.setItem(SELLER_KEY, id);
    } catch {
      // 저장이 막힌 브라우저면 이번 화면에서만
    }
  }
  writeUserId(id);
}

export default function RoleSwitch() {
  const user = useUser();
  const buyer = DEMO_USERS.find((u) => u.role === "buyer")!;
  const sellers = DEMO_USERS.filter((u) => u.role === "seller");
  const modes = [
    { role: "seller" as const, label: "양도인", onClick: () => pick(lastSellerId()) },
    { role: "buyer" as const, label: "양수인", onClick: () => pick(buyer.id) },
  ];

  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-lg bg-bg p-0.5 text-sm whitespace-nowrap" role="group" aria-label="모드">
        {modes.map((m) => (
          <button
            key={m.role}
            type="button"
            onClick={m.onClick}
            aria-pressed={user.role === m.role}
            className={
              "rounded-md px-3 py-1 transition-colors " + (user.role === m.role ? "bg-accent font-medium text-white" : "text-muted hover:text-text")
            }
          >
            {m.label}
          </button>
        ))}
      </div>
      {user.role === "seller" && (
        <label className="flex items-center gap-1 text-sm">
          <span className="sr-only">내 가게</span>
          <select value={user.id} onChange={(e) => pick(e.target.value)} className="rounded-lg bg-bg px-2 py-1 text-sm" aria-label="내 가게">
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.store ?? s.short}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
