import "server-only";

// API 에러 응답을 한 모양으로: { error: string } + status (docs/API.md 4번)

import { NextResponse } from "next/server";
import { AuthError } from "./auth";
import { AiError } from "./openai";
import { PrepareError } from "./prepare";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

// route handler 안에서 던진 에러를 알맞은 status로 바꾼다
export function handleError(e: unknown) {
  if (e instanceof HttpError) return jsonError(e.message, e.status);
  if (e instanceof AuthError) return jsonError(e.message, 401);
  if (e instanceof PrepareError) return jsonError(e.message, 400);
  if (e instanceof AiError) return jsonError(e.message, 502);
  console.error(e);
  return jsonError("저장소에서 문제가 생겼어요. 잠시 후 다시 시도해주세요.", 500);
}
