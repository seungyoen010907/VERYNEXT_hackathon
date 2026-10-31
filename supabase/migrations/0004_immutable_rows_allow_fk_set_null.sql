-- =============================================================================
-- 수정 불가 기록 테이블의 트리거 보완
--
-- 문제: 기록 테이블은 UPDATE를 모두 막았는데, 참조 대상(문서·사용자·분석)이 삭제되면
--       외래키 "on delete set null"이 UPDATE를 실행해 삭제 자체가 실패했다.
--       (예: 메신저로 파일을 공유한 매물을 삭제할 수 없음)
-- 수정: 지정한 참조 컬럼이 NULL로 바뀌는 것만 허용하고, 그 밖의 변경은 계속 막는다.
-- =============================================================================

create function public.prevent_update_except_null_refs()
returns trigger
language plpgsql
as $$
declare
  col text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    -- 참조 컬럼은 NULL로 바뀌는 경우만 허용한다
    if jsonb_typeof(n -> col) <> 'null' and (n -> col) is distinct from (o -> col) then
      raise exception '%는 기록 보존을 위해 수정할 수 없습니다 (id=%)', tg_table_name, old.id using errcode = 'P0001';
    end if;
    o := o - col;
    n := n - col;
  end loop;
  if o is distinct from n then
    raise exception '%는 기록 보존을 위해 수정할 수 없습니다 (id=%)', tg_table_name, old.id using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger deal_messages_immutable on public.deal_messages;
create trigger deal_messages_immutable
  before update on public.deal_messages
  for each row execute function public.prevent_update_except_null_refs('sender_id', 'document_id');

drop trigger deal_events_immutable on public.deal_events;
create trigger deal_events_immutable
  before update on public.deal_events
  for each row execute function public.prevent_update_except_null_refs('actor_id');

drop trigger deal_term_changes_immutable on public.deal_term_changes;
create trigger deal_term_changes_immutable
  before update on public.deal_term_changes
  for each row execute function public.prevent_update_except_null_refs('changed_by');

drop trigger activities_immutable on public.activities;
create trigger activities_immutable
  before update on public.activities
  for each row execute function public.prevent_update_except_null_refs('actor_id', 'document_id', 'analysis_id');

-- 파일 메시지의 문서가 삭제되면 document_id가 NULL이 된다. 메시지 기록은 남기고 화면에서 '삭제된 파일'로 표시한다.
alter table public.deal_messages drop constraint deal_messages_check;
