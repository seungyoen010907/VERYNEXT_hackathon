import "server-only";

// 공개 등급 권한 검사 (docs/API.md 10.3). 목록·상세·다운로드·AI 답변 모두 이 함수를 거친다.
// Step 2: 양도인 본인은 전부, 다른 사람은 L0만. L1(NDA)·L2(승인)는 Step 3에서 연결한다.

import type { CurrentUser } from "./auth";
import type { AccessLevel, Listing } from "./types";

export type AccessContext = {
  isOwner: boolean;
};

export function accessContext(user: CurrentUser, listing: Pick<Listing, "seller_id">): AccessContext {
  return { isOwner: listing.seller_id === user.id };
}

export function canSee(ctx: AccessContext, level: AccessLevel): boolean {
  if (ctx.isOwner) return true;
  return level === "L0";
}
