-- 10단계 백업·감사 기록 표. Supabase SQL Editor에서 검토한 뒤 실행하세요.
-- public.notes 의 행과 권한은 바꾸지 않습니다. 메모 본문을 SQL 결과로 내보내지 않습니다.
-- 서버 함수(api/notes.js, api/restore.js)는 서버 전용 키로만 두 표를 씁니다.
begin;

create extension if not exists pgcrypto with schema extensions;

-- 침해 전 사본: 메모 한 건의 ID·소유자·제목·본문·내용 해시
create table if not exists public.note_backups (
  id bigint generated always as identity primary key,
  note_id uuid not null,
  owner_id uuid not null,
  version integer not null check (version >= 1),
  title text not null,
  content text not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null default now(),
  unique (note_id, version)
);

-- 감사 기록: 쌓기만 하고 고치거나 지우지 않습니다. 본문 없이 해시만 남깁니다.
create table if not exists public.note_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  action text not null check (action in ('backup', 'create', 'update', 'delete', 'restore')),
  note_id uuid not null,
  owner_id uuid,
  actor_id uuid,
  before_sha256 text,
  after_sha256 text,
  backup_version integer
);

alter table public.note_backups enable row level security;
alter table public.note_audit enable row level security;
revoke all on table public.note_backups from public, anon, authenticated;
revoke all on table public.note_audit from public, anon, authenticated;
-- 서버 키로도 감사 기록은 덧붙이기만 가능하게 합니다.
revoke update, delete, truncate on table public.note_audit from service_role;
grant select, insert on table public.note_audit to service_role;
grant select, insert on table public.note_backups to service_role;
revoke update, delete, truncate on table public.note_backups from service_role;

-- 지금(침해 전) 소유자가 있는 메모마다 첫 사본을 만듭니다. 이미 사본이 있으면 건너뜁니다.
-- 내용 해시는 서버(src/note-backup.mjs)와 같은 방식: sha256(제목 || 줄바꿈 || 본문)
insert into public.note_backups (note_id, owner_id, version, title, content, content_sha256)
select n.id, n.owner_id, 1, n.title, n.content,
  encode(extensions.digest(convert_to(n.title || E'\n' || n.content, 'UTF8'), 'sha256'), 'hex')
from public.notes n
where n.owner_id is not null and n.title is not null and n.content is not null
on conflict (note_id, version) do nothing;

insert into public.note_audit (action, note_id, owner_id, after_sha256, backup_version)
select 'backup', b.note_id, b.owner_id, b.content_sha256, b.version
from public.note_backups b
where not exists (
  select 1 from public.note_audit a
  where a.action = 'backup' and a.note_id = b.note_id and a.backup_version = b.version
);

commit;

-- 확인: 사본 수와 해시 검증(본문은 출력하지 않습니다)
select count(*) as backups,
  count(*) filter (where content_sha256 =
    encode(extensions.digest(convert_to(title || E'\n' || content, 'UTF8'), 'sha256'), 'hex')) as verified
from public.note_backups;
