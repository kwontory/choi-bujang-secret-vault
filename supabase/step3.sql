do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'notes'
      and column_name = 'id' and data_type <> 'uuid'
  ) then
    alter table public.notes rename column id to legacy_id;
    alter table public.notes add column id uuid not null default gen_random_uuid();
    alter table public.notes add constraint notes_step3_id_key unique (id);
  end if;
end $$;

alter table public.notes enable row level security;
revoke all on table public.notes from anon, authenticated;

comment on table public.notes is
  '3단계 로그인 실습용 가상 메모. 서버가 검증한 사용자 ID만 owner_id에 저장합니다.';
