/**
 * 로컬 테스트용 Postgres (PGlite)
 *
 * Supabase가 기본 제공하는 auth 스키마, auth.uid(), 역할(authenticated 등)을
 * 최소한으로 흉내 낸 뒤 실제 마이그레이션 파일을 적용한다.
 * Supabase 프로젝트 없이 스키마 제약조건과 RLS 정책을 검증하기 위한 용도다.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { SUPABASE_STUB_SQL } from "../../../src/server/db/supabase-stub";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");



export function readMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
}

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB_SQL);
  for (const sql of readMigrations()) {
    await db.exec(sql);
  }
  return db;
}

/** 관리자(postgres) 권한으로 auth 사용자를 만든다. 트리거가 public.users 행을 생성한다. */
export async function createAuthUser(
  db: PGlite,
  id: string,
  email: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
    id,
    email,
    JSON.stringify(meta),
  ]);
}

/**
 * 지정한 사용자로 로그인한 것처럼 콜백을 실행한다 (RLS 적용).
 * 콜백이 끝나면 역할과 사용자 설정을 원래대로 되돌린다.
 */
export async function asUser<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}
