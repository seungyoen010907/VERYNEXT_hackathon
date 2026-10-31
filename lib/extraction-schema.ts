// AI 1단계(자료 판독) 출력 JSON Schema. lib/types.ts의 Extraction과 같은 모양.
// strict 규칙: 모든 object에 additionalProperties: false, 모든 속성을 required에. 없을 수 있는 값은 null 허용.

const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };

export const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["documents"],
  properties: {
    documents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "file_name",
          "doc_type",
          "business_name",
          "business_number",
          "period_start",
          "period_end",
          "monthly",
          "stated_total",
          "monthly_costs",
          "lease",
          "operation",
          "facility_items",
          "readability",
          "warnings",
        ],
        properties: {
          file_name: { type: "string", description: "<file name> 태그의 이름 그대로" },
          doc_type: {
            type: "string",
            enum: [
              "card_sales",
              "pos",
              "delivery_app",
              "vat_return",
              "bank_statement",
              "cost_statement",
              "lease_contract",
              "operation",
              "facility",
              "other",
            ],
          },
          business_name: { ...nullableString, description: "상호" },
          business_number: { ...nullableString, description: "사업자등록번호 000-00-00000" },
          period_start: { ...nullableString, description: "YYYY-MM" },
          period_end: { ...nullableString, description: "YYYY-MM" },
          monthly: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["month", "gross_sales", "net_amount", "order_count"],
              properties: {
                month: { type: "string", description: "YYYY-MM" },
                gross_sales: { ...nullableNumber, description: "월 총매출(원)" },
                net_amount: { ...nullableNumber, description: "월 정산액·입금액(원)" },
                order_count: { ...nullableNumber, description: "월 건수" },
              },
            },
          },
          stated_total: { ...nullableNumber, description: "자료에 적힌 합계(원). AI가 계산한 값 금지" },
          monthly_costs: {
            type: "array",
            description: "월별 비용 (비용 자료일 때만, 아니면 빈 배열)",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["month", "category", "amount"],
              properties: {
                month: { type: "string", description: "YYYY-MM" },
                category: { type: "string", enum: ["ingredients", "labor", "utilities", "rent", "fees", "other"] },
                amount: { ...nullableNumber, description: "원" },
              },
            },
          },
          lease: {
            type: ["object", "null"],
            description: "임대차 조건 (임대차계약서일 때만, 아니면 null)",
            additionalProperties: false,
            required: ["deposit", "monthly_rent", "maintenance_fee", "start", "end"],
            properties: {
              deposit: nullableNumber,
              monthly_rent: nullableNumber,
              maintenance_fee: nullableNumber,
              start: { ...nullableString, description: "YYYY-MM" },
              end: { ...nullableString, description: "YYYY-MM" },
            },
          },
          operation: {
            type: ["object", "null"],
            description: "운영 현황 (점주 근무시간·직원 수가 적혀 있을 때만, 아니면 null)",
            additionalProperties: false,
            required: ["owner_weekly_hours", "staff_count"],
            properties: {
              owner_weekly_hours: { ...nullableNumber, description: "점주 주당 근무시간" },
              staff_count: { ...nullableNumber, description: "직원 수 (점주 제외)" },
            },
          },
          facility_items: { type: "array", items: { type: "string" }, description: "넘겨받는 시설·설비 이름 목록 (없으면 빈 배열)" },
          readability: { type: "string", enum: ["clear", "partial", "unreadable"] },
          warnings: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;
