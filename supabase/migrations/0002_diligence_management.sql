-- =============================================================================
-- 실사 진행 관리 기능 추가
--  - 자료 통합 관리: 중복 업로드 판별(content_hash), 재업로드 이력(replaces_document_id)
--  - 추가 자료 요청 기록: document_requests
--  - 실사 활동 기록: activities
-- 0001의 기존 테이블·컬럼은 변경하지 않고 추가만 한다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- documents 확장
-- -----------------------------------------------------------------------------
alter table public.documents
  add column content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  add column replaces_document_id uuid;

-- 재업로드 대상은 같은 점포의 문서여야 한다
alter table public.documents
  add constraint documents_replaces_same_store_fk
  foreign key (replaces_document_id, store_id) references public.documents (id, store_id) on delete set null (replaces_document_id);

create index documents_store_hash_idx on public.documents (store_id, content_hash);
create index documents_replaces_idx on public.documents (replaces_document_id);

-- -----------------------------------------------------------------------------
-- document_requests : 양도인에게 보낸 추가 자료 요청
-- -----------------------------------------------------------------------------
create type public.document_request_status as enum ('open', 'fulfilled', 'cancelled');

create table public.document_requests (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores (id) on delete cascade,
  requested_by    uuid references public.users (id) on delete set null,
  checklist_keys  text[] not null check (cardinality(checklist_keys) > 0),  -- 요청한 체크리스트 항목
  message         text not null check (char_length(message) between 1 and 5000),
  status          public.document_request_status not null default 'open',
  fulfilled_at    timestamptz,
  created_at      timestamptz not null default now(),
  check ((status = 'fulfilled') = (fulfilled_at is not null))
);

create index document_requests_store_idx on public.document_requests (store_id, created_at desc);

-- -----------------------------------------------------------------------------
-- activities : 점포별 실사 활동 기록 (추가만 하고 수정·삭제하지 않는다)
-- -----------------------------------------------------------------------------
create type public.activity_type as enum (
  'store_created',         -- 점포 등록
  'store_updated',         -- 점포 정보 수정
  'document_uploaded',     -- 자료 업로드
  'document_reuploaded',   -- 자료 재업로드
  'document_analyzed',     -- 문서 분석 완료
  'document_failed',       -- 문서 분석 실패
  'analysis_completed',    -- 실사 분석 완료
  'risk_detected',         -- 주요 위험 탐지
  'documents_requested',   -- 추가 자료 요청
  'report_generated'       -- 보고서 생성
);

create table public.activities (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores (id) on delete cascade,
  actor_id     uuid references public.users (id) on delete set null,
  type         public.activity_type not null,
  title        text not null check (char_length(title) between 1 and 200),
  detail       jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  document_id  uuid references public.documents (id) on delete set null,
  analysis_id  uuid references public.analyses (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index activities_store_created_idx on public.activities (store_id, created_at desc);
create index activities_created_idx on public.activities (created_at desc);

create function public.prevent_activity_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'activities는 기록 보존을 위해 수정할 수 없습니다 (id=%)', old.id
    using errcode = 'P0001';
end;
$$;

create trigger activities_immutable
  before update on public.activities
  for each row execute function public.prevent_activity_change();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.document_requests enable row level security;
alter table public.activities        enable row level security;

create policy document_requests_select on public.document_requests
  for select to authenticated using (public.can_view_store(store_id));
-- 양수인도 공개 매물에 추가 자료를 요청할 수 있다
create policy document_requests_insert on public.document_requests
  for insert to authenticated
  with check (public.can_view_store(store_id) and requested_by = (select auth.uid()) and status = 'open');

create policy activities_select on public.activities
  for select to authenticated using (public.can_view_store(store_id));
-- 활동 기록 쓰기는 서버(service_role)만 수행한다
