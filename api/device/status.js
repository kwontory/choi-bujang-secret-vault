// 11단계 기기 승인 상태 확인: POST /api/device/status
// 서명으로 같은 기기인지 확인 → 서버 표에서 승인 여부 확인 → 판정기에 물어 allow 일 때만 자료실을 엽니다.
import { json, requestBody, serverRuntime } from '../../src/zone-api.mjs';
import { askDecider, deviceIdOf, findRegistration, proofMessage, publicKeyFrom, verifySignature } from '../../src/device-approval.mjs';

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
  const jwk = publicKeyFrom(body.publicKey);
  if (!jwk) return json(response, 400, { error: 'invalid_device_key' });
  const deviceId = deviceIdOf(jwk);
  const ok = await verifySignature(jwk, proofMessage('status', deviceId, body.timestamp), body.signature, body.timestamp);
  if (!ok) return json(response, 401, { error: 'device_proof_invalid' });

  const { row, error } = await findRegistration(active.supabase, deviceId);
  if (error) return json(response, 503, { error: 'device_registry_unavailable' });
  const sameKey = row && row.public_x === jwk.x && row.public_y === jwk.y;
  const registered = Boolean(row && sameKey && row.user_id === identity.userId && row.status === 'approved');
  const verdict = await askDecider({ userId: identity.userId, deviceId, registered });
  const status = !row || row.user_id !== identity.userId ? 'not_requested' : row.status;
  return json(response, 200, {
    deviceId, status, approved: verdict.decision === 'allow' && registered,
    decision: verdict.decision, reasonCode: verdict.reasonCode,
  });
}
