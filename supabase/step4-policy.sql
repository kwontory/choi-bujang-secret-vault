-- Review and run this only after step4-seed.sql, in the Supabase SQL Editor.
-- Changes only public.notes. No other table or role is modified.
begin;

create temporary table step4_privileges_before on commit drop as
select r.role_name, p.privilege_name,
  exists (
    select 1 from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name = 'notes'
      and g.grantee = r.role_name and g.privilege_type = p.privilege_name
  ) as listed_grant,
  has_table_privilege(r.role_name, 'public.notes', p.privilege_name) as effective_grant
from (values ('anon'), ('authenticated')) as r(role_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
  ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(privilege_name);

-- Stop instead of silently preserving an unexpected permissive policy.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notes'
      and policyname not in (
        'notes_owner_select', 'notes_owner_insert',
        'notes_owner_update', 'notes_owner_delete'
      )
  ) then
    raise exception 'Review existing public.notes policies before applying step 4.';
  end if;
end $$;

revoke all on table public.notes from public, anon, authenticated;
grant select, insert, update, delete on table public.notes to authenticated;
alter table public.notes enable row level security;

drop policy if exists notes_owner_select on public.notes;
drop policy if exists notes_owner_insert on public.notes;
drop policy if exists notes_owner_update on public.notes;
drop policy if exists notes_owner_delete on public.notes;

create policy notes_owner_select on public.notes for select to authenticated
  using (auth.uid() = owner_id);
create policy notes_owner_insert on public.notes for insert to authenticated
  with check (auth.uid() = owner_id);
create policy notes_owner_update on public.notes for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
create policy notes_owner_delete on public.notes for delete to authenticated
  using (auth.uid() = owner_id);

select 'before' as phase, role_name, privilege_name, listed_grant, effective_grant
from step4_privileges_before
union all
select 'after' as phase, r.role_name, p.privilege_name,
  exists (
    select 1 from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name = 'notes'
      and g.grantee = r.role_name and g.privilege_type = p.privilege_name
  ) as listed_grant,
  has_table_privilege(r.role_name, 'public.notes', p.privilege_name) as effective_grant
from (values ('anon'), ('authenticated')) as r(role_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
  ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(privilege_name)
order by phase, role_name, privilege_name;

commit;
