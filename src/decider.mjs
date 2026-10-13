// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// docs/DECIDER_REQUEST.md 의 aleph.decision.v1 요청 이름만 읽습니다.
// 요청 본문의 사용자 번호, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
//
// starter.deny        : 어떤 규칙에도 해당하지 않는 요청은 거부하는 시작 기본값
// device_registered   : 6단계 · 등록된 기기에서 온 내 자료실 읽기만 허용
export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered']);

const SCHEMA = 'aleph.decision.v1';
const DEVICE_ID = /^[0-9a-f]{16}$/u;
const READ_METHODS = new Set(['GET']);

const respond = (requestId, decision, reasonCode, ruleId) => ({
  schema: SCHEMA,
  requestId,
  decision,
  reasonCode,
  ruleIds: [ruleId],
});

export async function decide(request) {
  // 계약에 있는 이름만 꺼냅니다. 값이 없거나 형식이 다르면 등록 기기로 보지 않습니다.
  const { requestId = null, deviceId, deviceRegistered, method } =
    request && typeof request === 'object' && !Array.isArray(request) ? request : {};

  // 6단계: 기기 등록 여부가 정확히 true 이고 기기 ID 형식이 맞을 때만 다음 판단으로 넘어갑니다.
  if (deviceRegistered !== true || typeof deviceId !== 'string' || !DEVICE_ID.test(deviceId)) {
    return respond(requestId, 'deny', 'device_not_registered', 'device_registered');
  }

  // 등록 기기의 내 자료실 읽기만 허용합니다.
  if (typeof method === 'string' && READ_METHODS.has(method)) {
    return respond(requestId, 'allow', 'approved', 'device_registered');
  }

  // 그 밖의 요청은 시작 기본값대로 거부합니다.
  return respond(requestId, 'deny', 'starter_not_ready', 'starter.deny');
}
