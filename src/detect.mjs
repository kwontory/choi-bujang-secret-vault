// 9단계 학생 탐지 규칙입니다. docs/DETECT_EVENTS.md 의 가상 사건을 받습니다.
// 반 엔진이 검증해 넘긴 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.
// 이 파일은 다른 파일·패키지를 불러오지 않고, 파일·네트워크를 쓰지 않으며, 상태를 남기지 않습니다.
//
// 결과는 판정기(src/decider.mjs)의 허용·거부 응답과 별개인 「탐지 결과」입니다.
//   정상          : { action: 'observe' }
//   복합 의심     : { action: 'propose_revocation', reasonCode: 'burst_read', subject, deviceId? }
// 회수는 제안만 합니다. 실제 회수·경과 시간 측정은 반 엔진과 심판이 맡습니다.

const WINDOW_MS = 10 * 60 * 1000;  // 어느 10분 구간이든 (시작 시각 포함, 끝 시각 제외)
const BURST_LIMIT = 120;           // 120건을 넘을 때만 다량 조회 (정확히 120건은 제외)
const REASON_CODE = 'burst_read';
const READ_METHODS = new Set(['GET']);
const PSEUDONYM = /^[^\s@]{1,200}$/u;                   // 가명 ID: 공백·@ 없는 짧은 문자열
const SECRET_LIKE = /^eyJ|^Bearer|^sb_secret_|^sk-|PRIVATE KEY/iu; // 토큰·키처럼 보이면 버립니다
const safeId = value => typeof value === 'string' && PSEUDONYM.test(value) && !SECRET_LIKE.test(value);
const USUAL = 'usual';
const UNKNOWN = 'unknown';

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// 제작 1: 사건에서 가명 사용자·기기·요청 종류·판정·시각·네트워크만 꺼냅니다.
// 메모 본문, 토큰, 실명 같은 다른 값은 읽거나 저장하거나 돌려주지 않습니다.
function normalizeEvent(event) {
  if (!isPlainObject(event)) return null;
  // 가명 사용자: 계약의 identity.sub, 없으면 판정기 요청과 같은 이름의 subjectId
  const sub = isPlainObject(event.identity) && event.identity.sub !== undefined
    ? event.identity.sub : event.subjectId;
  if (!safeId(sub)) return null;
  const at = typeof event.at === 'string' ? Date.parse(event.at) : Number.NaN;
  if (!Number.isFinite(at)) return null;
  const method = typeof event.method === 'string' ? event.method.toUpperCase() : '';
  const deviceId = safeId(event.deviceId) ? event.deviceId : null;
  const decision = typeof event.decision === 'string' ? event.decision : null;
  const rawNetwork = typeof event.network === 'string' ? event.network
    : isPlainObject(event.signals) && typeof event.signals.network === 'string'
      ? event.signals.network : null;
  // 네트워크: usual(평소) · unusual(평소와 다름) · null(정보 없음 또는 unknown)
  const network = rawNetwork === null || rawNetwork === '' || rawNetwork === UNKNOWN ? null
    : rawNetwork === USUAL ? USUAL : 'unusual';
  return { sub, at, method, deviceId, decision, network };
}

// 한 사용자의 조회 중 가장 많이 몰린 10분 구간을 찾습니다.
function busiestWindow(reads) {
  let best = { count: 0, from: 0, to: 0 };
  let start = 0;
  for (let end = 0; end < reads.length; end += 1) {
    while (reads[end].at - reads[start].at >= WINDOW_MS) start += 1;
    const count = end - start + 1;
    if (count > best.count) best = { count, from: start, to: end };
  }
  return best;
}

// 제작 3: 회수 대상은 의심 구간에서 가장 많이 나온 확인된 가상 기기 한 개로 한정합니다.
function targetDevice(windowReads) {
  const counts = new Map();
  for (const item of windowReads) {
    if (!item.deviceId) continue;
    const weight = item.network === 'unusual' ? 2 : 1; // 평소와 다른 네트워크의 기기를 먼저 고릅니다
    counts.set(item.deviceId, (counts.get(item.deviceId) ?? 0) + weight);
  }
  let chosen = null;
  for (const [deviceId, count] of counts) {
    if (!chosen || count > chosen.count) chosen = { deviceId, count };
  }
  return chosen?.deviceId ?? null;
}

export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');

  // 사용자별로 조회(GET) 사건만 모읍니다. 다른 사용자의 사건은 합산하지 않습니다.
  const bySubject = new Map();
  for (const raw of events) {
    const event = normalizeEvent(raw);
    if (!event || !READ_METHODS.has(event.method)) continue;
    if (!bySubject.has(event.sub)) bySubject.set(event.sub, []);
    bySubject.get(event.sub).push(event);
  }

  let suspect = null;
  for (const [sub, all] of bySubject) {
    // 제작 2: 평소와 다른 네트워크와 갑작스러운 다량 조회가 함께일 때만 의심합니다.
    // - 평소 네트워크(usual)로 확인된 조회는 다량 조회 수에 넣지 않습니다.
    // - 네트워크 정보가 있는 사용자는 의심 구간 안에 평소와 다른 네트워크 조회가 있어야 합니다.
    // - 네트워크 정보가 전혀 없는 연습 사건(docs/DETECT_EVENTS.md)은 다량 조회 기준만 씁니다.
    // - 지역 값은 읽지 않으므로 지역 하나만으로 회수를 제안하지 않습니다.
    const hasNetworkInfo = all.some(item => item.network !== null);
    const reads = all.filter(item => item.network !== USUAL).sort((a, b) => a.at - b.at);
    if (reads.length <= BURST_LIMIT) continue;
    const window = busiestWindow(reads);
    if (window.count <= BURST_LIMIT) continue;
    const windowReads = reads.slice(window.from, window.to + 1);
    if (hasNetworkInfo && !windowReads.some(item => item.network === 'unusual')) continue;
    const candidate = { sub, count: window.count, firstAt: windowReads[0].at, windowReads };
    // 여러 사용자가 동시에 의심되면 가장 많이 몰린 사용자, 같으면 먼저 시작한 사용자 하나만 제안합니다.
    if (!suspect || candidate.count > suspect.count
        || (candidate.count === suspect.count && candidate.firstAt < suspect.firstAt)) {
      suspect = candidate;
    }
  }

  if (!suspect) return { action: 'observe' };
  const proposal = { action: 'propose_revocation', reasonCode: REASON_CODE, subject: suspect.sub };
  const deviceId = targetDevice(suspect.windowReads);
  if (deviceId) proposal.deviceId = deviceId;
  return proposal;
}
