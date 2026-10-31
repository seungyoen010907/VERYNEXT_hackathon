import "server-only";

// Supabase 서버 클라이언트. secret 키는 RLS를 우회하므로 서버 코드에서만 쓴다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "deal-documents";

// 환경변수가 없어도 빌드가 터지지 않게 함수 안에서 만든다
export function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL 또는 SUPABASE_SECRET_KEY가 설정되지 않았어요. .env.local을 확인해주세요.");
  return createClient(url, key, { auth: { persistSession: false } });
}
