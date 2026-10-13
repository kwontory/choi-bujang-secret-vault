// 11단계 기기 승인 요청: POST /api/device/register
// 로그인한 사용자가 메모리에서 만든 기기 공개 키와 서명을 보내면 「승인 대기」로 기록합니다.
// 이 요청만으로는 절대 승인되지 않습니다. 승인은 강사 관리 경로나 Supabase 에서만 합니다.
import { json, requestBody, serverRuntime } from '../../src/zone-api.mjs';
import { deviceIdOf, findRegistration, proofMessage, publicKeyFrom, verifySignature } from '../../src/device-approval.mjs';

export default async function handler(request, response) {
  const active = serverRuntime();
  if (!active) return json(response, 503, { error: 'server_not_configured' });
  const identity = await active.verifyLogin(request.headers?.authorization);
  if (!identity) return json(response, 401, { error: 'login_required' });
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'method_not_allowed' });
  }
  const body = requestBody(request) ?? {};
  // 브라우저가 보낸 승인 상태나 역할은 받지 않습니다.
  if (['status', 'approved', 'role', 'deviceRegistered'].some(key => Object.hasOwn(body, key))) {
    return json(response, 400, { error: 'client_approval_rejected' });
  }
  const jwk = publicKeyFrom(body.publicKey);
  if (!jwk) return json(response, 400, { error: 'invalid_device_key' });
  const deviceId = deviceIdOf(jwk);
  const ok = await verifySignature(jwk, proofMessage('register', deviceId, body.timestamp), body.signature, body.timestamp);
  if (!ok) return json(response, 401, { error: 'device_proof_invalid' });

  const { row, error } = await findRegistration(active.supabase, deviceId);
  if (error) return json(response, 503, { error: 'device_registry_unavailable' });
  if (row && row.user_id !== identity.userId) return json(response, 409, { error: 'device_owned_by_other' });
  if (!row) {
    const { error: insertError } = await active.supabase.from('device_registrations').insert({
      device_id: deviceId, user_id: identity.userId, public_x: jwk.x, public_y: jwk.y, status: 'pending',
    });
    if (insertError) return json(response, 502, { error: 'device_request_failed' });
  }
  return json(response, row ? 200 : 201, { deviceId, status: row?.status ?? 'pending' });
}
