// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// docs/DECIDER_REQUEST.md 의 aleph.decision.v1 요청 이름만 읽습니다.
// 요청 본문의 사용자 번호, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
//
// starter.deny                      : 구역표에 없는 서비스·경로는 거부하는 시작 기본값
// device_registered                 : 6단계 · 등록된 기기에서 온 요청만 다음 판단으로 넘김
// step_up_required                  : 7단계 · 평소와 다른 접속(지역·시각·네트워크·행동)은 다시 로그인 확인
// zone_notes_item_only              : 8단계 · 메모 구역은 자료 ID 하나를 고르는 경로만, 전체 목록은 거부
// zone_announcements_read_only      : 8단계 · 반 공지 구역은 읽기(GET)만, 쓰기는 누구에게나 거부
// zone_instructor_materials_closed  : 8단계 · 강사 자료 구역은 판정기에서 모두 거부
// request_integrity                 : 11단계 · 서명된 요청의 메서드·경로 모양·실제 경로가 서로 맞지 않으면 거부
export const RULE_IDS = Object.freeze([
  'starter.deny', 'device_registered', 'step_up_required',
  'zone_notes_item_only', 'zone_announcements_read_only', 'zone_instructor_materials_closed',
  'request_integrity',
]);

const SCHEMA = 'aleph.decision.v1';
const DEVICE_ID = /^[0-9a-f]{16}$/u;

// 8단계 구역표: 서비스마다 허용하는 정확한 경로 모양과 메서드, 거부 사유를 적습니다.
// 메모 주인 비교는 판정기가 아니라 자료 API(api/notes.js)가 합니다.
// 자료 ID 형식은 좁히지 않습니다. :id 와 같은 깊이에 기능 경로를 두지 않고, 쿼리로 기능을 고르지 않습니다.
const WRITE_METHODS = Object.freeze(['POST', 'PUT', 'PATCH', 'DELETE']);
const METHODS = Object.freeze(['GET', ...WRITE_METHODS]);
const NOTES_ZONE = Object.freeze({
  ruleId: 'zone_notes_item_only', prefix: '/notes',
  collection: Object.freeze([]), item: Object.freeze(['GET', 'PUT', 'DELETE']),
  collectionDenied: 'note_list_denied', writeDenied: null, allDenied: null,
});
// 반 공지 구역: 요청 계약에 역할이 없으므로 쓰기는 누구에게나 거부합니다. 강사의 공지 수정은 서버 관리 경로가 맡습니다.
const ANNOUNCEMENTS_ZONE = Object.freeze({
  ruleId: 'zone_announcements_read_only', prefix: '/announcements',
  collection: Object.freeze(['GET']), item: Object.freeze(['GET']),
  collectionDenied: null, writeDenied: 'announcement_write_denied', allDenied: null,
});
// 강사 자료 구역: 판정기는 어떤 동작도 허용하지 않습니다.
const MATERIALS_ZONE = Object.freeze({
  ruleId: 'zone_instructor_materials_closed', prefix: '/materials',
  collection: Object.freeze([]), item: Object.freeze([]),
  collectionDenied: null, writeDenied: null, allDenied: 'instructor_material_denied',
});
const ZONES = Object.freeze({
  notes: NOTES_ZONE,
  announcements: ANNOUNCEMENTS_ZONE,
  notices: Object.freeze({ ...ANNOUNCEMENTS_ZONE, prefix: '/notices' }),
  materials: MATERIALS_ZONE,
  instructor_materials: Object.freeze({ ...MATERIALS_ZONE, prefix: '/instructor_materials' }),
});

// 7단계 기준값
const VERIFIED_SIGNAL_SOURCE = 'judge_fixture'; // 엔진이 검증해 넘긴 가상 접속 정보
const NO_SIGNAL_SOURCE = 'none';                // 실제 경로: 접속 정보 없음
const UNKNOWN = 'unknown';
const USUAL_REGION = 'local';
const USUAL_NETWORK = 'usual';
const USUAL_HOURS = { from: 6, to: 22 };        // 06:00~22:59 밖은 평소와 다른 시각
const RECENT_WINDOW_SECONDS = 600;              // 최근 10분 안의 사건만 셉니다
const BURST_COUNT = 10;                         // 10분 안 합계 10건 이상이면 대량 행동
const RISK_EVENT_KINDS = new Set(['risk_signal']);
const MAX_RECENT_EVENTS = 12;
const STEP_UP_FRESH_SECONDS = 300;              // 다시 로그인한 지 5분 이내만 인정

