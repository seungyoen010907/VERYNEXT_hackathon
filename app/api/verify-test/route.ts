// Step 2 임시 API: 파일을 받아 바로 검증 리포트를 돌려준다 (저장 없음).
// Step 3에서 POST /api/deals/[id]/verify로 옮기고 이 파일은 지운다.

import { NextResponse } from "next/server";
import { AiError, extractDocuments, summarizeReport } from "@/lib/openai";
import { PrepareError, prepareFile } from "@/lib/prepare";
import type { Report, Summary } from "@/lib/types";
import { verify } from "@/lib/verify";

export const maxDuration = 120; // AI 호출이 30초~1분 걸린다 (Vercel 배포용)

const MAX_FILES = 10;
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// Step 1 가짜 거래방과 같은 거래 조건 (Step 3부터는 DB의 deal을 쓴다)
const TEST_DEAL = {
  premium: 60_000_000,
  deposit: 30_000_000,
  monthly_rent: 2_500_000,
  claimed_monthly_sales: 35_000_000,
  claimed_monthly_profit: 8_000_000,
};

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  // 1. 입력 확인
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("파일을 multipart/form-data로 보내주세요.", 400);
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return error("검증할 파일을 1개 이상 올려주세요.", 400);
  if (files.length > MAX_FILES) return error(`파일은 ${MAX_FILES}개까지 올릴 수 있어요.`, 400);
  const tooBig = files.find((f) => f.size > MAX_SIZE);
  if (tooBig) return error(`${tooBig.name}: 파일은 10MB까지 올릴 수 있어요.`, 400);

  // 2. 파일 변환 (형식이 이상하면 400)
  const content = [];
  try {
    for (const file of files) {
      content.push(...prepareFile(file.name, new Uint8Array(await file.arrayBuffer())));
    }
  } catch (e) {
    if (e instanceof PrepareError) return error(e.message, 400);
    throw e;
  }

  // 3. AI가 숫자 읽기 (실패하면 502)
  let extraction;
  try {
    extraction = await extractDocuments(content);
  } catch (e) {
    if (e instanceof AiError) return error(e.message, 502);
    throw e;
  }

  // 4. 코드로 교차 검증·등급 계산
  const result = verify(extraction, TEST_DEAL.claimed_monthly_sales);

  // 5. AI 요약 (실패해도 요약 없이 계속)
  let summary: Summary | null = null;
  try {
    summary = await summarizeReport({ deal: TEST_DEAL, result });
  } catch {
    summary = null;
  }

  const report: Report = { extraction, ...result, summary };
  return NextResponse.json({ report });
}
