// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// docs/DECIDER_REQUEST.md 의 aleph.decision.v1 요청 이름만 읽습니다.
// 요청 본문의 사용자 번호, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
//
// starter.deny        : 어떤 규칙에도 해당하지 않는 요청은 거부하는 시작 기본값
// device_registered   : 6단계 · 등록된 기기에서 온 내 자료실 읽기만 허용
// step_up_required    : 7단계 · 평소와 다른 접속(지역·시각·네트워크·행동)은 다시 로그인 확인
export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered', 'step_up_required']);

const SCHEMA = 'aleph.decision.v1';
const DEVICE_ID = /^[0-9a-f]{16}$/u;
const READ_METHODS = new Set(['GET']);

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

export async function decide(request) {
  // 계약에 있는 이름만 꺼냅니다. 값이 없거나 형식이 다르면 등록 기기로 보지 않습니다.
  const { requestId = null, deviceId, deviceRegistered, method, stepUp, recentEvents, signals } =
    isPlainObject(request) ? request : {};

  // 6단계: 기기 등록 여부가 정확히 true 이고 기기 ID 형식이 맞을 때만 다음 판단으로 넘어갑니다.
  if (deviceRegistered !== true || typeof deviceId !== 'string' || !DEVICE_ID.test(deviceId)) {
    return respond(requestId, 'deny', 'device_not_registered', ['device_registered']);
  }

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

  // 등록 기기의 내 자료실 읽기만 허용합니다.
  if (typeof method === 'string' && READ_METHODS.has(method)) {
    return respond(requestId, 'allow', 'approved', passedRules);
  }

  // 그 밖의 요청은 시작 기본값대로 거부합니다.
  return respond(requestId, 'deny', 'starter_not_ready', ['starter.deny']);
}
