import "server-only";

// 열람·다운로드·권한 변경·AI 답변 기록 (PRD 6번: 자료 열람과 권한 변경은 모두 기록한다)

import { getSupabase } from "./supabase";

export type AuditAction =
  | "view_dataroom"
  | "download"
  | "nda_agree"
  | "nda_revoke"
  | "grant_request"
  | "grant_approve"
  | "grant_reject"
  | "grant_revoke"
  | "access_change"
  | "agent_answer";

// 기록 실패가 본래 요청을 막지 않게 에러는 로그만 남긴다
export async function audit(actorId: string, action: AuditAction, listingId: string, target: string) {
  const { error } = await getSupabase().from("audit_logs").insert({ actor_id: actorId, action, listing_id: listingId, target });
  if (error) console.error("[audit]", error);
}
