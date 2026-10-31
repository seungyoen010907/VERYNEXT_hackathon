/**
 * 시연용: 테스트 매물에서 "아직 제출되지 않은" 자료의 샘플 분석 결과.
 * 예를 들어 [테스트] 증빙 부족 분식점에 POS 자료 파일을 업로드하면
 * 샘플 분석 모듈이 아래 JSON을 돌려준다. 모두 가상 데이터다.
 */
import type { ScenarioDocument } from "./scenarios";
import { TEST_MONTHS } from "./scenarios";

const BUNSIK_POS = [21_000_000, 22_500_000, 21_800_000, 22_200_000, 21_600_000, 22_100_000];

export const PENDING_UPLOADS: Record<string, ScenarioDocument[]> = {
  insufficient_evidence: [
    {
      documentType: "pos_sales",
      fileName: "POS_월별매출.pdf",
      extraction: {
        schema_version: "1.0",
        provider: "sample-fixture",
        document_type: "pos_sales",
        revenues: TEST_MONTHS.map((m, i) => ({
          source: "pos",
          year_month: m,
          amount: BUNSIK_POS[i],
          aggregation_basis: "gross_sales",
          vat_included: true,
          includes_card: true,
          includes_delivery: true,
        })),
      },
    },
    {
      documentType: "expense",
      fileName: "비용지출_내역.pdf",
      extraction: {
        schema_version: "1.0",
        provider: "sample-fixture",
        document_type: "expense",
        expenses: TEST_MONTHS.flatMap((m, i) => [
          { category: "material", year_month: m, amount: Math.round(BUNSIK_POS[i] * 0.35) },
          { category: "labor", year_month: m, amount: 4_200_000 },
          { category: "maintenance", year_month: m, amount: 200_000 },
          { category: "utilities", year_month: m, amount: 650_000 },
          { category: "other", year_month: m, amount: 400_000 },
        ]),
        review_flags: [{ code: "PARTIAL", message: "광고비 항목은 문서에서 찾지 못함" }],
      },
    },
  ],
};
