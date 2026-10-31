/**
 * TypeScript 열거형과 SQL enum이 같은 값을 갖는지 검사한다.
 * 프론트엔드·백엔드·DB의 데이터 구조를 하나로 유지하기 위한 테스트다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as domain from "./domain";

const sql = readFileSync(
  join(__dirname, "..", "..", "supabase", "migrations", "0001_initial_schema.sql"),
  "utf8",
);

function sqlEnum(name: string): string[] {
  const match = sql.match(new RegExp(`create type public\\.${name} as enum \\(([^;]*?)\\);`));
  if (!match) throw new Error(`SQL enum ${name} 을(를) 찾을 수 없습니다`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const PAIRS: Array<[string, readonly string[]]> = [
  ["user_role", domain.USER_ROLES],
  ["store_status", domain.STORE_STATUSES],
  ["document_type", domain.DOCUMENT_TYPES],
  ["document_status", domain.DOCUMENT_STATUSES],
  ["analysis_status", domain.ANALYSIS_STATUSES],
  ["risk_level", domain.RISK_LEVELS],
  ["risk_category", domain.RISK_CATEGORIES],
  ["verification_status", domain.VERIFICATION_STATUSES],
  ["revenue_check_type", domain.REVENUE_CHECK_TYPES],
  ["revenue_source", domain.REVENUE_SOURCES],
  ["aggregation_basis", domain.AGGREGATION_BASES],
  ["expense_category", domain.EXPENSE_CATEGORIES],
  ["verification_level", domain.VERIFICATION_LEVELS],
  ["profit_period_type", domain.PROFIT_PERIOD_TYPES],
  ["payback_status", domain.PAYBACK_STATUSES],
  ["chat_role", domain.CHAT_ROLES],
];

describe("SQL enum ↔ TypeScript 상수 일치", () => {
  it.each(PAIRS)("%s", (name, values) => {
    expect([...values]).toEqual(sqlEnum(name));
  });

  it("SQL의 모든 enum을 TypeScript에서 정의한다", () => {
    const sqlEnums = [...sql.matchAll(/create type public\.(\w+) as enum/g)].map((m) => m[1]);
    expect(PAIRS.map(([n]) => n).sort()).toEqual(sqlEnums.sort());
  });

  it("documents.mime_type 허용 목록이 ALLOWED_MIME_TYPES와 같다", () => {
    const block = sql.match(/mime_type\s+text not null check \(mime_type in \(([^)]*)\)\)/);
    expect(block).not.toBeNull();
    const values = [...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(values).toEqual([...domain.ALLOWED_MIME_TYPES]);
  });
});
