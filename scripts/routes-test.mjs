// 경로 일치 점검: 선언(aleph.config.json allowedRoutes) = API 경로 표(src/authorize.mjs) = 판정기 허용 = 실제 API 파일·연결.
// 경로 불일치, 경로 선언 누락, 쓰지 않는 허용, 목록 경로 구분을 한 번에 확인합니다(인터넷 불필요).
import { existsSync, readFileSync } from 'node:fs';
import { API_ROUTES, authorize, routeOf } from '../src/authorize.mjs';

const root = new URL('..', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const config = JSON.parse(read('aleph.config.json'));
const vercel = JSON.parse(read('vercel.json'));
const app = read('public/app.js');
const identity = { userId: '11111111-1111-4111-8111-111111111111' };
const results = [];
const check = (name, passed, detail = '') => results.push({ name, passed: Boolean(passed), detail });
const sameList = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

check('allowedRoutes = API 경로 표(src/authorize.mjs)', sameList(config.allowedRoutes, API_ROUTES),
  `${config.allowedRoutes.length}/${API_ROUTES.length}`);
// 선언한 경로마다: 판정기 허용, API 파일 존재(또는 연결)
const fileFor = apiPath => {
  const concrete = apiPath.replace(':id', 'sample-id');
  for (const rule of vercel.rewrites) {
    const pattern = new RegExp(`^${rule.source.replace(':id', '[^/]+')}$`);
    if (pattern.test(concrete)) return `${rule.destination.split('?')[0]}.js`.replace(/^\//, '');
  }
  return `${apiPath.replace(/^\//, '')}.js`;
};
for (const declared of config.allowedRoutes) {
  const [method, apiPath] = declared.split(' ');
  const concrete = apiPath.replace(':id', method === 'POST' && apiPath.startsWith('/api/device/') ? '' : 'sample-id');
  const verdict = await authorize({ identity, method, apiPath: concrete, deviceRegistered: true });
  check(`판정기 허용: ${declared}`, verdict.decision === 'allow', verdict.reasonCode);
  const file = fileFor(apiPath);
  check(`API 파일 연결: ${declared} → ${file}`, existsSync(new URL(file, root)));
}
// 선언하지 않은 경로는 판정기가 거부(목록 경로 구분 포함)
for (const [method, apiPath, reason] of [
  ['GET', '/api/notes', 'note_list_denied'], ['POST', '/api/notes', 'note_list_denied'],
  ['PATCH', '/api/notes/sample-id', 'route_not_allowed'], ['GET', '/api/notes/sample-id/export', 'request_tampered'],
  ['POST', '/api/my/notes', 'route_not_allowed'], ['PUT', '/api/announcements/sample-id', 'announcement_write_denied'],
  ['POST', '/api/announcements', 'announcement_write_denied'], ['GET', '/api/materials/sample-id', 'instructor_material_denied'],
  ['GET', '/api/restore/notes/sample-id', 'route_not_allowed'], ['POST', '/api/device/approve', 'route_not_allowed'],
  ['GET', '/api/unknown', 'starter_not_ready'],
]) {
  const verdict = await authorize({ identity, method, apiPath, deviceRegistered: true });
  check(`선언 밖 거부: ${method} ${apiPath} → ${reason}`, verdict.decision === 'deny' && verdict.reasonCode === reason, verdict.reasonCode);
}
// 승인 안 된 기기는 선언한 경로도 거부
const unapproved = await authorize({ identity, method: 'GET', apiPath: '/api/my/notes', deviceRegistered: false });
check('승인 안 된 기기: GET /api/my/notes → device_not_registered', unapproved.reasonCode === 'device_not_registered');
// 접속 앱 화면이 실제로 부르는 보호 경로가 모두 선언돼 있는지(쓰지 않는 허용·선언 누락)
const used = new Set();
if (/api\('\/my\/notes'/.test(app) || app.includes("'/api/my/notes'")) used.add('GET /api/my/notes');
if (app.includes("method: 'PUT'")) used.add('PUT /api/notes/:id');
if (app.includes("method: 'DELETE'")) used.add('DELETE /api/notes/:id');
if (app.includes('/api/announcements')) used.add('GET /api/announcements');
if (app.includes('/api/device/${action}')) { used.add('POST /api/device/register'); used.add('POST /api/device/status'); }
for (const route of used) check(`화면이 쓰는 경로가 선언됨: ${route}`, config.allowedRoutes.includes(route));
check('restoreRoute 가 선언 목록에 있음', config.allowedRoutes.includes(config.restoreRoute), config.restoreRoute);
check('경로 모양 풀이: /api/my/notes 는 목록, /api/notes 와 구분',
  routeOf('GET', '/api/my/notes').service === 'my_notes' && routeOf('GET', '/api/notes').route === 'GET /notes');

for (const item of results) process.stdout.write(`${item.passed ? '통과' : '확인 필요'} · ${item.name}${item.passed ? '' : ` (${item.detail})`}\n`);
if (results.some(item => !item.passed)) process.exitCode = 1;
