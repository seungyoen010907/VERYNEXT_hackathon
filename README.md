# VERYNEXT_hackathon

AI 점포 양도양수 실사 플랫폼. 양도인이 제시한 매출·수익 정보를 POS·카드·배달앱·비용 자료와 교차 검증하고, 권리금 회수 기간과 위험 요소를 분석해 실사 보고서를 만든다.

## 실행

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 테스트 87개 (분석 엔진, 정규화, DB 스키마·RLS, 저장소 통합)
npm run typecheck
npm run lint
npm run build
```

Supabase·OpenAI 키 없이 동작한다. 로컬 모드는 PGlite(파일 기반 Postgres)에 `supabase/migrations`의 SQL을 그대로 적용하고 `.data/`에 저장한다.
처음 실행하면 데모 계정 2개(양도인·양수인)와 **테스트용 가상 매물 6개**를 만든다. 화면 오른쪽 위 사용자 메뉴에서 계정을 바꿀 수 있다.
테스트 매물만 다시 만들려면 `개발 현황` 화면의 초기화 버튼 또는 `POST /api/dev/reset-test-data`를 사용한다.

## 화면

대시보드 · 매물 관리 · 실사 관리 · 증빙 자료 · 매출 검증 · 수익성 분석 · 권리금 분석 · 위험도 분석 · 데이터 비교 · 실사 보고서.
매물 상세는 개요 / 증빙 자료 / 매출 검증 / 수익성 / 권리금 / 위험 분석 / 보고서 / 활동 기록 / AI 상담 탭으로 구성된다.

## 구조

```
supabase/migrations/   DB 스키마 (16개 테이블, RLS)
src/server/analysis/   분석 엔진 (순수 함수): 매출 교차 검증, 수익성, 권리금, 위험도
src/server/ingest/     AI 문서 분석 어댑터 + 추출 JSON 정규화 (docs/ai-integration.md)
src/server/repo/       DB 저장소 (매물, 문서, 분석, 체크리스트·요청, 보고서, 상담, 활동 기록)
src/server/seed/       테스트 시나리오 (가상 데이터)
src/app/api/           API 라우트 (응답 형식 { data, error })
src/app/, src/components/  화면
```

## 데이터 원칙

- 금액은 원 단위 정수. 확인되지 않은 값은 `NULL`이며 0원으로 계산하지 않는다.
- AI 문서 분석 원본(`extracted_data`)과 활동 기록은 수정할 수 없다. 정규화 결과는 별도로 저장한다.
- 분석은 실행할 때마다 새 이력으로 남고, 완료된 분석은 다시 계산하지 않는다.
- 위험은 규칙으로 탐지하고 근거를 함께 저장한다. 자료 부족만으로 허위라고 판단하지 않는다.

## 아직 연결하지 않은 것

- Supabase(DB·Auth·Storage): 같은 SQL과 저장소 인터페이스로 교체 예정. 현재 인증은 데모 계정.
- 외부 AI(OpenAI): AI 상담은 저장된 분석 결과로 답하는 규칙 기반 방식으로 동작한다.
- 팀원 문서 분석 모듈: `DOCUMENT_ANALYSIS_API_URL` 설정 또는 JSON 가져오기로 연결 (docs/ai-integration.md).
