// 8단계 강사 관리 경로: 서버에 저장된 강사 권한이 있는 로그인 사용자만 공지 한 건을 고칩니다.
// 판정기 요청 계약에는 역할이 없으므로 이 확인은 판정기가 아니라 서버가 합니다.
import { NOTICE_ID, isStoredInstructor, json, publicNotice, requestBody, serverRuntime } from '../../src/zone-api.mjs';

const noticeInput = request => {
  const input = requestBody(request);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!title || title.length > 120 || !body || body.length > 2_000) return null;
  return { title, body };
};

export default async function handler(request, response) {
  const active = serverRuntime();
  if (!active) return json(response, 503, { error: 'server_not_configured' });

  const identity = await active.verifyLogin(request.headers?.authorization);
  if (!identity) return json(response, 401, { error: 'login_required' });

  const routeId = typeof request.query?.id === 'string' ? request.query.id : null;
  if (request.method !== 'PUT' || !routeId) {
    response.setHeader('Allow', 'PUT');
    return json(response, 405, { error: 'method_not_allowed' });
  }
  if (!NOTICE_ID.test(routeId)) return json(response, 400, { error: 'invalid_announcement_id' });

  // 화면 메뉴나 본문의 role 값은 보지 않고, 저장된 강사 권한표와 검증된 사용자 ID만 대조합니다.
  if (!(await isStoredInstructor(active.supabase, identity))) {
    return json(response, 403, { error: 'instructor_only' });
  }

  const input = noticeInput(request);
  if (!input) return json(response, 400, { error: 'invalid_announcement' });
  const { data, error } = await active.supabase.from('class_notices')
    .update({ title: input.title, content: input.body, updated_by: identity.userId,
      updated_at: new Date().toISOString() })
    .eq('id', routeId).select('id, title, content, updated_at').maybeSingle();
  if (error) return json(response, 502, { error: 'announcement_update_failed' });
  if (!data) return json(response, 404, { error: 'announcement_not_found' });
  return json(response, 200, publicNotice(data));
}
