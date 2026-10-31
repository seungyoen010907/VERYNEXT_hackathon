import "server-only";

// 공개 등급 권한 검사 (docs/API.md 10.3). 목록·상세·다운로드·AI 답변 모두 이 함수를 거친다.
// L0 누구나 / L1 NDA 테스트 동의 / L2 NDA + 그 자료에 대한 양도인 승인(만료 전) / L3 양도인만

import type { CurrentUser } from "./auth";
import { getSupabase } from "./supabase";
import type { AccessLevel, Listing } from "./types";

// document = 원본 파일, document_summary = 추출 요약(숫자)과 AI 분석 결과
export type GrantTargetType = "document" | "document_summary";

export type AccessTarget = { type: GrantTargetType; id: string | null };

export type AccessContext = {
  userId: string;
  isOwner: boolean;
  ndaAgreed: boolean;
  approved: Set<string>; // `${type}:${id}`
};

export const grantKey = (type: GrantTargetType, id: string) => `${type}:${id}`;

export async function loadAccess(user: CurrentUser, listing: Pick<Listing, "id" | "seller_id">): Promise<AccessContext> {
  const isOwner = listing.seller_id === user.id;
  if (isOwner) return { userId: user.id, isOwner, ndaAgreed: true, approved: new Set() };

  const supabase = getSupabase();
  const [nda, grants] = await Promise.all([
    supabase.from("ndas").select("status").eq("listing_id", listing.id).eq("buyer_id", user.id).maybeSingle(),
    supabase
      .from("access_grants")
      .select("target_type, target_id, expires_at")
      .eq("listing_id", listing.id)
      .eq("buyer_id", user.id)
      .eq("status", "approved"),
  ]);
  if (nda.error) throw nda.error;
  if (grants.error) throw grants.error;

  const now = Date.now();
  const approved = new Set(
    (grants.data ?? [])
      .filter((g) => !g.expires_at || new Date(g.expires_at).getTime() > now)
      .map((g) => grantKey(g.target_type, g.target_id)),
  );
  return { userId: user.id, isOwner, ndaAgreed: nda.data?.status === "test_agreed", approved };
}

export function canSee(ctx: AccessContext, level: AccessLevel, target?: AccessTarget): boolean {
  if (ctx.isOwner) return true;
  if (level === "L0") return true;
  if (level === "L1") return ctx.ndaAgreed;
  if (level === "L2") return ctx.ndaAgreed && !!target?.id && ctx.approved.has(grantKey(target.type, target.id));
  return false;
}
