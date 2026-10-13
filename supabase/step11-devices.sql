-- 11단계 기기 승인 표. Supabase SQL Editor에서 검토한 뒤 실행하세요.
-- 서버 함수(api/device/register.js, api/device/status.js, api/admin/devices.js, api/notes.js)는
-- 서버 전용 키로만 이 표를 씁니다. 기기 개인키는 어디에도 저장하지 않고 공개 키(x, y)만 남깁니다.
begin;

create table if not exists public.device_registrations (
  device_id text primary key check (device_id ~ '^[0-9a-f]{16}$'),
  user_id uuid not null,
  public_x text not null,
  public_y text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz
);

alter table public.device_registrations enable row level security;
revoke all on table public.device_registrations from public, anon, authenticated;

commit;

-- 승인 대기 기기 확인(공개 키는 출력하지 않습니다)
select device_id, user_id, status, requested_at from public.device_registrations order by requested_at desc limit 20;

-- 기기 승인(관리자만, 화면에 보이는 기기 ID 로 바꿔 따로 실행):
-- update public.device_registrations set status = 'approved', decided_at = now()
-- where device_id = 'DEVICE_ID_HERE' and status = 'pending';
-- 승인 회수:
-- update public.device_registrations set status = 'revoked', decided_at = now() where device_id = 'DEVICE_ID_HERE';
