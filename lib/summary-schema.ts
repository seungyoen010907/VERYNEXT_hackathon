// AI 3단계(리포트 요약) 출력 JSON Schema. lib/types.ts의 Summary와 같은 모양.
// 개수 제한(2~5개 등)은 스키마가 아니라 lib/openai.ts의 instructions 문장으로 지시한다.

const stringList = { type: "array", items: { type: "string" } };

export const summarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "findings", "negotiation_points", "next_requests"],
  properties: {
    headline: { type: "string", description: "한 줄 결론" },
    findings: { ...stringList, description: "확인 필요 항목을 쉬운 말로, 2~5개" },
    negotiation_points: { ...stringList, description: "검증된 숫자를 근거로 한 협상 포인트, 2~4개" },
    next_requests: { ...stringList, description: "양도인에게 추가로 요청할 자료나 질문, 0~3개" },
  },
} as const;
