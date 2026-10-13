-- 8단계 구역 나누기: 반 공지(announcements)와 강사 권한표를 메모 표와 다른 표로 둡니다.
-- Supabase SQL Editor에서 내용을 검토한 뒤 실행하세요. public.notes 는 바꾸지 않습니다.
-- 서버 함수(api/announcements.js, api/admin/announcements.js)는 서버 전용 키로만 이 표를 읽고 씁니다.
-- 이메일·비밀번호·토큰을 이 파일에 넣지 마세요.
begin;

create table if not exists public.class_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 2000),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- 강사 권한표: 화면 메뉴나 요청 본문의 role 대신 이 표에 저장된 사용자만 공지를 고칠 수 있습니다.
create table if not exists public.class_instructors (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);

-- 브라우저 공개 키(anon)와 로그인 사용자 키(authenticated)로는 두 표를 직접 열 수 없게 합니다.
alter table public.class_notices enable row level security;
alter table public.class_instructors enable row level security;
revoke all on table public.class_notices from public, anon, authenticated;
revoke all on table public.class_instructors from public, anon, authenticated;

-- 공개 가능한 학습용 가상 공지 한 건
insert into public.class_notices (title, content)
select '반 공지', '공개 가능한 학습용 가상 공지입니다.'
where not exists (select 1 from public.class_notices);

-- 강사 계정을 등록하려면 아래 자리표시자만 바꿔 따로 실행하세요(선택).
-- insert into public.class_instructors (user_id)
-- select id from auth.users where lower(email) = lower('INSTRUCTOR_EMAIL_HERE')
-- on conflict do nothing;

commit;

-- 권한 확인: anon·authenticated 에 두 표 권한이 없어야 합니다.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('class_notices', 'class_instructors')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
