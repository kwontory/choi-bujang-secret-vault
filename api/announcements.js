// 8단계 반 공지 구역(/api/announcements, /api/announcements/:id): 로그인한 사용자의 읽기(GET)만 허용합니다.
// 공지 수정은 이 경로가 아니라 강사 관리 경로(/api/admin/announcements/:id)에서만 처리합니다.
import { NOTICE_ID, json, publicNotice, serverRuntime } from '../src/zone-api.mjs';
import { guardProtected } from '../src/api-guard.mjs';

export default async function handler(request, response) {
  const active = serverRuntime();
  if (!active) return json(response, 503, { error: 'server_not_configured' });

  const identity = await active.verifyLogin(request.headers?.authorization);
  if (!identity) return json(response, 401, { error: 'login_required' });

  // 반 공지 구역은 읽기 전용입니다. 본문·헤더의 역할 값과 상관없이 쓰기는 거부합니다.
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return json(response, 403, { error: 'announcement_write_denied' });
  }

  const routeId = typeof request.query?.id === 'string' ? request.query.id : null;
  if (routeId && !NOTICE_ID.test(routeId)) return json(response, 400, { error: 'invalid_announcement_id' });
  // 전역 접근 통제: 설치형 앱 서명·서버 승인 기기 확인 뒤 판정기(zone_announcements_read_only)에 묻습니다.
  const guard = await guardProtected({ supabase: active.supabase, identity, request,
    apiPath: routeId ? `/api/announcements/${routeId}` : '/api/announcements' });
  if (guard.error) return json(response, guard.error.status, guard.error.body);

  if (!routeId) {
    const { data, error } = await active.supabase.from('class_notices')
      .select('id, title, content, updated_at').order('updated_at', { ascending: false }).limit(50);
    if (error) return json(response, 502, { error: 'announcements_unavailable' });
    return json(response, 200, (data ?? []).map(publicNotice));
  }

  const { data, error } = await active.supabase.from('class_notices')
    .select('id, title, content, updated_at').eq('id', routeId).maybeSingle();
  if (error) return json(response, 502, { error: 'announcement_unavailable' });
  if (!data) return json(response, 404, { error: 'announcement_not_found' });
  return json(response, 200, publicNotice(data));
}
