# API / 데이터 / 외부 의존성 설계

> "어떻게 동작하는가"를 정하는 문서. 구조를 바꾸고 싶으면 이 문서부터 고치고 AI에게 시킨다.

## 1. 전체 구조

```
[브라우저]                         [Next.js 서버]                        [외부 서비스]
app/page.tsx       --- fetch --->  app/api/specs/route.ts  ---------->  OpenAI (PRD 생성)
app/specs/page.tsx                   |  lib/openai.ts
                                     |  lib/supabase.ts    ---------->  Supabase (저장/조회)
```

규칙은 하나다. **브라우저 코드는 `/api/*`만 부른다. OpenAI와 Supabase는 서버 코드에서만 부른다.**

이유: 브라우저에서 돌아가는 코드는 누구나 개발자도구로 열어볼 수 있다. 거기에 OpenAI 키가 있으면 키가 털리고, 키가 털리면 크레딧이 털린다. 그래서 키를 들고 있는 "중간 서버"로 Next.js Route Handler(`app/api/.../route.ts`)를 하나 끼운다.

지난 세션과 비교: 지난번엔 React에서 Supabase를 publishable(anon) 키로 바로 불렀다. 그 키는 공개돼도 되는 키라서 가능했던 것이다. OpenAI 키는 공개되면 안 되는 키라서 이번엔 서버가 필요하다.

## 2. 폴더 구조 (완성 기준)

```
app/
  page.tsx                  메인: 입력 폼 + 결과 (client component)
  specs/page.tsx            목록 (client component)
  specs/[id]/page.tsx       상세 (P1, Suspense로 감싸기)
  api/specs/route.ts        POST, GET
  api/specs/[id]/route.ts   GET, DELETE (P1)
components/
  SpecView.tsx              PRD 결과 카드
lib/
  types.ts                  Spec 등 타입
  spec-schema.ts            AI 출력 JSON Schema
  openai.ts                 generateSpec()   서버 전용
  supabase.ts               getSupabase()    서버 전용
  markdown.ts               specToMarkdown() 브라우저/서버 공용
supabase/
  schema.sql                테이블 생성 SQL
```

## 3. 환경 변수 (`.env.local`)

| 이름 | 값 가져오는 곳 | 브라우저 노출 |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI 대시보드 API keys (본인 키) | 절대 안 됨 |
| `OPENAI_MODEL` | 기본 `gpt-6-luna` | 안 됨 |
| `SUPABASE_URL` | Supabase 프로젝트 화면 위쪽 Connect 버튼 | 안 씀 (서버 전용) |
| `SUPABASE_SECRET_KEY` | Settings > API Keys > Secret keys (`sb_secret_...`). 옛날 프로젝트라 레거시 키만 있으면 `service_role` 키 | 절대 안 됨 |

- 이름 앞에 `NEXT_PUBLIC_`을 붙이면 브라우저 번들에 그대로 들어간다. 오늘은 `NEXT_PUBLIC_`을 쓸 일이 없다.
- `npm run dev`가 켜진 상태에서 `.env.local`을 저장하면 보통 자동으로 다시 읽어요(터미널에 `Reload env: .env.local`이 떠요). 값이 안 바뀐 것 같으면 브라우저를 새로고침하고, 그래도 안 되면 `Ctrl+C` → `npm run dev`로 다시 켜요.
- `.env.local`은 `.gitignore`에 이미 들어 있다 (`.env*`). 커밋되면 안 된다.

## 4. 엔드포인트

모든 에러 응답은 같은 모양이다: `{ "error": "사람이 읽을 수 있는 메시지" }`. 프론트는 이 메시지를 그대로 보여준다.

### POST `/api/specs` (P0)

아이디어를 받아 PRD를 생성하고 저장한다.

요청 body:
```json
{
  "title": "해커톤 팀원 매칭",
  "problem": "해커톤 직전에 팀을 못 구해서 혼자 나가거나 포기한다",
  "target": "해커톤 처음 나가는 대학생",
  "timeframe": "해커톤 24시간"
}
```

처리 순서:
1. 검증: `title` 1~100자, `problem` 1~1000자 (아니면 400). `target`은 비어도 됨. `timeframe`이 "해커톤 24시간" / "1주" / "1달"이 아니면 "해커톤 24시간"으로.
2. `generateSpec()`으로 OpenAI 호출 (실패하면 502)
3. `specs` 테이블에 insert (실패하면 500)
4. 응답

응답 201:
```json
{ "id": "uuid", "created_at": "2026-10-10T...", "spec": { "...": "Spec 객체 (6번 참고)" } }
```

Step 2에서는 3번(저장)을 빼고 `{ "spec": ... }`만 돌려준다. Step 3에서 저장을 붙인다.

### GET `/api/specs` (P0)

응답 200:
```json
{ "items": [ { "id": "uuid", "created_at": "...", "title": "...", "product_name": "...", "timeframe": "...", "one_liner": "..." } ] }
```

- 최신순 50개.
- `one_liner`는 jsonb 안에 있다. `select("id, created_at, title, product_name, timeframe, one_liner:spec->>one_liner")`처럼 꺼낼 수 있다.

### GET `/api/specs/[id]` (P1)

응답 200 `{ "item": { ...specs row 전체 } }`, 없으면 404.

### DELETE `/api/specs/[id]` (P1)

응답 204 (본문 없음).

