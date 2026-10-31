/**
 * API 공통 처리: 응답 형식 { data, error }, 입력 검증, 예외 → HTTP 상태 코드, 요청 로그
 */
import { cookies } from "next/headers";
import { connection } from "next/server";
import { z, ZodError } from "zod";
import type { ApiResponse } from "@/types/domain";
import { getDb, type Db } from "./db/client";
import { AppError, badRequest } from "./errors";
import { DEMO_USER_COOKIE, demoViewer, type Viewer } from "./viewer";

export function ok<T>(data: T, status = 200): Response {
  return Response.json({ data, error: null } satisfies ApiResponse<T>, { status });
}

export function fail(status: number, code: string, message: string, details?: unknown): Response {
  return Response.json({ data: null, error: { code, message, details } } satisfies ApiResponse<never>, { status });
}

export async function currentViewer(): Promise<Viewer> {
  const store = await cookies();
  return demoViewer(store.get(DEMO_USER_COOKIE)?.value);
}

/**
 * 페이지(서버 컴포넌트)용: 실제 사용자 요청이 들어온 뒤에 DB를 조회한다.
 * Cache Components는 쿠키를 읽는 화면도 세션별로 미리 렌더링하는데, DB(PGlite)는 조회 중에
 * 현재 시각을 읽으므로 미리 렌더링할 수 없다. connection()으로 요청 시점까지 렌더링을 미룬다.
 */
export async function requestContext(): Promise<{ db: Db; viewer: Viewer }> {
  await connection();
  const viewer = await currentViewer();
  const db = await getDb();
  return { db, viewer };
}

export interface HandlerContext {
  db: Db;
  viewer: Viewer;
}

/** 라우트 핸들러를 감싸 예외 처리와 로그를 공통으로 적용한다. */
export async function handle(
  request: Request,
  fn: (ctx: HandlerContext) => Promise<Response>,
): Promise<Response> {
  const started = Date.now();
  const path = new URL(request.url).pathname;
  let res: Response;
  try {
    // 라우트 핸들러는 항상 요청 시점에 실행되므로 connection()이 필요 없다
    const viewer = await currentViewer();
    const db = await getDb();
    res = await fn({ db, viewer });
  } catch (err) {
    if (err instanceof AppError) {
      res = fail(err.status, err.code, err.message, err.details);
    } else if (err instanceof ZodError) {
      res = fail(400, "VALIDATION_ERROR", "입력값이 올바르지 않습니다.", z.flattenError(err));
    } else {
      console.error(JSON.stringify({ level: "error", method: request.method, path, error: String(err), stack: (err as Error)?.stack }));
      res = fail(500, "INTERNAL_ERROR", "서버 오류가 발생했습니다.");
    }
  }
  console.info(JSON.stringify({ level: "info", method: request.method, path, status: res.status, ms: Date.now() - started }));
  return res;
}

export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest("요청 본문이 올바른 JSON이 아닙니다.");
  }
  return schema.parse(body);
}
