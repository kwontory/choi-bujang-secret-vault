// 12단계 실측 표: 1~11단계 정상·금지 요청을 실제 배포에 보내 기대·실제 결과·요청 ID·확인 시각을 한 표로 남깁니다.
//   npm run ops:table                       로그인 없이 보낼 수 있는 요청만 실측, 나머지는 미실행
//   OPS_A_EMAIL=… OPS_A_PASSWORD=… [OPS_B_EMAIL=… OPS_B_PASSWORD=…] npm run ops:table   시험 계정으로 로그인 요청까지 실측
// 비밀번호·토큰·기기 키·메모 본문은 출력하거나 파일에 쓰지 않습니다. 결과는 artifacts/ops-table.json(커밋하지 않음)에 씁니다.
// 실행하지 않은 시험(심판 총공세 41종 포함)은 미실행으로 남기고 통과로 바꾸지 않습니다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ANON_CASES, runCase } from '../public/ops-cases.js';
import { createAppDevice } from './app-client.mjs';

const root = new URL('../', import.meta.url);
const baseUrl = process.env.APP_URL || JSON.parse(readFileSync(new URL('aleph.config.json', root), 'utf8')).publicAppUrl;
const rows = [];
const skip = (stage, kind, label, why) => rows.push({ stage, kind, label, request: why, expected: '-', actual: '-', result: '미실행', requestId: '-', at: '-' });

async function login(email, password) {
  const response = await fetch(new URL('/api/auth', baseUrl), { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }) });
  const body = await response.json().catch(() => null);
  return response.ok && typeof body?.access_token === 'string' ? body.access_token : null;
}

// 서명 요청 한 건을 보내고 표 한 줄로 남깁니다(응답 본문은 남기지 않고 오류 코드만).
async function signedRow(app, stage, kind, label, request, expected, ok, options) {
  const at = new Date().toISOString();
  const result = await app.send(options);
  rows.push({ stage, kind, label, request, expected, actual: `HTTP ${result.status}${result.error ? ` ${result.error}` : ''}`,
    result: ok(result) ? '확인' : '불일치', requestId: result.requestId ?? '없음', at });
  return result;
}

for (const item of ANON_CASES) rows.push(await runCase(baseUrl, item));

