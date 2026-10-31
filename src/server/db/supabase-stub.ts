/**
 * Supabase가 기본 제공하는 auth 스키마, auth.uid(), 역할(anon/authenticated/service_role)을
 * 최소한으로 흉내 낸다. 로컬 PGlite에서 실제 마이그레이션을 그대로 적용하기 위한 용도다.
 * 실제 Supabase 프로젝트에는 적용하지 않는다.
 */
export const SUPABASE_STUB_SQL = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );

  -- Supabase의 auth.uid()는 JWT의 sub 클레임을 읽는다
  create function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;

  -- Supabase는 public 스키마 테이블에 기본 권한을 부여한다 (접근 제어는 RLS가 담당)
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;
