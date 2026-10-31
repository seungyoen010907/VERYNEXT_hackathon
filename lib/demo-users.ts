// 데모 사용자 4명 (supabase/schema.sql에 같은 id로 들어 있다). 브라우저/서버 공용.
// 실제 로그인 대신 헤더에서 고른다 (docs/API.md 10.1). 시연용이다.

import type { Role } from "./types";

export type DemoUser = {
  id: string;
  name: string;
  short: string;
  role: Role;
};

export const DEMO_USERS: DemoUser[] = [
  { id: "00000000-0000-0000-0000-00000000000a", name: "양도인 (데모)", short: "양도인", role: "seller" },
  { id: "00000000-0000-0000-0000-00000000000b", name: "양도인 B (데모)", short: "양도인 B", role: "seller" },
  { id: "00000000-0000-0000-0000-00000000000c", name: "양도인 C (데모)", short: "양도인 C", role: "seller" },
  { id: "00000000-0000-0000-0000-0000000000b1", name: "양수인 (데모)", short: "양수인", role: "buyer" },
];

export const DEFAULT_USER_ID = DEMO_USERS[3].id; // 양수인

// 헤더에서 고를 수 있는 사용자: 양도인 1명 + 양수인. 양도인 B·C는 샘플 매물 주인으로만 쓴다.
export const SWITCH_USERS: DemoUser[] = [DEMO_USERS[0], DEMO_USERS[3]];

export function findDemoUser(id: string | null | undefined): DemoUser | undefined {
  return DEMO_USERS.find((u) => u.id === id);
}