const respond = (requestId, decision, reasonCode, ruleIds) => ({
  schema: SCHEMA,
  requestId,
  decision,
  reasonCode,
  ruleIds,
});

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isWholeNumber = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

// 7단계 제작 1: 접속 정보의 출처를 구분합니다.
// 값이 없거나 출처가 불명확하면 정상값으로 채우지 않고 '확인 불가'로 남깁니다.
function readContext(signals) {
  if (!isPlainObject(signals) || typeof signals.source !== 'string') {
    return { trusted: false, unclear: true, reasons: ['signals_missing'] };
  }
  const { source, region, network, hour } = signals;
  if (source === NO_SIGNAL_SOURCE) {
    // 실제 경로는 지역·네트워크를 모릅니다. 다른 값이 섞여 있으면 출처가 불명확한 것입니다.
    const consistent = region === UNKNOWN && network === UNKNOWN;
    return { trusted: false, unclear: !consistent, reasons: consistent ? [] : ['signals_source_mismatch'] };
  }
  if (source !== VERIFIED_SIGNAL_SOURCE) {
    // 클라이언트가 만든 헤더 같은 알 수 없는 출처는 신뢰 정보로 승격하지 않습니다.
    return { trusted: false, unclear: true, reasons: ['signals_untrusted_source'] };
  }
  const reasons = [];
  if (region !== USUAL_REGION) reasons.push(typeof region === 'string' && region !== UNKNOWN ? 'region_changed' : 'region_unknown');
  if (network !== USUAL_NETWORK) reasons.push(typeof network === 'string' && network !== UNKNOWN ? 'network_unusual' : 'network_unknown');
  if (!isWholeNumber(hour, 0, 23)) reasons.push('hour_unknown');
  else if (hour < USUAL_HOURS.from || hour > USUAL_HOURS.to) reasons.push('hour_unusual');
  return { trusted: true, unclear: false, reasons };
}

// 최근 사건에서 위험 신호와 대량 행동을 찾습니다.
function readBehavior(recentEvents) {
  if (!Array.isArray(recentEvents) || recentEvents.length > MAX_RECENT_EVENTS) {
    return { unclear: true, reasons: ['events_invalid'] };
  }
  const reasons = new Set();
  let total = 0;
  for (const item of recentEvents) {
    if (!isPlainObject(item) || typeof item.kind !== 'string'
        || !isWholeNumber(item.ageSeconds, 0, Number.MAX_SAFE_INTEGER)
        || !isWholeNumber(item.count, 0, Number.MAX_SAFE_INTEGER)) {
      return { unclear: true, reasons: ['events_invalid'] };
    }
    if (item.ageSeconds > RECENT_WINDOW_SECONDS) continue;
    total += item.count;
    if (RISK_EVENT_KINDS.has(item.kind) && item.count > 0) reasons.add('risk_event');
  }
  if (total >= BURST_COUNT) reasons.add('burst_activity');
  return { unclear: false, reasons: [...reasons] };
}

// 7단계 제작 3: 엔진이 검증한 새 로그인 시각(stepUp)이 있고 충분히 최근일 때만 다시 확인을 마친 것으로 봅니다.
function freshlyVerified(stepUp) {
  if (!isPlainObject(stepUp) || stepUp.verified !== true) return false;
  return isWholeNumber(stepUp.authAgeSeconds, 0, STEP_UP_FRESH_SECONDS);
}

// 서비스 경로는 /notes/:id 처럼 받지만, 배포 주소 그대로의 /api/notes/:id 모양도 같은 자원으로 읽습니다.
const stripApi = value => (typeof value === 'string' && value.startsWith('/api/') ? value.slice(4) : value);
const normalizePath = path => stripApi(path);
const normalizeRoute = route => {
  if (typeof route !== 'string') return route;
  const space = route.indexOf(' ');
  return space > 0 ? `${route.slice(0, space)} ${stripApi(route.slice(space + 1))}` : route;
};

// 11단계: 엔진이 넘긴 메서드·경로 모양(route)·실제 경로(path)가 서로 맞는지 봅니다.
// 서명 뒤 경로나 메서드를 바꾼 요청은 구역 판단 전에 거부합니다. 쿼리는 8단계 구역 규칙이 거부합니다.
function checkIntegrity(method, path, route) {
  if (typeof method !== 'string' || typeof path !== 'string' || typeof route !== 'string') return false;
  const space = route.indexOf(' ');
  if (space <= 0 || route.slice(0, space) !== method) return false;
  const shape = route.slice(space + 1).split('/');
  const actual = path.split('/');
  if (shape[0] !== '' || actual[0] !== '' || shape.length !== actual.length) return false;
  for (let index = 1; index < shape.length; index += 1) {
    if (!actual[index]) return false;
    if (!shape[index].startsWith(':') && shape[index] !== actual[index]) return false;
  }
  return true;
}

