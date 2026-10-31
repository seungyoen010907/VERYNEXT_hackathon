# VERYNEXT_hackathon

AI 점포 양도양수 실사 에이전트. 양도인이 제시한 매출·수익 정보를 POS·카드·배달앱·비용 자료와 교차 검증하고, 권리금 회수 기간과 위험 요소를 분석한다.

## 실행

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 스키마·타입 테스트 (Supabase 없이 로컬 Postgres(PGlite)로 실행)
npm run typecheck
npm run lint
```

Supabase·OpenAI 키는 `.env.example`을 `.env.local`로 복사해 채운다. 키가 없어도 위 명령은 모두 동작한다.

## 구조

```
supabase/migrations/   DB 스키마 (14개 테이블, RLS 정책)
supabase/tests/        스키마 제약조건·RLS 테스트
src/types/domain.ts    DB와 1:1로 대응하는 TypeScript 데이터 모델
src/app/               Next.js App Router (화면 + API Routes)
```

## 데이터 원칙

- 금액은 원 단위 정수로 저장한다.
- 확인되지 않은 값은 `NULL`이다. 0원으로 간주해 계산하지 않는다.
- AI 문서 분석 원본(`extracted_data`)은 수정할 수 없고, 정규화 결과는 별도로 저장한다.
- 분석은 실행할 때마다 새 이력(`analyses`)으로 남는다.
