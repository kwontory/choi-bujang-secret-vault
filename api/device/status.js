// 11단계 기기 승인 상태 확인: POST /api/device/status
// 서명으로 같은 기기인지 확인 → 서버 승인 증표·회수 여부 확인 → 판정기 allow 일 때만 approved.
import { json, requestBody, serverRuntime } from '../../src/zone-api.mjs';
import { deviceStatus } from '../../src/device-flow.mjs';

export default async function handler(request, response) {
  const active = serverRuntime();
  if (!active) return json(response, 503, { error: 'server_not_configured' });
  const identity = await active.verifyLogin(request.headers?.authorization);
  if (!identity) return json(response, 401, { error: 'login_required' });
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'method_not_allowed' });
  }
  const result = await deviceStatus({ supabase: active.supabase, identity, body: requestBody(request) ?? {} });
  return json(response, result.status, result.body);
}
