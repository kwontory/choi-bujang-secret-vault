// 11단계 설치형 앱(접속 앱)과 같은 방식으로 서명 요청을 보내는 명령줄 도구입니다. 서명 방식: docs/APP_SIGNING.md
// 기기 키는 이 프로세스 메모리에서만 만들고 파일에 저장하지 않습니다. 토큰·키·메모 본문은 출력하지 않습니다.
//
//   APP_TOKEN=<로그인 토큰> node scripts/app-client.mjs check            정상·공격 사례를 차례로 보내고 결과 표를 출력
//   APP_TOKEN=<로그인 토큰> node scripts/app-client.mjs request GET /api/notes   승인 뒤 서명 요청 한 건
//   APP_URL 을 주지 않으면 aleph.config.json 의 publicAppUrl 을 씁니다.
import { readFileSync } from 'node:fs';

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const b64url = bytes => Buffer.from(bytes).toString('base64url');
const sha256Hex = async text => Buffer.from(await subtle.digest('SHA-256', enc.encode(text))).toString('hex');

export async function createAppDevice({ baseUrl, token }) {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const { kty, crv, x, y } = await subtle.exportKey('jwk', pair.publicKey);
  const publicKey = { kty, crv, x, y };
  const deviceId = (await sha256Hex(`${crv}.${x}.${y}`)).slice(0, 16);
  const sign = async message => b64url(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, enc.encode(message)));
  let grant = null;
  const auth = { Authorization: `Bearer ${token}` };
  const proof = async action => { const timestamp = String(Date.now());
    return { publicKey, timestamp, signature: await sign(`aleph-device-v1|${action}|${deviceId}|${timestamp}`) }; };
  const device = async (action, extra = {}) => {
    const response = await fetch(new URL(`/api/device/${action}`, baseUrl), { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ ...(await proof(action)), ...extra }) });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  // 서명 머리글: 메서드·경로·본문 해시·시각·기기 ID 를 기기 키로 서명하고, 서버 승인 증표를 함께 보냅니다.
  const signedHeaders = async (method, path, bodyText = '') => { const timestamp = String(Date.now());
    return { 'X-Aleph-Device': deviceId, 'X-Aleph-Timestamp': timestamp, 'X-Aleph-Grant': grant ?? '',
      'X-Aleph-Signature': await sign(`aleph-request-v1|${method}|${path}|${await sha256Hex(bodyText)}|${timestamp}|${deviceId}`) }; };
  // signAs 로 서명한 뒤 sendAs 로 바꿔 보내면 「서명 뒤 경로·본문 변경」 공격을 흉내 냅니다.
  const send = async ({ method = 'GET', path, body, signed = true, signAs = {}, sendAs = {}, headers = {} }) => {
    const bodyText = body === undefined ? '' : JSON.stringify(body);
    const sig = signed ? await signedHeaders(signAs.method ?? method, signAs.path ?? path,
      signAs.body === undefined ? bodyText : JSON.stringify(signAs.body)) : {};
    const finalBody = sendAs.body === undefined ? bodyText : JSON.stringify(sendAs.body);
    const response = await fetch(new URL(sendAs.path ?? path, baseUrl), { method,
      headers: { 'Content-Type': 'application/json', ...auth, ...sig, ...headers }, body: finalBody || undefined });
    const parsed = await response.json().catch(() => null);
    return { status: response.status, error: parsed?.error ?? null, body: parsed };
  };
  return {
    deviceId,
    status: () => device('status', grant ? { grant } : {}),
    register: async () => { const result = await device('register'); if (result.body?.grant) grant = result.body.grant; return result; },
    send,
    forgeGrant: () => { grant = 'forged.grant'; },
  };
}

async function check(baseUrl, token) {
  const app = await createAppDevice({ baseUrl, token });
  const rows = [];
  const row = (name, expected, got) => rows.push({ name, expected, got, pass: expected === got });
  row('승인 전 상태 확인 → approved 아님', 'false', String((await app.status()).body?.approved === true));
  const reg = await app.register();
  row('승인 요청(서버·판정기 결정) → approved', 'true', String(reg.body?.approved === true));
  row('승인 후 상태 확인 → approved', 'true', String((await app.status()).body?.approved === true));
  const ok = await app.send({ path: '/api/notes' });
  row('정상: 서명한 보호 요청 GET /api/notes → 200', '200', String(ok.status));
  const unsigned = await app.send({ path: '/api/notes', signed: false });
  row('공격: 설치형 앱 서명 없이 보호 요청 → 403', '403 device_signature_required', `${unsigned.status} ${unsigned.error}`);
  const other = '/api/notes/00000000-0000-4000-8000-000000000000';
  const moved = await app.send({ path: '/api/notes', sendAs: { path: other } });
  row('공격: 서명 뒤 요청 경로 변경 → 401', '401 device_signature_invalid', `${moved.status} ${moved.error}`);
  const note = { title: '서명 시험 메모', body: '공개 가능한 가상 메모입니다.' };
  const changed = await app.send({ method: 'POST', path: '/api/notes', body: note, sendAs: { body: { ...note, body: '서명 뒤 바꾼 본문' } } });
  row('공격: 서명 뒤 수정 본문 변경 → 401', '401 device_signature_invalid', `${changed.status} ${changed.error}`);
  app.forgeGrant();
  const forged = await app.send({ path: '/api/notes' });
  row('공격: 위조 승인 증표 → 401', '401 device_not_registered', `${forged.status} ${forged.error}`);
  return { baseUrl, deviceId: app.deviceId, rows };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('app-client.mjs')) {
  const [command = 'check', method = 'GET', path = '/api/notes'] = process.argv.slice(2);
  const baseUrl = process.env.APP_URL
    || JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8')).publicAppUrl;
  const token = process.env.APP_TOKEN;
  if (!token) {
    process.stderr.write('APP_TOKEN 환경변수에 로그인 토큰을 넣어 주세요(출력하지 않습니다).\n');
    process.exitCode = 1;
  } else if (command === 'request') {
    const app = await createAppDevice({ baseUrl, token });
    await app.register();
    const result = await app.send({ method, path });
    process.stdout.write(`${JSON.stringify({ status: result.status, error: result.error })}\n`);
  } else {
    const result = await check(baseUrl, token);
    for (const item of result.rows) process.stdout.write(`${item.pass ? '통과' : '확인 필요'} · ${item.name} (기대 ${item.expected} / 실제 ${item.got})\n`);
    if (result.rows.some(item => !item.pass)) process.exitCode = 1;
  }
}
