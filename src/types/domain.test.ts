/**
 * TypeScript 열거형과 SQL enum이 같은 값을 갖는지 검사한다.
 * 프론트엔드·백엔드·DB의 데이터 구조를 하나로 유지하기 위한 테스트다.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as domain from "./domain";

const MIGRATIONS = join(__dirname, "..", "..", "supabase", "migrations");
const sql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");

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
  ["document_request_status", domain.DOCUMENT_REQUEST_STATUSES],
  ["activity_type", domain.ACTIVITY_TYPES],
  ["listing_status", domain.LISTING_STATUSES],
  ["deal_stage", domain.DEAL_STAGES],
  ["deal_message_kind", domain.DEAL_MESSAGE_KINDS],
  ["party_role", domain.PARTY_ROLES],
  ["deal_task_group", domain.DEAL_TASK_GROUPS],
  ["deal_task_status", domain.DEAL_TASK_STATUSES],
  ["deal_task_source", domain.DEAL_TASK_SOURCES],
  ["actor_kind", domain.ACTOR_KINDS],
  ["ai_run_trigger", domain.AI_RUN_TRIGGERS],
  ["finding_status", domain.FINDING_STATUSES],
  ["deal_event_type", domain.DEAL_EVENT_TYPES],
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
