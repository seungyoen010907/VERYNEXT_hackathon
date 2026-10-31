// POST: 샘플 데이터로 시연하기 — 가상 점포 3곳(양도인 A·B·C)과 양수인 조건을 새로 만든다.
// 예전 샘플 매물만 지우고 다시 만든다. 사용자가 만든 매물은 건드리지 않는다.

import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { seedDemo } from "@/lib/demo";
import { handleError } from "@/lib/http";

export const maxDuration = 300; // 처음 한 번은 샘플 파일 AI 분석이 들어간다

export async function POST(request: Request) {
  try {
    await getUser(request);
    const result = await seedDemo();
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
