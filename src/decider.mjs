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

const WRITE_METHODS = Object.freeze(['POST', 'PUT', 'PATCH', 'DELETE']);
const METHODS = Object.freeze(['GET', ...WRITE_METHODS]);
const NOTES_ZONE = Object.freeze({
  ruleId: 'zone_notes_item_only', prefix: '/notes',
  collection: Object.freeze([]), item: Object.freeze(['GET', 'PUT', 'DELETE']),
  collectionDenied: 'note_list_denied', writeDenied: null, allDenied: null,
});
const ANNOUNCEMENTS_ZONE = Object.freeze({
  ruleId: 'zone_announcements_read_only', prefix: '/announcements',
  collection: Object.freeze(['GET']), item: Object.freeze(['GET']),
  collectionDenied: null, writeDenied: 'announcement_write_denied', allDenied: null,
});
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

function readContext(signals) {
  if (!isPlainObject(signals) || typeof signals.source !== 'string') {
    return { trusted: false, unclear: true, reasons: ['signals_missing'] };
  }
  const { source, region, network, hour } = signals;
  if (source === NO_SIGNAL_SOURCE) {
    const consistent = region === UNKNOWN && network === UNKNOWN;
    return { trusted: false, unclear: !consistent, reasons: consistent ? [] : ['signals_source_mismatch'] };
  }
  if (source !== VERIFIED_SIGNAL_SOURCE) {
    return { trusted: false, unclear: true, reasons: ['signals_untrusted_source'] };
  }
  const reasons = [];
  if (region !== USUAL_REGION) reasons.push(typeof region === 'string' && region !== UNKNOWN ? 'region_changed' : 'region_unknown');
  if (network !== USUAL_NETWORK) reasons.push(typeof network === 'string' && network !== UNKNOWN ? 'network_unusual' : 'network_unknown');
  if (!isWholeNumber(hour, 0, 23)) reasons.push('hour_unknown');
  else if (hour < USUAL_HOURS.from || hour > USUAL_HOURS.to) reasons.push('hour_unusual');
  return { trusted: true, unclear: false, reasons };
}

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

function freshlyVerified(stepUp) {
  if (!isPlainObject(stepUp) || stepUp.verified !== true) return false;
  return isWholeNumber(stepUp.authAgeSeconds, 0, STEP_UP_FRESH_SECONDS);
}

const stripApi = value => (typeof value === 'string' && value.startsWith('/api/') ? value.slice(4) : value);
const normalizePath = path => stripApi(path);
const normalizeRoute = route => {
  if (typeof route !== 'string') return route;
  const space = route.indexOf(' ');
  return space > 0 ? `${route.slice(0, space)} ${stripApi(route.slice(space + 1))}` : route;
};

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
  return deny('route_not_allowed');
}

export async function decide(request) {
  const {
    requestId = null, deviceId, deviceRegistered, service, method, path: rawPath, route: rawRoute, queryLength,
    stepUp, recentEvents, signals,
  } = isPlainObject(request) ? request : {};

  if (deviceRegistered !== true || typeof deviceId !== 'string' || !DEVICE_ID.test(deviceId)) {
    return respond(requestId, 'deny', 'device_not_registered', ['device_registered']);
  }

  const path = normalizePath(rawPath);
  const route = normalizeRoute(rawRoute);
  if (!checkIntegrity(method, path, route)) {
    return respond(requestId, 'deny', 'request_tampered', ['request_integrity']);
  }

  const zone = checkZone(service, method, path, route, queryLength);
  if (!zone.ok) return respond(requestId, 'deny', zone.reasonCode, [zone.ruleId]);

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

  return respond(requestId, 'allow', 'approved', [...passedRules, zone.ruleId]);
}
