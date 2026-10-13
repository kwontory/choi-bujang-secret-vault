// 11단계 기기 승인 관리 경로: PUT /api/admin/devices/:id  본문 { "status": "approved" | "revoked" }
// 서버에 저장된 강사 권한표(class_instructors)에 있는 사용자만 승인·회수할 수 있습니다.
import { isStoredInstructor, json, requestBody, serverRuntime } from '../../src/zone-api.mjs';
import { DEVICE_ID } from '../../src/device-approval.mjs';

export default async function handler(request, response) {
  const active = serverRuntime();
  if (!active) return json(response, 503, { error: 'server_not_configured' });
  const identity = await active.verifyLogin(request.headers?.authorization);
  if (!identity) return json(response, 401, { error: 'login_required' });
  const deviceId = typeof request.query?.id === 'string' ? request.query.id : null;
  if (request.method !== 'PUT' || !deviceId) {
    response.setHeader('Allow', 'PUT');
    return json(response, 405, { error: 'method_not_allowed' });
  }
  if (!DEVICE_ID.test(deviceId)) return json(response, 400, { error: 'invalid_device_id' });
  if (!(await isStoredInstructor(active.supabase, identity))) return json(response, 403, { error: 'instructor_only' });
  const status = requestBody(request)?.status;
  if (!['approved', 'revoked'].includes(status)) return json(response, 400, { error: 'invalid_device_status' });
  const { data, error } = await active.supabase.from('device_registrations')
    .update({ status, decided_by: identity.userId, decided_at: new Date().toISOString() })
    .eq('device_id', deviceId).select('device_id, status').maybeSingle();
  if (error) return json(response, 502, { error: 'device_update_failed' });
  if (!data) return json(response, 404, { error: 'device_not_found' });
  return json(response, 200, { deviceId: data.device_id, status: data.status });
}
