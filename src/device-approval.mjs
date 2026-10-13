// 11단계 기기 승인 부품입니다. 서버 함수에서만 씁니다.
// - 브라우저는 기기 키를 메모리에서만 만들고(내보낼 수 없는 키), 브라우저 저장소에 넣지 않습니다.
// - 승인 여부는 서버와 판정기가 정합니다. 서버는 ① 검증된 로그인 사용자인지 ② 그 기기가 개인키를 실제로
//   가졌는지(서명 증명) ③ 회수된 기기가 아닌지를 확인해 등록 기기로 정하고, 그 결과를 판정기 decide() 에
//   deviceRegistered 로 넣어 allow 일 때만 승인합니다. 승인 버튼은 요청만 보내고, 설치 표시는 보지 않습니다.
// - 서버가 내준 기기 승인 증표(grant)는 서버 비밀 키로 서명한 짧은 증표이며, 화면 메모리에만 둡니다.
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { authorize } from './authorize.mjs';

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

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function base64urlBytes(text) {
  const bytes = [];
  let buffer = 0; let bits = 0;
  for (const char of text) {
    const value = B64_ALPHABET.indexOf(char);
    if (value < 0) throw new TypeError('invalid_base64url');
    buffer = (buffer << 6) | value; bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 0xff); }
  }
  return new Uint8Array(bytes);
}

export async function verifySignature(jwk, message, signature, timestamp, now = Date.now()) {
  const at = Number(timestamp);
  if (!Number.isSafeInteger(at) || Math.abs(now - at) > MAX_SKEW_MS) return false;
  if (typeof signature !== 'string' || !/^[A-Za-z0-9_-]{40,200}$/u.test(signature)) return false;
  try {
    // 표준 Web Crypto(globalThis.crypto.subtle)만 씁니다. 없으면 서명을 확인할 수 없으므로 거부합니다.
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return false;
    const key = await subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key,
      base64urlBytes(signature), new TextEncoder().encode(message));
  } catch {
    return false;
  }
}

// ── 서버 승인 증표(grant) ─────────────────────────────────────────────
const GRANT_TTL_MS = 12 * 60 * 60 * 1000;
const grantKey = () => {
  const secret = process.env.SUPABASE_SECRET_KEY;
  return typeof secret === 'string' && secret ? sha256(`aleph-device-grant-v1|${secret}`) : null;
};
const b64urlJson = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
export function issueGrant({ userId, deviceId, jwk, now = Date.now() }) {
  const key = grantKey();
  if (!key) return null;
  const body = b64urlJson({ v: 1, sub: userId, dev: deviceId, x: jwk.x, y: jwk.y, exp: now + GRANT_TTL_MS });
  return { grant: `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`, expiresAt: now + GRANT_TTL_MS };
}
export function readGrant(grant, { userId, deviceId, now = Date.now() }) {
  const key = grantKey();
  if (!key || typeof grant !== 'string' || grant.length > 1000) return null;
  const [body, mac] = grant.split('.');
  if (!body || !mac) return null;
  const expected = Buffer.from(createHmac('sha256', key).update(body).digest('base64url'));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let claims;
  try { claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (claims?.v !== 1 || claims.sub !== userId || claims.dev !== deviceId || !Number.isSafeInteger(claims.exp)
      || claims.exp <= now) return null;
  return { kty: 'EC', crv: 'P-256', x: claims.x, y: claims.y };
}

// 브라우저(접속 앱 화면)에서 온 요청인지: 브라우저는 Sec-Fetch-* 또는 Origin 머리글을 붙입니다.
export const fromBrowser = headers => Boolean(headers?.['sec-fetch-site'] || headers?.['sec-fetch-mode'] || headers?.origin);

// 회수 기록(device_registrations.status = 'revoked')이 있으면 승인하지 않습니다. 표가 없으면 회수 기록 없음으로 봅니다.
export async function isRevoked(supabase, deviceId) {
  const { row } = await findRegistration(supabase, deviceId);
  return row?.status === 'revoked';
}
export async function recordApproval(supabase, { deviceId, userId, jwk }) {
  try {
    const { row } = await findRegistration(supabase, deviceId);
    if (row) return;
    await supabase.from('device_registrations').insert({
      device_id: deviceId, user_id: userId, public_x: jwk.x, public_y: jwk.y, status: 'approved',
      decided_at: new Date().toISOString(),
    });
  } catch {
    // 기록 표가 없어도 서버 승인 증표로 동작합니다(회수 기능만 쓸 수 없음).
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

// 서버가 확인한 사실만 담아 판정기에 묻습니다(전역 접근 통제 src/authorize.mjs 와 같은 방식).
export async function askDecider({ userId, deviceId, registered, action = 'status', now = new Date() }) {
  return authorize({ identity: { userId }, method: 'POST', apiPath: `/api/device/${action}`, deviceId,
    deviceRegistered: registered === true, now });
}

// 보호 요청의 기기 서명을 확인합니다.
// - 11단계부터 보호 요청(메모)은 서버가 승인한 기기의 설치형 앱 서명이 반드시 있어야 합니다
//   (없으면 device_signature_required). 서명 방법은 docs/APP_SIGNING.md, 실행 예는 scripts/app-client.mjs.
// - 서명이 있으면 서버 승인 증표·같은 사용자·같은 기기·회수 여부·서명(메서드·경로·본문 해시·시각)을 모두 확인합니다.
//   서명 뒤 경로나 본문을 바꾸면 서명이 맞지 않아 거부됩니다.
export async function checkSignedRequest({ supabase, identity, headers, method, path, body }) {
  const deviceId = headers?.['x-aleph-device'];
  const signature = headers?.['x-aleph-signature'];
  const timestamp = headers?.['x-aleph-timestamp'];
  const grant = headers?.['x-aleph-grant'];
  if (deviceId === undefined && signature === undefined && timestamp === undefined && grant === undefined) {
    return { signed: false, error: 'device_signature_required' };
  }
  if (typeof deviceId !== 'string' || !DEVICE_ID.test(deviceId)) return { signed: true, error: 'device_signature_invalid' };
  const jwk = readGrant(grant, { userId: identity.userId, deviceId });
  if (!jwk) return { signed: true, error: 'device_not_registered' };
  if (await isRevoked(supabase, deviceId)) return { signed: true, error: 'device_revoked' };
  const message = requestMessage({ method, path, bodySha256: bodySha256Of(body), timestamp, deviceId });
  if (!(await verifySignature(jwk, message, signature, timestamp))) return { signed: true, error: 'device_signature_invalid' };
  return { signed: true, deviceId };
}
