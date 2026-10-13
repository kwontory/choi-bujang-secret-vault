// 11단계 기기 승인 로컬 연습: 서버 승인 흐름(src/device-flow.mjs)과 보호 요청 서명 확인을 시험합니다.
// 기기 키는 이 시험 프로세스 메모리에서만 만들고, 실제 배포·심판 판정과 무관합니다.
import { createHash, webcrypto } from 'node:crypto';
import { checkSignedRequest } from '../src/device-approval.mjs';
import { deviceStatus, requestApproval } from '../src/device-flow.mjs';

process.env.SUPABASE_SECRET_KEY ||= 'local-device-test-only';
const subtle = webcrypto.subtle;
const enc = new TextEncoder();
const b64url = bytes => Buffer.from(bytes).toString('base64url');
const hex = text => createHash('sha256').update(text, 'utf8').digest('hex');
const revoked = new Set();
const supabase = { from: () => { let id; const b = { select: () => b, eq: (k, v) => { id = v; return b; },
  insert: async () => ({ error: null }),
  maybeSingle: async () => ({ data: revoked.has(id) ? { device_id: id, status: 'revoked' } : null, error: null }) }; return b; } };
const A = { kind: 'student', userId: '11111111-1111-4111-8111-111111111111' };
const B = { kind: 'student', userId: '22222222-2222-4222-8222-222222222222' };

async function device() {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const { kty, crv, x, y } = await subtle.exportKey('jwk', pair.publicKey);
  const id = hex(`${crv}.${x}.${y}`).slice(0, 16);
  const sign = async message => b64url(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, enc.encode(message)));
  const proof = async action => { const timestamp = String(Date.now());
    return { publicKey: { kty, crv, x, y }, timestamp, signature: await sign(`aleph-device-v1|${action}|${id}|${timestamp}`) }; };
  const headers = async (method, path, body, grant, extra = {}) => { const timestamp = String(Date.now());
    return { 'x-aleph-device': id, 'x-aleph-timestamp': timestamp, 'x-aleph-grant': grant,
      'x-aleph-signature': await sign(`aleph-request-v1|${method}|${path}|${hex(body ?? '')}|${timestamp}|${id}`), ...extra }; };
  return { id, proof, headers };
}

const results = [];
const check = (name, passed) => results.push({ name, passed: Boolean(passed) });
const browser = { 'sec-fetch-site': 'same-origin' };
const d = await device();
const before = await deviceStatus({ supabase, identity: A, body: await d.proof('status') });
check('승인 전: 상태는 not_registered, approved 아님', before.status === 200 && before.body.approved === false && before.body.status === 'not_registered');
const clientClaim = await requestApproval({ supabase, identity: A, body: { ...(await d.proof('register')), approved: true } });
check('브라우저가 보낸 승인 값은 거부(400)', clientClaim.status === 400);
const reg = await requestApproval({ supabase, identity: A, body: await d.proof('register') });
check('승인 요청: 서버가 증명 확인 + 판정기 allow → approved', reg.status === 200 && reg.body.approved && typeof reg.body.grant === 'string');
const after = await deviceStatus({ supabase, identity: A, body: { ...(await d.proof('status')), grant: reg.body.grant } });
check('승인 후: 상태 approved, 판정기 allow', after.body.approved === true && after.body.decision === 'allow');
const otherUser = await deviceStatus({ supabase, identity: B, body: { ...(await d.proof('status')), grant: reg.body.grant } });
check('다른 사용자가 같은 증표를 쓰면 approved 아님', otherUser.body.approved === false);
const noSig = await checkSignedRequest({ supabase, identity: A, headers: browser, method: 'GET', path: '/api/notes' });
check('접속 앱(브라우저)의 서명 없는 보호 요청 → device_signature_required', noSig.error === 'device_signature_required');
const noSigScript = await checkSignedRequest({ supabase, identity: A, headers: {}, method: 'GET', path: '/api/notes' });
check('브라우저 밖(스크립트)의 서명 없는 보호 요청도 → device_signature_required', noSigScript.error === 'device_signature_required');
const ok = await checkSignedRequest({ supabase, identity: A, headers: await d.headers('GET', '/api/notes', '', reg.body.grant, browser), method: 'GET', path: '/api/notes' });
check('승인 기기의 서명 요청 → 통과', ok.signed && !ok.error);
const pathChanged = await checkSignedRequest({ supabase, identity: A, headers: await d.headers('GET', '/api/notes', '', reg.body.grant, browser), method: 'GET', path: '/api/notes/44444444-4444-4444-8444-444444444444' });
check('서명 뒤 경로 변경 → device_signature_invalid', pathChanged.error === 'device_signature_invalid');
const body = JSON.stringify({ title: 't', body: 'b' });
const bodyChanged = await checkSignedRequest({ supabase, identity: A, headers: await d.headers('POST', '/api/notes', body, reg.body.grant, browser), method: 'POST', path: '/api/notes', body: { title: 't', body: 'X' } });
check('서명 뒤 본문 변경 → device_signature_invalid', bodyChanged.error === 'device_signature_invalid');
const forged = await checkSignedRequest({ supabase, identity: A, headers: { ...(await d.headers('GET', '/api/notes', '', reg.body.grant, browser)), 'x-aleph-grant': 'forged.grant' }, method: 'GET', path: '/api/notes' });
check('위조한 승인 증표 → device_not_registered', forged.error === 'device_not_registered');
const other = await device();
const unapproved = await checkSignedRequest({ supabase, identity: A, headers: await other.headers('GET', '/api/notes', '', reg.body.grant, browser), method: 'GET', path: '/api/notes' });
check('승인 안 된 다른 기기의 서명 → device_not_registered', unapproved.error === 'device_not_registered');
revoked.add(d.id);
const revokedStatus = await deviceStatus({ supabase, identity: A, body: { ...(await d.proof('status')), grant: reg.body.grant } });
const revokedReq = await checkSignedRequest({ supabase, identity: A, headers: await d.headers('GET', '/api/notes', '', reg.body.grant, browser), method: 'GET', path: '/api/notes' });
check('회수된 기기 → 상태 revoked, 보호 요청 거부', revokedStatus.body.status === 'revoked' && revokedReq.error === 'device_revoked');

for (const item of results) process.stdout.write(`${item.passed ? '통과' : '확인 필요'} · ${item.name}\n`);
process.stdout.write('메모리 안 연습이며 배포·심판 판정과 무관합니다.\n');
if (results.some(item => !item.passed)) process.exitCode = 1;
