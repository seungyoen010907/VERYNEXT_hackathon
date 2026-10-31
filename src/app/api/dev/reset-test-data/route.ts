import type { NextRequest } from "next/server";
import { forbidden } from "@/server/errors";
import { handle, ok } from "@/server/http";
import { resetTestData } from "@/server/seed/seed";

/** 로컬 개발용: 테스트 매물만 지우고 다시 만든다. 사용자가 등록한 매물은 유지한다. */
export async function POST(request: NextRequest) {
  return handle(request, async ({ db }) => {
    if (process.env.NODE_ENV === "production") throw forbidden("운영 환경에서는 사용할 수 없습니다.");
    await resetTestData(db);
    return ok({ reset: true });
  });
}
