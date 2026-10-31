/**
 * 데이터베이스 접근 계층
 *
 * 로컬 모드: PGlite(WASM Postgres)에 supabase/migrations 의 SQL을 그대로 적용해 사용한다.
 *   데이터는 .data/pglite 에 저장되어 서버를 재시작해도 유지된다.
 * Supabase 모드: 추후 DATABASE_URL(Supabase Postgres 연결 문자열)로 같은 Db 인터페이스를 구현한다.
 *   SQL과 스키마가 같으므로 저장소(repository) 코드는 바꾸지 않는다.
 *
 * 서버는 관리자 권한으로 접속하므로 RLS를 우회한다. 접근 권한은 src/server/auth.ts 와
 * 각 저장소 함수에서 검사한다. RLS는 Supabase 클라이언트로 직접 접근할 때의 2차 방어선이다.
 */
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite, types } from "@electric-sql/pglite";
import { localDataDir } from "../storage";
import { SUPABASE_STUB_SQL } from "./supabase-stub";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** 콜백 안의 쿼리를 하나의 트랜잭션으로 실행한다. 예외가 나면 롤백한다. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

/** 금액·비율은 숫자로, 날짜는 시간대 변환 없이 문자열로 받는다. */
const PARSERS = {
  [types.INT8]: (v: string) => Number(v),
  [types.NUMERIC]: (v: string) => Number(v),
  [types.DATE]: (v: string) => v,
  [types.TIMESTAMPTZ]: (v: string) => new Date(v).toISOString(),
};

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

class PGliteDb implements Db {
  constructor(private readonly pg: Pick<PGlite, "query">) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.pg.query<T>(sql, params);
    return res.rows;
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    if (!(this.pg instanceof PGlite)) {
      // 이미 트랜잭션 안이면 그대로 이어서 실행한다
      return fn(this);
    }
    return this.pg.transaction((tx) => fn(new PGliteDb(tx)));
  }
}

async function applyMigrations(pg: PGlite): Promise<void> {
  const hasAuth = await pg.query<{ exists: boolean }>(
    `select exists (select 1 from pg_namespace where nspname = 'auth') as exists`,
  );
  if (!hasAuth.rows[0].exists) {
    await pg.exec(SUPABASE_STUB_SQL);
  }
  await pg.exec(`create table if not exists public._local_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set(
    (await pg.query<{ name: string }>(`select name from public._local_migrations`)).rows.map(
      (r) => r.name,
    ),
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    await pg.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query(`insert into public._local_migrations (name) values ($1)`, [file]);
    });
  }
}

export interface CreateLocalDbOptions {
  /** 저장 경로. 생략하면 메모리에만 저장한다 (테스트용). */
  dataDir?: string;
}

export async function createLocalDb(options: CreateLocalDbOptions = {}): Promise<Db> {
  if (options.dataDir) mkdirSync(options.dataDir, { recursive: true });
  const pg = new PGlite({ dataDir: options.dataDir, parsers: PARSERS });
  await pg.waitReady;
  await applyMigrations(pg);
  return new PGliteDb(pg);
}

// 개발 서버의 HMR로 모듈이 다시 로드되어도 DB 연결은 하나만 유지한다.
const globalForDb = globalThis as unknown as { __diligenceDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!globalForDb.__diligenceDb) {
    globalForDb.__diligenceDb = (async () => {
      const db = await createLocalDb({ dataDir: join(localDataDir(), "pglite") });
      const { seedIfEmpty } = await import("../seed/seed");
      await seedIfEmpty(db);
      // 0003 이전에 만든 로컬 DB에는 시연용 거래가 없으므로 한 번 채운다
      const { seedDealsIfEmpty } = await import("../seed/deals");
      await seedDealsIfEmpty(db);
      return db;
    })().catch((err) => {
      globalForDb.__diligenceDb = undefined;
      throw err;
    });
  }
  return globalForDb.__diligenceDb;
}

/** Postgres 배열 리터럴. enum 배열 컬럼에 JS 배열을 넘길 때 사용한다. */
export function pgArray(values: readonly string[]): string {
  return `{${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}
