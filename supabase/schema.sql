-- 점포 양도양수 계약 관리 에이전트: 테이블 + Storage 버킷 (docs/API.md 5번)
-- Supabase 대시보드 > SQL Editor에 전체 붙여넣고 Run.
-- 여러 번 실행해도 안전하다.

-- 예전 템플릿(PRD 메이커)에서 만든 테이블이 있으면 지운다.
drop table if exists public.specs;

create table if not exists public.deals (
  id                     uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  address                text not null,
  business_type          text not null,
  premium                bigint not null,
  deposit                bigint not null,
  monthly_rent           bigint not null,
  claimed_monthly_sales  bigint not null,
  claimed_monthly_profit bigint,
  stage                  text not null default 'consent',
  seller_consent         boolean not null default false,
  consent_at             timestamptz
);

create table if not exists public.checklist_items (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals(id) on delete cascade,
  stage      text not null,
  role       text not null,
  key        text not null,
  title      text not null,
  status     text not null default 'todo',
  sort       int  not null,
  updated_at timestamptz default now()
);

create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  deal_id       uuid not null references public.deals(id) on delete cascade,
  checklist_key text not null,
  file_name     text not null,
  storage_path  text not null,
  kind          text not null,
  size          int  not null
);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  deal_id    uuid not null references public.deals(id) on delete cascade,
  role       text not null,
  body       text not null
);

create table if not exists public.reports (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  deal_id    uuid not null references public.deals(id) on delete cascade,
  grade      text not null,
  result     jsonb not null
);

create index if not exists deals_created_at_idx      on public.deals (created_at desc);
create index if not exists checklist_items_deal_idx  on public.checklist_items (deal_id, sort);
create index if not exists documents_deal_idx        on public.documents (deal_id, created_at);
create index if not exists messages_deal_idx         on public.messages (deal_id, created_at);
create index if not exists reports_deal_idx          on public.reports (deal_id, created_at desc);

-- RLS를 켜고 정책(policy)은 하나도 만들지 않는다.
-- => publishable 키로는 이 테이블들을 읽지도 쓰지도 못한다.
-- => 우리 서버는 secret 키로 접속하는데, 이 키는 RLS를 우회한다.
alter table public.deals           enable row level security;
alter table public.checklist_items enable row level security;
alter table public.documents       enable row level security;
alter table public.messages        enable row level security;
alter table public.reports         enable row level security;

-- 2026-05-30 이후 만든 프로젝트는 새 테이블이 API에 자동 노출되지 않는다.
-- 이 grant가 없으면 "42501 permission denied for table deals" 에러가 난다.
grant select, insert, update, delete on
  public.deals, public.checklist_items, public.documents, public.messages, public.reports
  to service_role;

-- Storage: 비공개(private) 버킷. 파일 하나 10MB까지.
insert into storage.buckets (id, name, public, file_size_limit)
values ('deal-documents', 'deal-documents', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;
