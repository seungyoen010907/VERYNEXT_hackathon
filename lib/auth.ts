import "server-only";

// 요청 헤더 x-user-id로 데모 사용자를 찾는다 (docs/API.md 10.1).
// 누구나 헤더를 바꿀 수 있는 시연용 방식이다. 실제 사용자를 받기 전에 Supabase Auth로 바꾼다.

import { getSupabase } from "./supabase";

export type CurrentUser = {
  id: string;
  name: string;
  roles: string[];
};

export class AuthError extends Error {}

export async function getUser(request: Request): Promise<CurrentUser> {
  const id = request.headers.get("x-user-id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new AuthError("사용자를 선택해주세요.");
  const { data, error } = await getSupabase().from("users").select("id, name, roles").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new AuthError("알 수 없는 사용자예요.");
  return data as CurrentUser;
}
