// AI 에이전트 4종 (PRD 4.3). 서버·브라우저 공용. 화면에 보여주는 활동은 DB에 기록된 실제 일만이다.

export type AgentKey = "buyer" | "seller" | "document" | "diligence";

export const AGENTS: Record<AgentKey, { no: string; name: string; en: string; does: string }> = {
  buyer: { no: "①", name: "양수인 AI", en: "Buyer Agent", does: "내 조건에 맞는 매물을 추천하고, 빠진 정보를 양도인 AI들에게 한 번에 물어봐요" },
  seller: { no: "②", name: "양도인 AI", en: "Seller Agent", does: "매물마다 하나씩 있어요. 공개한 자료로만 답하고, 그 밖은 양도인에게 승인을 구해요" },
  document: { no: "③", name: "자료 분석 AI", en: "Document Agent", does: "올린 자료에서 숫자를 뽑고, 자료끼리 맞는지 확인해요" },
  diligence: { no: "④", name: "실사·비교 AI", en: "Due Diligence Agent", does: "모은 답과 자료로 수익·위험을 비교하고 리포트를 만들어요" },
};

export type AgentActivity = { key: AgentKey; stat: string; detail: string; last_at: string | null; active: boolean };
