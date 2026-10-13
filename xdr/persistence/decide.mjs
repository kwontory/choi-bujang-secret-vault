// 보너스 모듈 · 몰래 심은 프로그램(persistence) 경보 판정  (제작 3)
//
// 파일 무결성·서비스·예약 작업 생성 경보 하나(alert)를 아래 패턴(xdr/persistence/patterns.json 을 옮겨 적은 상수)과
// 맞춰 확신도(confidence, 0~1)를 매기고 행동을 나눕니다.
//   - confidence >= 0.85 → block  (높은 심각도 + 서명 없음·임시 폴더·시작 폴더·평소 목록에 없음 등 뚜렷한 지속성 신호)
//   - confidence >= 0.5  → alert  (T1543/T1053 태그는 있지만 신호가 약함 → 사람 확인)
//   - 그 아래            → record (정보성 이벤트: 로그인·평소 업데이트·서명된 기존 서비스 등)
// 이 파일은 다른 파일·패키지를 불러오지 않고, 파일·네트워크를 쓰지 않는 순수 계산만 합니다.
// 판정기 규칙(src/decider.mjs)을 대신하지 않으며, 차단·알림 기록은 respond.mjs 가 맡습니다. 경보 원본은 고치지 않습니다.

// ── 제작 2 · 패턴 목록 (근거: MITRE ATT&CK T1543, T1053) ──
const PATTERNS = Object.freeze({
  UNSIGNED_SERVICE: { name: '서명 없는 새 서비스', basis: 'T1543.003' },
  ODD_TASK: { name: '낯선 예약 작업', basis: 'T1053.005' },
  STARTUP_CHANGE: { name: '시작 폴더 변경', basis: 'T1547.001 / T1543' },
  SUSPECT: { name: '지속성 의심', basis: 'T1543 / T1053 태그' },
  NORMAL: { name: '정상 이벤트', basis: '정보성' },
});

const TECHNIQUES = ['T1543', 'T1053', 'T1547'];
const CLEAR_LEVEL = 10;   // Wazuh 심각도 10 이상 = 상관분석이 뚜렷한 지속성으로 본 상태
const INFO_LEVEL = 3;     // 3 이하 = 정보성
const REPEAT_MIN = 3;     // 같은 주소에서 연속 등록

// 뚜렷한 신호
const TEMP_PATH = /\\(?:AppData\\Local\\Temp|Windows\\Temp|Temp)\\|\/tmp\//i;
const STARTUP_PATH = /\\Start Menu\\Programs\\Startup\\|\\CurrentVersion\\Run/i;
const RANDOM_NAME = /\\[a-z0-9]{6,}\.exe$/i;
const UNSIGNED = /서명 없|서명이 없|unsigned/i;
const NOT_BASELINE = /평소 목록에 없|처음 보는|임의 문자열|수업 시간 밖|다시 켜도 남/;
const SERVICE_WORD = /서비스|service/i;
const TASK_WORD = /예약 작업|schtask|task/i;
const STARTUP_WORD = /시작 폴더|시작 프로그램|startup/i;
// 정상 쪽 신호
const SIGNED_OK = /서명된|signed/i;

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
  const path = typeof alert?.data?.path === 'string' ? alert.data.path : '';

  // (1) 정보성 이벤트(레벨 3 이하) 또는 지속성 태그 없음 → 기록
  if (level <= INFO_LEVEL || !tagged) {
    return act(0.1, [PATTERNS.NORMAL.name], `정보성 이벤트(레벨 ${level}) — 정상`);
  }

  // (2) 뚜렷한 신호 세기
  const temp = TEMP_PATH.test(path);
  const startup = STARTUP_PATH.test(path) || STARTUP_WORD.test(desc);
  const signals = [
    temp,
    STARTUP_PATH.test(path),
    RANDOM_NAME.test(path),
    UNSIGNED.test(desc),
    NOT_BASELINE.test(desc),
    count >= REPEAT_MIN,
  ].filter(Boolean).length;
  const signedOk = SIGNED_OK.test(desc) && !UNSIGNED.test(desc);

  const names = [];
  if (SERVICE_WORD.test(desc) || mitre.some((m) => m.startsWith('T1543'))) {
    if (!startup || SERVICE_WORD.test(desc)) names.push(PATTERNS.UNSIGNED_SERVICE.name);
  }
  if (TASK_WORD.test(desc) || mitre.some((m) => m.startsWith('T1053'))) names.push(PATTERNS.ODD_TASK.name);
  if (startup) names.push(PATTERNS.STARTUP_CHANGE.name);
  if (names.length === 0) names.push(PATTERNS.SUSPECT.name);

  // (3) 명확한 지속성: 높은 심각도 + 뚜렷한 신호 하나 이상 → 격리(차단) 후보
  if (level >= CLEAR_LEVEL && signals >= 1 && !signedOk) {
    const confidence = 0.88 + 0.03 * Math.min(signals - 1, 3);
    return act(clamp(confidence, BLOCK_AT, 0.99), names,
      `레벨 ${level}, 뚜렷한 지속성 신호 ${signals}개 — 그 PC 접속 격리 후보`);
  }

  // (4) 태그는 있지만 신호가 약하거나 심각도가 낮음 → 알림만
  let confidence = 0.55 + 0.05 * Math.min(signals, 2);
  if (level >= 7) confidence += 0.05;
  return act(clamp(confidence, ALERT_AT, 0.75), [PATTERNS.SUSPECT.name, ...names.filter((n) => n !== PATTERNS.SUSPECT.name)],
    `레벨 ${level}, 뚜렷한 신호 ${signals}개 — 차단하지 않고 사람 확인`);
}
