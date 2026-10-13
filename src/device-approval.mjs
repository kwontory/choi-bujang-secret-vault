// 11단계 기기 승인 부품입니다. 서버 함수에서만 씁니다.
// - 브라우저는 기기 키를 메모리에서만 만들고(내보낼 수 없는 키), 저장소에 넣지 않습니다.
// - 서버는 공개 키로 서명을 확인해 「그 기기가 맞는지」만 봅니다. 승인 여부는 서버 표(device_registrations)
//   에 승인된 기록이 있는지로 정하고, 그 결과를 판정기(src/decider.mjs)에 넣어 최종 허용을 받습니다.
// - 승인 버튼이나 설치 표시만으로는 승인되지 않습니다. 승인은 강사 관리 경로나 Supabase 에서만 합니다.
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { decide } from './decider.mjs';

export const DEVICE_ID = /^[0-9a-f]{16}$/u;
const B64URL = /^[A-Za-z0-9_-]{20,200}$/u;
const MAX_SKEW_MS = 2 * 60 * 1000;
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');
export const EMPTY_SHA256 = sha256('');

// 공개 키(P-256 JWK 의 x·y)에서 16자리 기기 ID 를 만듭니다. 개인키가 아닙니다.
export function publicKeyFrom(input) {
  const jwk = input && typeof input === 'object' ? input : null;
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !B64URL.test(jwk.x ?? '') || !B64URL.test(jwk.y ?? '')
      || Object.hasOwn(jwk, 'd')) return null; // 개인키(d)가 섞여 오면 받지 않습니다
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
}
export const deviceIdOf = jwk => sha256(`${jwk.crv}.${jwk.x}.${jwk.y}`).slice(0, 16);

// 기기 증명 문장: 이 기기가 지금 이 동작을 요청한다는 것을 서명으로 보입니다.
export const proofMessage = (action, deviceId, timestamp) => `aleph-device-v1|${action}|${deviceId}|${timestamp}`;
// 보호 요청 서명 문장: 서명 뒤 경로나 본문을 바꾸면 맞지 않습니다.
export const requestMessage = ({ method, path, bodySha256, timestamp, deviceId }) =>
  `aleph-request-v1|${method}|${path}|${bodySha256}|${timestamp}|${deviceId}`;
const isEmptyBody = body => body === undefined || body === null || body === ''
  || (typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0);
export const bodySha256Of = body => sha256(isEmptyBody(body) ? '' : typeof body === 'string' ? body : JSON.stringify(body));

export async function verifySignature(jwk, message, signature, timestamp, now = Date.now()) {
  const at = Number(timestamp);
  if (!Number.isSafeInteger(at) || Math.abs(now - at) > MAX_SKEW_MS) return false;
  if (typeof signature !== 'string' || !/^[A-Za-z0-9_-]{40,200}$/u.test(signature)) return false;
  try {
    const key = await webcrypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key,
      Buffer.from(signature, 'base64url'), new TextEncoder().encode(message));
  } catch {
    return false;
  }
}

export async function findRegistration(supabase, deviceId) {
  try {
    const { data, error } = await supabase.from('device_registrations')
      .select('device_id, user_id, public_x, public_y, status').eq('device_id', deviceId).maybeSingle();
    return { row: data ?? null, error: error ?? null };
  } catch (error) {
    return { row: null, error };
  }
}

// 서버가 확인한 사실만 담아 판정기에 묻습니다. 브라우저가 보낸 승인 여부는 넣지 않습니다.
export async function askDecider({ userId, deviceId, registered, now = new Date() }) {
  const request = {
    schema: 'aleph.decision.v1', requestId: randomUUID(), classId: 'student_app',
    projectId: 'choi-bujang-secret-vault', subjectId: sha256(`subject:${userId}`).slice(0, 32),
    deviceId, service: 'notes', method: 'GET', path: '/notes/app', route: 'GET /notes/:id',
    queryLength: 0, querySha256: EMPTY_SHA256, at: now.toISOString(), policyRevision: 1,
    deviceRegistered: registered === true,
    stepUp: { verified: false, authAgeSeconds: null }, recentEvents: [],
    signals: { source: 'none', region: 'unknown', network: 'unknown', hour: now.getUTCHours() },
  };
  return decide(request);
}

// 보호 요청에 기기 서명 머리글이 붙어 오면 그 서명을 확인합니다(접속 앱이 보내는 요청).
// 서명이 있는데 맞지 않으면(서명 뒤 경로·본문 변경, 미승인 기기, 다른 사용자 기기) 거부 사유를 돌려줍니다.
export async function checkSignedRequest({ supabase, identity, headers, method, path, body }) {
  const deviceId = headers?.['x-aleph-device'];
  const signature = headers?.['x-aleph-signature'];
  const timestamp = headers?.['x-aleph-timestamp'];
  if (deviceId === undefined && signature === undefined && timestamp === undefined) return { signed: false };
  if (typeof deviceId !== 'string' || !DEVICE_ID.test(deviceId)) return { signed: true, error: 'device_signature_invalid' };
  const { row, error } = await findRegistration(supabase, deviceId);
  if (error || !row || row.user_id !== identity.userId) return { signed: true, error: 'device_not_registered' };
  if (row.status !== 'approved') return { signed: true, error: 'device_not_approved' };
  const jwk = { kty: 'EC', crv: 'P-256', x: row.public_x, y: row.public_y };
  const message = requestMessage({ method, path, bodySha256: bodySha256Of(body), timestamp, deviceId });
  if (!(await verifySignature(jwk, message, signature, timestamp))) return { signed: true, error: 'device_signature_invalid' };
  return { signed: true, deviceId };
}