## 5. DB: `specs` 테이블

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid, PK, 기본값 `gen_random_uuid()` | |
| `created_at` | timestamptz, 기본값 `now()` | |
| `title` | text, not null | 사용자가 넣은 아이디어 이름 |
| `problem` | text, not null | 사용자가 넣은 문제 |
| `target` | text, null 허용 | 사용자가 넣은 타깃 |
| `timeframe` | text, not null | 개발 기간 |
| `product_name` | text, not null | AI가 지은 제품명 (목록 표시용) |
| `spec` | jsonb, not null | AI 출력 전체 |

왜 AI 출력을 jsonb 한 칸에 통째로 넣나: 내 버전에서 출력 섹션을 추가해도 테이블을 안 고쳐도 된다. 목록에 꼭 필요한 값(`product_name`)만 따로 컬럼으로 뺐다.

권한 (`supabase/schema.sql`에 다 들어 있음):
- RLS를 켜고 정책은 하나도 안 만든다. 그러면 publishable 키(브라우저용)로는 아무것도 못 읽는다.
- 서버는 secret 키로 접속한다. secret 키는 RLS를 우회한다. 그래서 secret 키는 절대 브라우저로 가면 안 된다.
- 2026년 5월 30일 이후 만든 Supabase 프로젝트는 새 테이블이 API에 자동 노출되지 않는다. `grant` 문이 없으면 `42501 permission denied for table specs` 에러가 난다.

## 6. AI 호출 설계

| 항목 | 정한 것 |
|---|---|
| SDK | `openai` 공식 Node SDK |
| API | Responses API (`client.responses.create`) |
| 모델 | `process.env.OPENAI_MODEL`, 없으면 `gpt-6-luna` |
| 프롬프트 | `instructions` = 역할 + 규칙, `input` = 사용자가 입력한 4개 값 |
| 출력 형식 | 구조화 출력: `text.format = { type: "json_schema", name: "prd", strict: true, schema }` |
| 결과 읽기 | `JSON.parse(response.output_text)` |

구조화 출력이 핵심이다. 그냥 "JSON으로 줘"라고 하면 가끔 형식이 깨지는데, JSON Schema를 주고 `strict: true`로 걸면 모델이 그 모양대로만 답한다. 그래서 화면 코드가 `spec.core_features.map(...)`을 안심하고 쓸 수 있다.

### 출력 스키마: `Spec`

| 필드 | 타입 | 내용 |
|---|---|---|
| `product_name` | string | 제품 이름 |
| `one_liner` | string | 한 줄 소개 |
| `problem` | string | 해결하는 문제 |
| `target_users` | `{ persona, pain }[]` | 타깃 2명 내외 |
| `core_features` | `{ name, description, priority: "P0" \| "P1" }[]` | 4~6개, P0는 최대 3개 |
| `user_flow` | string[] | 4~6단계 |
| `screens` | `{ name, purpose }[]` | 2~4개 |
| `data_model` | `{ table, columns: string[] }[]` | 1~3개, columns는 "이름 타입" |
| `api_endpoints` | `{ method: "GET" \| "POST" \| "PATCH" \| "DELETE", path, description }[]` | 2~5개 |
| `out_of_scope` | string[] | 일부러 안 만드는 것 |
| `risks` | string[] | 2~3개 |
| `first_prompt` | string | Claude Code/Codex에 바로 넣을 첫 프롬프트 |

`strict: true` 규칙 (어기면 OpenAI가 400 에러를 준다):
- 모든 object에 `additionalProperties: false`
- 모든 속성을 `required`에 넣는다. 선택 값이 필요하면 빈 문자열이나 빈 배열로 받는다.
- 개수 제한(4~6개 등)은 스키마가 아니라 `instructions` 문장으로 지시한다.

### 내 버전 섹션 추가하는 법 (PRD 8-3)

1. `lib/types.ts`의 `Spec`에 필드 추가
2. `lib/spec-schema.ts`에 같은 필드 추가 (`required`에도)
3. `lib/openai.ts`의 `instructions`에 그 필드 규칙 한 줄 추가
4. `components/SpecView.tsx`와 `lib/markdown.ts`에 표시 추가
5. DB는 안 건드린다 (jsonb라서)

## 7. 외부 의존성

| 패키지 | 왜 |
|---|---|
| `next`, `react`, `tailwindcss` | create-next-app 기본 |
| `openai` | OpenAI 공식 SDK |
| `@supabase/supabase-js` | Supabase 클라이언트 |

이 외에는 설치하지 않는다. AI가 `zod`, `axios`, `shadcn`, `prisma`, `@supabase/ssr` 같은 걸 깔자고 하면 거절한다. (`@supabase/ssr`은 로그인 쿠키 처리용인데 오늘은 로그인이 없다.) `server-only`는 Next.js가 내부에서 처리하므로 설치하지 않아도 된다.

## 8. Next.js 16 주의점

- Next 16.4부터 `create-next-app`이 `next.config.ts`에 `cacheComponents: true`를 켜 둔다. 이 상태에서 `params`, 쿠키, 캐시 안 한 데이터(Supabase 조회 등)를 기다리는 페이지는 `<Suspense>`로 감싸거나 그 폴더에 `loading.tsx`를 둬야 `npm run build`가 통과한다. 끄지 말고 감싼다.
- `AGENTS.md` 위쪽의 Next.js 블록은 `next dev`가 다시 써 넣는 영역이다. 지우지 말고, 우리 규칙은 그 아래에 둔다.
