// 11단계 기기 승인 요청: POST /api/device/register
// 승인 여부는 서버와 판정기가 정합니다(src/device-flow.mjs). 화면의 버튼은 요청만 보냅니다.
import { json, requestBody, serverRuntime } from '../../src/zone-api.mjs';
import { requestApproval } from '../../src/device-flow.mjs';

export default async function handler(request, response) {
  const active = serverRuntime();
  if (!active) return json(response, 503, { error: 'server_not_configured' });
  const identity = await active.verifyLogin(request.headers?.authorization);
  if (!identity) return json(response, 401, { error: 'login_required' });
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'method_not_allowed' });
  }
  const result = await requestApproval({ supabase: active.supabase, identity, body: requestBody(request) ?? {} });
  return json(response, result.status, result.body);
}
