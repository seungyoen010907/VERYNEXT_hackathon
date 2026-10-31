
## 프로젝트: PRD 메이커 (NEXT 개발 세션)

### 먼저 읽을 것
- `docs/PRD.md` (무엇을 만드나), `docs/DESIGN.md` (어떻게 보이나), `docs/API.md` (어떻게 동작하나)
- 문서에 없는 기능, 화면, 패키지는 만들지 않는다. 필요해 보이면 먼저 물어본다.
- 문서와 코드가 다르면 문서가 기준이다.

### 작업 방식
- 사용자가 지정한 Step 하나만 구현한다. 다음 Step을 미리 하지 않는다.
- 구현이 끝나면 반드시 알려준다: (1) 바뀐 파일 목록 (2) 브라우저/터미널에서 확인하는 방법 (3) 이 코드가 실행되는 순서 3줄.
- 사용자는 바이브 코딩을 배우는 중이다. 설명은 짧고 구체적으로 하고, 전문용어는 처음 나올 때 한 줄로 풀어준다.
- 에러를 고칠 때는 원인부터 설명하고 최소 수정으로 고친다. 관련 없는 파일을 리팩터링하지 않는다.

### 고정 스택 (바꾸지 않는다)
- Next.js App Router + TypeScript + Tailwind (create-next-app 기본값)
- 추가 패키지는 `openai`, `@supabase/supabase-js` 두 개뿐이다. 그 외 설치 금지.
- `next.config.ts`의 `cacheComponents: true`는 끄지 않는다. `params`, 쿠키, 캐시 안 한 데이터(Supabase 조회 등)를 기다리는 페이지는 `<Suspense>`로 감싼다.

### 보안 규칙
- OpenAI, Supabase 호출은 서버 코드(`app/api/**`, `lib/openai.ts`, `lib/supabase.ts`)에서만 한다.
- `lib/openai.ts`, `lib/supabase.ts` 맨 위에 `import "server-only";`
- 비밀 키 환경변수에 `NEXT_PUBLIC_`을 붙이지 않는다. `"use client"` 파일에서 비밀 키를 읽지 않는다.
- `.env.local`은 커밋하지 않는다.

### 코드 규칙
- 브라우저 코드는 `fetch("/api/...")`로만 데이터를 주고받는다.
- API 에러 응답은 항상 `{ error: string }` + 알맞은 status (400 입력 오류, 404 없음, 500 DB, 502 AI).
- OpenAI/Supabase 클라이언트는 모듈 최상단이 아니라 함수 안에서 만든다 (`getSupabase()`처럼). 환경변수가 없어도 빌드가 터지지 않게.
