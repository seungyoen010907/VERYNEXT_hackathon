/**
 * 마이그레이션 SQL을 읽어 테이블·컬럼·관계 목록을 만든다.
 * 개발 현황 페이지가 실제 스키마 파일과 어긋나지 않게 하기 위한 용도다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  comment: string | null;
}

export interface TableInfo {
  name: string;
  description: string;
  columns: ColumnInfo[];
  /** 이 테이블이 참조하는 테이블 */
  references: string[];
}

const TABLE_DESCRIPTIONS: Record<string, string> = {
  users: "사용자 프로필 (양도인·양수인)",
  stores: "매물(점포) 기본 정보와 양도인 주장 수치",
  documents: "업로드한 증빙 자료 메타데이터",
  extracted_data: "AI 문서 분석 결과 원본 (수정 불가)",
  normalized_data: "원본을 공통 형식으로 정규화한 결과",
  monthly_revenues: "출처별 월 매출 (POS·카드·현금·배달)",
  monthly_expenses: "항목별 월 비용",
  analyses: "분석 실행 이력",
  revenue_verifications: "매출 교차 검증 결과",
  profit_analyses: "월별·평균 수익성 분석",
  premium_analyses: "권리금 및 투자금 회수 분석",
  risk_assessments: "규칙 기반 위험 탐지 결과",
  reports: "종합 실사 보고서",
  chat_messages: "AI 상담 대화",
};

export function readSchemaOverview(): TableInfo[] {
  const sql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "0001_initial_schema.sql"),
    "utf8",
  );
  const tables: TableInfo[] = [];

  for (const match of sql.matchAll(/create table public\.(\w+) \(\n([\s\S]*?)\n\);/g)) {
    const [, name, body] = match;
    const columns: ColumnInfo[] = [];
    const references = new Set<string>();

    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      for (const ref of line.matchAll(/references public\.(\w+)/g)) {
        if (ref[1] !== name) references.add(ref[1]);
      }
      if (/references auth\.users/.test(line)) references.add("auth.users");

      const col = line.match(/^([a-z_]+)\s+([a-z_.]+(?:\(\d+, \d+\))?(?:\[\])?)/);
      if (!col || ["unique", "check", "foreign", "primary"].includes(col[1])) continue;
      const comment = line.match(/--\s*(.+)$/);
      columns.push({
        name: col[1],
        type: col[2].replace(/^public\./, ""),
        nullable: !/not null|primary key/.test(line),
        comment: comment ? comment[1] : null,
      });
    }

    tables.push({
      name,
      description: TABLE_DESCRIPTIONS[name] ?? "",
      columns,
      references: [...references],
    });
  }
  return tables;
}
