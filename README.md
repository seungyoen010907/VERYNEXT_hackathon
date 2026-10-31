# VERYNEXT_hackathon

AI 점포 양도양수 플랫폼. 매물을 둘러보고 거래 문의를 시작하면 양도인·양수인 전용 거래 워크스페이스(메신저, 실사 체크리스트, 증빙자료, 거래 단계)가 만들어진다. 대화가 쌓이거나 증빙자료가 제출되면 AI 거래 분석이 대화와 자료를 대조해 위험, 추가 질문, 자료 요청을 제안하고, 실사 보고서까지 이어진다.

## 실행

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 테스트 (분석 엔진, 거래·AI 분석, 정규화, DB 스키마·RLS, 저장소 통합)
npm run typecheck
npm run lint
npm run build
```

Supabase·OpenAI 키 없이 동작한다. 로컬 모드는 PGlite(파일 기반 Postgres)에 `supabase/migrations`의 SQL을 그대로 적용하고 `.data/`에 저장한다.
처음 실행하면 데모 계정 2개(양도인·양수인)와 **테스트용 가상 매물 6개**를 만든다. 화면 오른쪽 위 사용자 메뉴에서 계정을 바꿀 수 있다.
테스트 매물만 다시 만들려면 `개발 현황` 화면의 초기화 버튼 또는 `POST /api/dev/reset-test-data`를 사용한다.

## 화면

- 상위 메뉴: 대시보드 · 매물 둘러보기(매물 검색, 내 매물, 매물 등록) · 거래 관리(거래 및 대화, 실사 현황, 자료 제출 현황, 실사 보고서, 매물 비교) · 내 계정
- 거래 워크스페이스 `/deals/[id]`: 개요 / 대화(메신저 + AI 분석 패널) / 실사 관리 / 증빙자료 / 분석 및 보고서
- 내 매물 관리 `/stores/[id]` (양도인): 개요 / 거래 문의 / 실사 분석 / 증빙자료 / 보고서

시연 순서: 양수인 계정 → 매물 둘러보기 → `[테스트] 매출 불일치 한식당` → 진행 중인 거래 대화 → 'AI 거래 분석 실행'.

## 구조

```
supabase/migrations/   DB 스키마 (28개 테이블, RLS)
src/server/analysis/   분석 엔진 (순수 함수): 매출 교차 검증, 수익성, 권리금, 위험도
src/server/ingest/     AI 문서 분석 어댑터 + 추출 JSON 정규화 (docs/ai-integration.md)
src/server/deals/      거래 워크스페이스: 메신저, 체크리스트, AI 거래 분석, 거래 보고서
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
- 외부 AI: AI 거래 분석과 상담은 규칙 기반 엔진으로 동작한다 (외부 API 호출 0건). 연결 방법과 무료 모델 검토는 docs/ai-integration.md.
- 실시간 메시지: 소켓 대신 5초 간격으로 새 메시지를 확인한다.
- 팀원 문서 분석 모듈: `DOCUMENT_ANALYSIS_API_URL` 설정 또는 JSON 가져오기로 연결 (docs/ai-integration.md).
