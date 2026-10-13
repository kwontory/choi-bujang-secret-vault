// 보호 API 공통 관문: ① 설치형 앱 서명·서버 승인 기기 확인 → ② 판정기 결정(src/authorize.mjs).
// 둘 다 통과한 요청만 각 API 의 소유자·권한 확인으로 넘어갑니다.
import { authorize } from './authorize.mjs';
import { checkSignedRequest } from './device-approval.mjs';

export async function guardProtected({ supabase, identity, request, apiPath }) {
  const method = request.method;
  const signed = await checkSignedRequest({ supabase, identity, headers: request.headers, method, path: apiPath, body: request.body });
  if (signed.error) {
    return { error: { status: signed.error === 'device_signature_required' ? 403 : 401, body: { error: signed.error } } };
  }
  const verdict = await authorize({ identity, method, apiPath, deviceId: signed.deviceId, deviceRegistered: true });
  if (verdict.decision !== 'allow') {
    return { error: { status: 403, body: { error: verdict.reasonCode, decision: verdict.decision, ruleIds: verdict.ruleIds } } };
  }
  return { deviceId: signed.deviceId, ruleIds: verdict.ruleIds };
}
