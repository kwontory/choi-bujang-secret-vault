// 보너스 모듈 · 권한 가로채기(privilege) 경보 판정  (제작 3)
//
// 계정·그룹 변경 경보와 관리자 권한 사용 경보 하나(alert)를 아래 패턴(xdr/privilege/patterns.json 을 옮겨 적은 상수)과
// 맞춰 확신도(confidence, 0~1)를 매기고 행동을 나눕니다.
//   - confidence >= 0.85 → block  (높은 심각도 + 관리자 그룹 추가·처음 보는 관리자 명령·시간 밖 사용 등 뚜렷한 신호)
//   - confidence >= 0.5  → alert  (T1068/T1078 태그는 있지만 신호가 약함 → 사람 확인)
//   - 그 아래            → record (로그인·조회·비밀번호 변경·수업용 관리 계정의 평소 사용 등 정상 이벤트)
// 이 파일은 다른 파일·패키지를 불러오지 않고, 파일·네트워크를 쓰지 않는 순수 계산만 합니다.
// 판정기 규칙(src/decider.mjs)을 대신하지 않으며, 세션 회수·알림 기록은 respond.mjs 가 맡습니다. 경보 원본은 고치지 않습니다.

// ── 제작 2 · 패턴 목록 (근거: MITRE ATT&CK T1068, T1078) ──
const PATTERNS = Object.freeze({
  ADMIN_GROUP_ADD: { name: '관리자 그룹 추가', basis: 'T1078 / T1098.007' },
  NEW_ADMIN_COMMAND: { name: '처음 보는 관리자 명령', basis: 'T1068' },
  OFF_HOURS: { name: '업무 시간 밖 권한 사용', basis: 'T1078' },
  SUSPECT: { name: '권한 상승 의심', basis: 'T1068 / T1078 태그' },
  NORMAL: { name: '정상 이벤트', basis: '정보성' },
});

const TECHNIQUES = ['T1068', 'T1078', 'T1098'];
const CLEAR_LEVEL = 10;
const INFO_LEVEL = 3;
const REPEAT_MIN = 2;

const ADMIN_GROUP = /^(administrators|admins?|domain admins|enterprise admins|wheel|sudo)$/i;
const ADMIN_GROUP_DESC = /관리자 그룹에 (?:추가|들어|다시)|관리자로 들어/;
const NOT_ADMIN_GROUP = /관리자 그룹은 아닙니다|관리자 그룹이 아닙니다/;
const ADMIN_COMMAND = /관리자 명령|권한 명령|관리자 권한으로 바뀌/;
const UNUSUAL_SOURCE = /원격 주소|처음 보는 주소|주소는 처음|다른 계정의 권한|방금 관리자가 된|곧바로|같은 주소에서 계정 \d+개|다시 관리자/;
const OFF_HOURS = /수업 시간 밖|업무 시간 밖|업무처럼 보이지 않는 시각|새벽|심야/;
const USUAL = /평소 주소|수업 중|수업 시간에|취소|실패|변경은 없|설명만/;

const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, Math.round(n * 100) / 100));
}

function act(confidence, names, detail) {
  let action = 'record';
  if (confidence >= BLOCK_AT) action = 'block';
  else if (confidence >= ALERT_AT) action = 'alert';
  return { action, confidence, reason: `${names.join('+')}: ${detail}` };
}

export function decide(alert) {
  const level = toNum(alert?.rule?.level);
  const count = toNum(alert?.data?.count);
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre.map(String) : [];
  const tagged = mitre.some((m) => TECHNIQUES.some((t) => m.startsWith(t)));
  const desc = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const group = typeof alert?.data?.group === 'string' ? alert.data.group : '';

  // (1) 정보성 이벤트(레벨 3 이하) 또는 권한 기법 태그 없음 → 기록
  if (level <= INFO_LEVEL || !tagged) {
    return act(0.1, [PATTERNS.NORMAL.name], `정보성 이벤트(레벨 ${level}) — 정상`);
  }

  // (2) 신호 모으기
  const adminGroup = !NOT_ADMIN_GROUP.test(desc) && (ADMIN_GROUP.test(group) || ADMIN_GROUP_DESC.test(desc));
  const adminCommand = ADMIN_COMMAND.test(desc);
  const unusual = UNUSUAL_SOURCE.test(desc) || count >= REPEAT_MIN;
  const offHours = OFF_HOURS.test(desc);
  const usual = USUAL.test(desc) && !unusual && !offHours;

  const names = [];
  if (adminGroup) names.push(PATTERNS.ADMIN_GROUP_ADD.name);
  if (adminCommand) names.push(PATTERNS.NEW_ADMIN_COMMAND.name);
  if (offHours) names.push(PATTERNS.OFF_HOURS.name);
  const strong = [adminGroup, adminCommand && (unusual || offHours), offHours, unusual].filter(Boolean).length;

  // (3) 명확한 권한 가로채기: 높은 심각도 + 뚜렷한 신호 → 세션 회수(차단) 후보
  if (level >= CLEAR_LEVEL && names.length > 0 && strong >= 1 && !usual) {
    const confidence = 0.88 + 0.03 * Math.min(strong - 1, 3);
    return act(clamp(confidence, BLOCK_AT, 0.99), names,
      `레벨 ${level}, 평소와 다른 권한 상승 신호 ${strong}개 — 그 계정 세션 회수 후보`);
  }

  // (4) 태그는 있지만 신호가 약하거나 심각도가 낮음 → 알림만
  let confidence = 0.55;
  if (level >= 7) confidence += 0.05;
  if (strong >= 1) confidence += 0.05;
  return act(clamp(confidence, ALERT_AT, 0.75), [PATTERNS.SUSPECT.name, ...names],
    `레벨 ${level}, 뚜렷한 신호 ${strong}개 — 세션을 거두지 않고 사람 확인`);
}