const tokenA = process.env.OPS_A_EMAIL && process.env.OPS_A_PASSWORD ? await login(process.env.OPS_A_EMAIL, process.env.OPS_A_PASSWORD) : null;
if (!tokenA) {
  for (const [stage, kind, label] of [[3, '정상', '승인 기기의 내 메모 목록'], [4, '정상', '내 메모 추가·조회·수정·삭제'],
    [4, '금지', '다른 계정 메모 조회'], [8, '금지', '로그인한 학생의 전체 목록·공지 쓰기·강사 자료'],
    [11, '금지', '서명 없는 보호 요청'], [11, '금지', '서명 뒤 경로·본문 변경, 위조 승인 증표']]) skip(stage, kind, label, '시험 계정 A 없음');
} else {
  const app = await createAppDevice({ baseUrl, token: tokenA });
  const registered = await app.register();
  rows.push({ stage: 11, kind: '정상', label: '기기 승인 요청(서버·판정기 결정)', request: 'POST /api/device/register', expected: '200 · approved',
    actual: `HTTP ${registered.status}`, result: registered.body?.approved === true ? '확인' : '불일치', requestId: '없음', at: new Date().toISOString() });
  const noteId = randomUUID();
  const note = { title: '탈환 작전실 실측 메모', body: '공개 가능한 가상 메모입니다.' };
  await signedRow(app, 3, '정상', '승인 기기의 내 메모 목록', 'GET /api/my/notes', '200', r => r.status === 200, { path: '/api/my/notes' });
  await signedRow(app, 4, '정상', '내 메모 추가', 'PUT /api/notes/:id', '201', r => r.status === 201, { method: 'PUT', path: `/api/notes/${noteId}`, body: note });
  await signedRow(app, 4, '정상', '내 메모 한 건 조회', 'GET /api/notes/:id', '200', r => r.status === 200, { path: `/api/notes/${noteId}` });
  await signedRow(app, 8, '정상', '반 공지 읽기', 'GET /api/announcements', '200', r => r.status === 200, { path: '/api/announcements' });
  await signedRow(app, 8, '금지', '로그인한 학생의 전체 메모 목록', 'GET /api/notes', '403', r => r.status === 403, { path: '/api/notes' });
  await signedRow(app, 8, '금지', '로그인한 학생의 공지 쓰기', 'POST /api/announcements', '403', r => r.status === 403, { method: 'POST', path: '/api/announcements', body: { title: 'x', body: 'x' } });
  await signedRow(app, 8, '금지', '로그인한 학생의 강사 자료', 'GET /api/materials/:id', '403', r => r.status === 403, { path: `/api/materials/${randomUUID()}` });
  await signedRow(app, 11, '금지', '서명 없는 보호 요청', 'GET /api/my/notes', '403', r => r.status === 403, { path: '/api/my/notes', signed: false });
  await signedRow(app, 11, '금지', '서명 뒤 요청 경로 변경', 'GET /api/notes/:id', '401', r => r.status === 401, { path: '/api/my/notes', sendAs: { path: `/api/notes/${noteId}` } });
  await signedRow(app, 11, '금지', '서명 뒤 수정 본문 변경', 'PUT /api/notes/:id', '401', r => r.status === 401,
    { method: 'PUT', path: `/api/notes/${noteId}`, body: note, sendAs: { body: { ...note, body: '서명 뒤 바꾼 본문' } } });
  const tokenB = process.env.OPS_B_EMAIL && process.env.OPS_B_PASSWORD ? await login(process.env.OPS_B_EMAIL, process.env.OPS_B_PASSWORD) : null;
  if (tokenB) {
    const other = await createAppDevice({ baseUrl, token: tokenB });
    await other.register();
    await signedRow(other, 4, '금지', '다른 계정 메모 조회', 'GET /api/notes/:id', '404', r => r.status === 404, { path: `/api/notes/${noteId}` });
  } else skip(4, '금지', '다른 계정 메모 조회', '시험 계정 B 없음');
  await signedRow(app, 4, '정상', '내 메모 삭제(시험 메모 정리)', 'DELETE /api/notes/:id', '200', r => r.status === 200, { method: 'DELETE', path: `/api/notes/${noteId}` });
  app.forgeGrant();
  await signedRow(app, 11, '금지', '위조 승인 증표', 'GET /api/my/notes', '401', r => r.status === 401, { path: '/api/my/notes' });
}
skip(10, '정상', '변조된 내 메모 한 건 복원', '시험 계정 B의 변조 메모 필요(로컬 npm run restore:test 별도)');
skip(11, '금지', '회수된 기기로 다시 요청', '강사 계정의 회수 처리 필요');
skip(12, '총공세', '심판 총공세 41종', '심판 실행');
rows.sort((a, b) => a.stage - b.stage);

const table = { schema: 'aleph.ops-table.v1', baseUrl, checkedAt: new Date().toISOString(), rows,
  counts: Object.fromEntries(['확인', '불일치', '미실행'].map(key => [key, rows.filter(row => row.result === key).length])) };
mkdirSync(new URL('artifacts/', root), { recursive: true });
writeFileSync(new URL('artifacts/ops-table.json', root), `${JSON.stringify(table, null, 2)}\n`, 'utf8');
process.stdout.write('| 단계 | 구분 | 요청 | 기대 | 실제 | 판정 | 요청 ID | 확인 시각 |\n|---|---|---|---|---|---|---|---|\n');
for (const r of rows) process.stdout.write(`| ${r.stage} | ${r.kind} | ${r.label} (${r.request}) | ${r.expected} | ${r.actual} | ${r.result} | ${r.requestId} | ${r.at} |\n`);
process.stdout.write(`확인 ${table.counts['확인']} · 불일치 ${table.counts['불일치']} · 미실행 ${table.counts['미실행']} → artifacts/ops-table.json\n`);
if (table.counts['불일치'] > 0) process.exitCode = 1;
