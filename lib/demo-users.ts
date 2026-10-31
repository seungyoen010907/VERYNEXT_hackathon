// 시연용 사용자 4명 (supabase/schema.sql에 같은 id로 들어 있다). 브라우저/서버 공용.
// 화면에서는 양도인·양수인 두 모드로 보이고, 양도인 모드에서만 가게(양도인 A·B·C)를 고른다.
// 실제 로그인 대신 헤더에서 고른다 (docs/API.md 10.1). 시연용이다.

import type { Role } from "./types";

export type DemoUser = {
  id: string;
  name: string;
  short: string;
  role: Role;
  store?: string; // 양도인 모드의 가게 선택에 보이는 이름 (샘플 매물 기준)
};

export const DEMO_USERS: DemoUser[] = [
  { id: "00000000-0000-0000-0000-00000000000a", name: "양도인 A", short: "양도인 A", role: "seller", store: "샘플분식" },
  { id: "00000000-0000-0000-0000-00000000000b", name: "양도인 B", short: "양도인 B", role: "seller", store: "샘플카페" },
  { id: "00000000-0000-0000-0000-00000000000c", name: "양도인 C", short: "양도인 C", role: "seller", store: "샘플국밥" },
  { id: "00000000-0000-0000-0000-0000000000b1", name: "양수인", short: "양수인", role: "buyer" },
];

export const DEFAULT_USER_ID = DEMO_USERS[3].id; // 양수인

export function findDemoUser(id: string | null | undefined): DemoUser | undefined {
  return DEMO_USERS.find((u) => u.id === id);
}
