// 비용 이름 → 변동비 / 고정비 / 확인 필요 자동 분류 (docs/API.md 11.3). 서버·브라우저 공용 (AI 아님).
// 확인 필요는 손익분기점 계산에서 고정비로 가정한다 (보수적).

import type { CostCategory, CostGroup, CostInput, CostKind } from "./types";

const VARIABLE = ["재료", "식자재", "원재료", "포장", "배달대행", "배달 대행", "수수료"];
const FIXED = ["인건비", "급여", "월급", "월세", "임차", "관리비", "기장", "세무", "보안", "인터넷", "통신", "보험", "정수기", "렌탈", "리스", "해충", "방역"];
// 쓰는 만큼 늘지만 기본료가 있는 것, 정액·정률이 섞인 것
const UNCERTAIN = ["공과금", "전기", "가스", "수도", "광고"];

export function classifyCost(name: string): CostKind {
  const n = name.replace(/\s+/g, "");
  if (UNCERTAIN.some((w) => n.includes(w.replace(/\s+/g, "")))) return "unknown";
  if (VARIABLE.some((w) => n.includes(w.replace(/\s+/g, "")))) return "variable";
  if (FIXED.some((w) => n.includes(w.replace(/\s+/g, "")))) return "fixed";
  return "unknown";
}

export const COST_KIND_LABEL: Record<CostKind, string> = { variable: "변동비", fixed: "고정비", unknown: "확인 필요" };
export const COST_GROUP_LABEL: Record<CostGroup, string> = { ingredients: "재료비", labor: "인건비", utilities: "공과금", other: "기타경비" };

// 양도인 입력 폼의 기본 줄 (금액 0이면 저장하지 않는다)
export const DEFAULT_COST_LINES: { name: string; group: CostGroup }[] = [
  { name: "재료비", group: "ingredients" },
  { name: "인건비", group: "labor" },
  { name: "공과금 (전기·가스·수도)", group: "utilities" },
  { name: "배달 광고비", group: "other" },
  { name: "배달대행비", group: "other" },
  { name: "카드·배달앱 수수료", group: "other" },
  { name: "회계기장료", group: "other" },
  { name: "보안시스템", group: "other" },
  { name: "인터넷", group: "other" },
  { name: "화재보험", group: "other" },
  { name: "정수기", group: "other" },
  { name: "해충방제", group: "other" },
];

// 파일에서 읽은 비용 항목(입력이 없을 때)의 분류
export const DOC_COST_KIND: Record<CostCategory, CostKind> = {
  ingredients: "variable",
  fees: "variable",
  labor: "fixed",
  rent: "fixed",
  utilities: "unknown",
  other: "unknown",
};

// kind_source가 auto면 이름으로 다시 분류한다 (양도인이 바꾼 것은 그대로)
export function normalizeCost(c: CostInput): CostInput {
  return c.kind_source === "user" ? c : { ...c, kind: classifyCost(c.name) };
}
