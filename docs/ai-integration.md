# AI 문서 분석 모듈 연동 규격 (추출 스키마 v1)

문서 분석(엑셀/PDF/이미지 읽기, 매출·비용 추출, 이상 항목 리뷰) 담당 모듈과 이 플랫폼 사이의 약속입니다.
이 플랫폼은 받은 JSON을 **수정하지 않고 원본 그대로 저장**(`extracted_data`)한 뒤, 별도로 정규화해서(`normalized_data`) 분석에 사용합니다.

## 연결 방법 (둘 중 하나)

### 1. 분석 결과를 플랫폼에 보내기 (권장, 지금 바로 가능)

```
POST /api/analysis/import
Content-Type: application/json

{ "storeId": "<매물 ID>", "documentId": "<문서 ID 또는 null>", "payload": { ...추출 JSON... } }
```

화면에서는 매물 상세 → 증빙 자료 → "AI 분석 결과 가져오기"에 JSON을 붙여 넣으면 됩니다.

### 2. 플랫폼이 분석 모듈을 호출하기

`.env.local`에 아래 값을 넣으면, 파일을 업로드할 때 플랫폼이 분석 모듈을 바로 호출합니다.

```
DOCUMENT_ANALYSIS_API_URL=https://...
DOCUMENT_ANALYSIS_API_KEY=...   # 선택. Authorization: Bearer 로 전송
```

요청은 `multipart/form-data`(`file`, `document_type`)이고, 응답 본문은 아래 추출 JSON이어야 합니다.
설정하지 않으면 `[테스트]` 매물에서만 미리 준비한 샘플 결과를 사용합니다.

## 추출 JSON 형식

```json
{
  "schema_version": "1.0",
  "provider": "team-doc-ai",
  "provider_version": "0.3.1",
  "document_type": "pos_sales",
  "period": { "start": "2026-04", "end": "2026-09" },
  "revenues": [
    {
      "source": "pos",
      "platform": null,
      "year_month": "2026-04",
      "amount": 30000000,
      "aggregation_basis": "gross_sales",
      "vat_included": true,
      "includes_card": true,
      "includes_delivery": true,
      "order_count": 2100
    }
  ],
  "expenses": [{ "category": "material", "year_month": "2026-04", "amount": 9000000, "note": "거래처 A" }],
  "contract": {
    "deposit": 30000000,
    "monthly_rent": 2000000,
    "contract_start_date": "2024-03-01",
    "contract_end_date": "2028-02-29",
    "special_terms": ["계약 종료 시 원상복구"]
  },
  "review_flags": [{ "code": "BLUR", "message": "3페이지 일부 흐림" }]
}
```

| 필드 | 값 |
|------|-----|
| `document_type` | `pos_sales`, `card_sales`, `delivery_sales`, `expense`, `lease_contract`, `other` |
| `revenues[].source` | `pos`, `card`, `cash`, `delivery_order`(배달 주문액), `delivery_settlement`(배달 정산액) |
| `revenues[].aggregation_basis` | `gross_sales`, `net_sales`, `order_amount`, `settlement_amount`, `unknown` |
| `revenues[].includes_card` / `includes_delivery` | POS 금액에 카드·배달 매출이 포함됐는지. **모르면 생략**하세요 (`null`로 처리) |
| `expenses[].category` | `material`, `labor`, `rent`, `maintenance`, `utilities`, `delivery_fee`, `advertising`, `other` |
| `expenses[].verified` | 증빙으로 확인한 값이 아니면 `false` (생략 시 `true`) |
| `review_flags` | 문서 이상 항목. 화면에 "검토 필요"로 표시됩니다 |

### 값 규칙

- 금액은 원 단위입니다. `30000000`, `"30,000,000"`, `"30,000,000원"`을 받습니다.
- 월은 `"2026-04"`, `"2026.04"`, `"202604"`, `"2026년 4월"`을 받습니다.
- **확인하지 못한 값은 넣지 마세요.** 추측한 값이나 0으로 채운 값은 분석을 왜곡합니다. 빠진 항목은 플랫폼이 "미확인"으로 처리합니다.
- 해석할 수 없는 항목은 버리고 경고로 남깁니다. `schema_version`이 `1.x`가 아니면 거부합니다 (원본은 저장).

### 왜 집계 기준이 중요한가

카드 매출과 배달 주문액은 POS 매출에 이미 포함된 경우가 많습니다. 플랫폼은 `includes_card` / `includes_delivery`로 중복 합산 여부를 판단하고, 기준을 모르면 단순 비교하지 않고 "검증 불가"로 표시합니다.

---

# AI 거래 분석 (거래 메신저)

`src/server/deals/agent.ts`, `src/server/deals/analyze.ts`

## 실행 조건

| 조건 | 기준 |
|------|------|
| A. 대화 누적 | 마지막 분석 이후 새 메시지 10건 이상 (`MESSAGE_THRESHOLD`) |
| B. 증빙 제출 | 마지막 분석 이후 **문서 분석이 끝난** 새 증빙자료 1건 이상 (업로드만 된 문서는 기다림) |

- 기본값은 사용자가 '분석 실행'을 누르는 방식이고, 거래별로 자동 실행을 켤 수 있습니다.
- 입력 해시(메시지 마지막 순번 + 분석된 문서 목록 + 매물 수정 시각)가 같으면 다시 분석하지 않습니다 (`deal_ai_runs` 유일 제약).
- 이전 분석의 상태(주장·합의·확인 필요 발언·요청 이력)를 이어받고, **새 메시지만** 읽습니다.
- 위험 항목은 키로 추적합니다. 다음 분석에서 다시 나오지 않으면 '해결됨'으로 바뀝니다.

## 분석기

현재는 외부 AI 없이 동작하는 규칙 기반 분석기(`local-rules`)입니다. 외부 API 호출 0건, 비용 없음.
대조 계산은 기존 실사 엔진(매출 교차 검증·수익성·권리금·위험도)을 그대로 씁니다.

### 외부 LLM을 붙일 때

`analyzeDeal(input)`과 같은 입력(이전 상태 요약 + 새 메시지 + 실사 엔진 결과)을 LLM에 보내고, 같은 출력 형식(`AgentResult`)을 받도록 구현하면 화면·저장 로직은 그대로 쓸 수 있습니다.
무료 등급 후보로 Google Gemini API가 있으나, 무료 등급에서는 요청·응답이 Google 제품 개선에 쓰일 수 있다고 안내되어 있습니다 ([Gemini API 결제 안내](https://ai.google.dev/gemini-api/docs/billing)). 거래 대화에는 매출·임대 조건 같은 민감 정보가 있으므로, 연결 전에 팀에서 동의 여부를 정해야 합니다. 계산(금액 비교·위험 판정)은 LLM에 맡기지 말고 지금처럼 엔진 결과를 설명하는 용도로만 쓰는 것을 권장합니다.
