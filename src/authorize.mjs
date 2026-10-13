// 전역 접근 통제: 모든 보호 API 는 같은 판정기(src/decider.mjs)에 묻고 그 결정대로만 응답합니다.
// API 경로 표(API_ROUTES) = aleph.config.json allowedRoutes = 판정기 구역표에서 허용하는 경로 (scripts/routes-test.mjs 가 대조)
import { createHash, randomUUID } from 'node:crypto';
import { decide } from './decider.mjs';

const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');

// 판정기가 허용하는 경로만 적습니다. 그 밖의 경로·메서드는 판정기가 거부합니다.
export const API_ROUTES = Object.freeze([
  'GET /api/notes/:id', 'PUT /api/notes/:id', 'DELETE /api/notes/:id',
  'GET /api/my/notes',
  'GET /api/announcements', 'GET /api/announcements/:id',
  'POST /api/restore/notes/:id',
  'POST /api/device/register', 'POST /api/device/status',
]);

// 서비스별 경로 머리. 머리 그 자체는 목록 경로, 한 단계 더 깊으면 /:id 경로입니다.
const SERVICES = Object.freeze([
  { service: 'my_notes', prefix: '/my/notes' },
  { service: 'restore', prefix: '/restore/notes' },
  { service: 'notes', prefix: '/notes' },
  { service: 'announcements', prefix: '/announcements' },
  { service: 'materials', prefix: '/materials' },
  { service: 'device', prefix: '/device' },
]);

// /api/notes/abc → { service: 'notes', path: '/notes/abc', route: 'GET /notes/:id' }
export function routeOf(method, apiPath) {
  const path = typeof apiPath === 'string' && apiPath.startsWith('/api/') ? apiPath.slice(4) : apiPath;
  for (const { service, prefix } of SERVICES) {
    if (path === prefix) return { service, path, route: `${method} ${prefix}` };
    if (typeof path === 'string' && path.startsWith(`${prefix}/`)) return { service, path, route: `${method} ${prefix}/:id` };
  }
  return { service: 'unknown', path, route: `${method} ${path}` };
}

// 서버가 확인한 사실(로그인 사용자, 서버가 승인한 기기인지)만 담아 판정기에 묻습니다.
export async function authorize({ identity, method, apiPath, deviceId, deviceRegistered, now = new Date() }) {
  const { service, path, route } = routeOf(method, apiPath);
  return decide({
    schema: 'aleph.decision.v1', requestId: randomUUID(), classId: 'student_app',
    projectId: 'choi-bujang-secret-vault', subjectId: sha256(`subject:${identity?.userId ?? ''}`).slice(0, 32),
    deviceId: typeof deviceId === 'string' ? deviceId : '0'.repeat(16), service, method, path, route,
    queryLength: 0, querySha256: sha256(''), at: now.toISOString(), policyRevision: 1,
    deviceRegistered: deviceRegistered === true,
    stepUp: { verified: false, authAgeSeconds: null }, recentEvents: [],
    signals: { source: 'none', region: 'unknown', network: 'unknown', hour: now.getUTCHours() },
  });
}
