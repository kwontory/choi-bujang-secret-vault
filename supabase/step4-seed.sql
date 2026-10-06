-- Review this learning-data script before running it in the Supabase SQL Editor.
-- Replace only the two placeholder emails below. Both users must already exist
-- in Authentication > Users. No password or token belongs in this file.
do $$
declare
  a_id uuid;
  b_id uuid;
begin
  select id into a_id from auth.users where lower(email) = lower('A_EMAIL_HERE');
  select id into b_id from auth.users where lower(email) = lower('B_EMAIL_HERE');
  if a_id is null or b_id is null or a_id = b_id then
    raise exception 'Create two distinct A/B users, then replace both email placeholders.';
  end if;

  -- These three existing virtual records were inspected on 2026-10-06.
  -- The fourth older record is left untouched and remains unavailable to users.
  if exists (
    select 1 from public.notes
    where id in (
      'fc3c7f53-7a8a-4083-815a-755dbfa90337',
      '18cdd385-b569-439b-b76d-b27d7166788e',
      'd197938d-fc08-4594-966d-be24e661bcdb'
    ) and owner_id is not null and owner_id <> a_id
  ) then
    raise exception 'A selected virtual note already has a different owner.';
  end if;
  update public.notes set owner_id = a_id
  where id in (
    'fc3c7f53-7a8a-4083-815a-755dbfa90337',
    '18cdd385-b569-439b-b76d-b27d7166788e',
    'd197938d-fc08-4594-966d-be24e661bcdb'
  ) and owner_id is null;
  if (select count(*) from public.notes where owner_id = a_id and id in (
    'fc3c7f53-7a8a-4083-815a-755dbfa90337',
    '18cdd385-b569-439b-b76d-b27d7166788e',
    'd197938d-fc08-4594-966d-be24e661bcdb'
  )) <> 3 then
    raise exception 'Expected all three selected virtual notes to belong to A.';
  end if;

  if not exists (select 1 from public.notes where owner_id = b_id and title = 'B 시험 메모') then
    insert into public.notes (owner_id, title, content)
    values (b_id, 'B 시험 메모', '공개 가능한 학습용 가상 메모입니다.');
  end if;
end $$;

-- Review only the identifiers and titles; do not export note bodies or emails.
select id, title, owner_id from public.notes
where title in ('과제', '포트폴리오', '아침 리추얼', 'B 시험 메모')
order by title;
