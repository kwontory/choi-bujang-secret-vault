// 8단계 강사 자료 구역(/api/materials, /api/materials/:id): 판정기와 같이 모든 요청을 거부합니다.
// 로그인 없는 요청은 401, 로그인한 요청도 자료 없이 403 instructor_material_denied 입니다.
import { json, serverRuntime } from '../src/zone-api.mjs';
import { authorize } from '../src/authorize.mjs';

export default async function handler(request, response) {
  const active = serverRuntime();
  if (!active) return json(response, 503, { error: 'server_not_configured' });
  const identity = await active.verifyLogin(request.headers?.authorization);
  if (!identity) return json(response, 401, { error: 'login_required' });
  // 요청 본문·헤더의 역할 값과 상관없이 강사 자료는 내보내지 않습니다. 판정기 결정을 그대로 돌려줍니다.
  const routeId = typeof request.query?.id === 'string' ? request.query.id : null;
  // 기기 승인과 상관없이 구역 규칙(zone_instructor_materials_closed)이 거부하는지 판정기에 확인합니다.
  const verdict = await authorize({ identity, method: request.method,
    apiPath: routeId ? `/api/materials/${routeId}` : '/api/materials', deviceRegistered: true });
  return json(response, 403, { error: verdict.decision === 'deny' ? verdict.reasonCode : 'instructor_material_denied',
    ruleIds: verdict.ruleIds });
}
