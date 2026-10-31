import { describe, expect, it } from "vitest";
import { ExtractionFormatError, normalizeExtraction, parseWon, parseYearMonth } from "./normalize";

describe("값 해석", () => {
  it.each([
    [30000000, 30000000],
    ["30,000,000", 30000000],
    ["30,000,000원", 30000000],
    ["삼천만", null],
    [null, null],
  ])("parseWon(%j) = %j", (input, expected) => {
    expect(parseWon(input)).toBe(expected);
  });

  it.each([
    ["2026-04", "2026-04-01"],
    ["2026-04-15", "2026-04-01"],
    ["2026.4", "2026-04-01"],
    ["202604", "2026-04-01"],
    ["2026년 4월", "2026-04-01"],
    ["2026-13", null],
    ["4월", null],
  ])("parseYearMonth(%j) = %j", (input, expected) => {
    expect(parseYearMonth(input)).toBe(expected);
  });
});

describe("normalizeExtraction", () => {
  it("해석할 수 없는 항목은 버리고 경고를 남긴다 (추측해서 채우지 않음)", () => {
    const res = normalizeExtraction({
      document_type: "pos_sales",
      revenues: [
        { source: "pos", year_month: "2026-04", amount: "30,000,000", includes_card: true },
        { source: "pos", year_month: "언젠가", amount: 1 },
        { source: "unknown_source", year_month: "2026-04", amount: 1 },
      ],
      review_flags: [{ code: "BLUR", message: "3페이지 흐림" }],
    });
    expect(res.payload.revenues).toHaveLength(1);
    expect(res.payload.revenues[0]).toMatchObject({
      amount: 30000000,
      aggregationBasis: "unknown",
      includesCard: true,
      includesDelivery: null,
      vatIncluded: null,
    });
    expect(res.warnings).toHaveLength(3);
    expect(res.warnings[2]).toBe("[문서 리뷰] 3페이지 흐림");
  });

  it("문서 종류가 없으면 업로드 시 선택한 종류를 사용한다", () => {
    expect(normalizeExtraction({ revenues: [] }, "card_sales").payload.documentType).toBe("card_sales");
  });

  it("지원하지 않는 스키마 버전과 잘못된 형식을 거부한다", () => {
    expect(() => normalizeExtraction({ schema_version: "2.0", document_type: "pos_sales" })).toThrow(ExtractionFormatError);
    expect(() => normalizeExtraction([1, 2])).toThrow(ExtractionFormatError);
    expect(() => normalizeExtraction({})).toThrow(/document_type/);
  });

  it("계약서 정보를 노트로 변환한다", () => {
    const res = normalizeExtraction({
      document_type: "lease_contract",
      contract: { monthly_rent: "2,000,000", contract_end_date: "2027.3.31", special_terms: "원상복구 의무" },
    });
    expect(res.payload.notes).toEqual([
      { key: "monthly_rent", value: "2000000" },
      { key: "contract_end_date", value: "2027-03-31" },
      { key: "special_terms", value: "원상복구 의무" },
    ]);
  });
});