// 8단계: 서비스·메서드·경로 모양·실제 경로가 구역표와 정확히 맞을 때만 통과합니다.
// 막을 때는 「모르는 경로」가 아니라 어느 구역 규칙으로 막았는지 규칙 이름과 사유를 남깁니다.
function checkZone(service, method, path, route, queryLength) {
  const unknown = { ok: false, reasonCode: 'starter_not_ready', ruleId: 'starter.deny' };
  if (typeof service !== 'string' || typeof method !== 'string'
      || typeof path !== 'string' || typeof route !== 'string') return unknown;
  const zone = Object.hasOwn(ZONES, service) ? ZONES[service] : null;
  if (!zone) return unknown;
  const deny = reasonCode => ({ ok: false, reasonCode, ruleId: zone.ruleId });
  if (zone.allDenied) return deny(zone.allDenied);
  if (!METHODS.includes(method)) return deny('route_not_allowed');
  if (zone.writeDenied && WRITE_METHODS.includes(method)) return deny(zone.writeDenied);
  // 쿼리로 기능을 고르지 않습니다. 쿼리가 붙은 요청은 거부합니다.
  if (queryLength !== 0) return deny('route_not_allowed');
  const collectionRoute = `${method} ${zone.prefix}`;
  const itemRoute = `${method} ${zone.prefix}/:id`;
  if (route === collectionRoute) {
    if (!zone.collection.includes(method)) return deny(zone.collectionDenied ?? 'route_not_allowed');
    if (path !== zone.prefix) return deny('route_not_allowed');
    return { ok: true, ruleId: zone.ruleId };
  }
  if (route === itemRoute) {
    const prefix = `${zone.prefix}/`;
    const id = path.startsWith(prefix) ? path.slice(prefix.length) : '';
    if (!id || id.includes('/') || !zone.item.includes(method)) return deny('route_not_allowed');
    return { ok: true, ruleId: zone.ruleId };
  }
  // 구역 안이라도 표에 없는 경로 모양(예: /notes/:id/export)은 거부합니다.
  return deny('route_not_allowed');
}

export async function decide(request) {
  // 계약에 있는 이름만 꺼냅니다. 값이 없거나 형식이 다르면 등록 기기로 보지 않습니다.
  const {
    requestId = null, deviceId, deviceRegistered, service, method, path: rawPath, route: rawRoute, queryLength,
    stepUp, recentEvents, signals,
  } = isPlainObject(request) ? request : {};

  // 6단계: 기기 등록 여부가 정확히 true 이고 기기 ID 형식이 맞을 때만 다음 판단으로 넘어갑니다.
  if (deviceRegistered !== true || typeof deviceId !== 'string' || !DEVICE_ID.test(deviceId)) {
    return respond(requestId, 'deny', 'device_not_registered', ['device_registered']);
  }

  // 11단계: 요청 모양이 서로 맞지 않으면(서명 뒤 변경) 거부합니다.
  const path = normalizePath(rawPath);
  const route = normalizeRoute(rawRoute);
  if (!checkIntegrity(method, path, route)) {
    return respond(requestId, 'deny', 'request_tampered', ['request_integrity']);
  }

  // 8단계: 구역표에 없는 서비스·경로·동작은 다른 판단 전에 거부합니다.
  const zone = checkZone(service, method, path, route, queryLength);
  if (!zone.ok) return respond(requestId, 'deny', zone.reasonCode, [zone.ruleId]);

  // 7단계: 평소와 다른 접속이면 영구 차단하지 않고 다시 로그인 확인을 요구합니다.
  const context = readContext(signals);
  const behavior = readBehavior(recentEvents);
  const unusual = context.unclear || behavior.unclear
    || context.reasons.length > 0 || behavior.reasons.length > 0;
  const passedRules = ['device_registered'];
  if (unusual) {
    if (!freshlyVerified(stepUp)) {
      return respond(requestId, 'step_up', 'step_up_required', ['step_up_required']);
    }
    passedRules.push('step_up_required');
  }

  // 등록 기기 + 허용 구역 + (필요하면) 다시 확인을 모두 통과한 요청만 허용합니다.
  return respond(requestId, 'allow', 'approved', [...passedRules, zone.ruleId]);
}
