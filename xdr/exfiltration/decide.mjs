// 보너스 모듈 · 자료 빼돌리기(exfiltration) 경보 판정  (제작 3)
//
// 외부 전송 경보 하나(alert)를 아래 패턴(xdr/exfiltration/patterns.json 을 옮겨 적은 상수)과 맞춰
// 확신도(confidence, 0~1)를 매기고 행동을 나눕니다.
//   - confidence >= 0.85 → block  (높은 심각도 + 대용량·많은 파일·반복·시간 밖 압축 반출 등 뚜렷한 유출 신호)
//   - confidence >= 0.5  → alert  (T1041/T1048 태그는 있지만 작은 전송·1회성 → 사람 확인)
//   - 그 아래            → record (메모 읽기·공지·새로고침·평소 동기화 등 정상 이벤트)
// 이 파일은 다른 파일·패키지를 불러오지 않고, 파일·네트워크를 쓰지 않는 순수 계산만 합니다.
// 판정기 규칙(src/decider.mjs)을 대신하지 않으며, 목적지 차단·알림 기록은 respond.mjs 가 맡습니다. 경보 원본은 고치지 않습니다.

// ── 제작 2 · 패턴 목록 (근거: MITRE ATT&CK T1041, T1048) ──
const PATTERNS = Object.freeze({
  LARGE_NEW_DEST: { name: '처음 보는 목적지 대용량 전송', basis: 'T1048' },
  C2_REPEAT: { name: '명령 통로 반복 유출', basis: 'T1041' },
  OFF_HOURS_ARCHIVE: { name: '업무 시간 밖 압축 반출', basis: 'T1048 / T1560' },
  SUSPECT: { name: '유출 의심', basis: 'T1041 / T1048 태그' },
  NORMAL: { name: '정상 이벤트', basis: '정보성' },
});

const TECHNIQUES = ['T1041', 'T1048', 'T1567', 'T1020'];
const CLEAR_LEVEL = 10;
const INFO_LEVEL = 3;
const LARGE_BYTES = 50 * 1000 * 1000; // 50MB 이상 = 대용량
const MANY_FILES = 50;                // 한 번에 50건 이상
const REPEAT_MIN = 5;                 // 같은 목적지로 5회 이상

const NEW_DEST = /처음 보는|외부 주소|평소에 쓰지 않던|목적지 두 곳/;
const OFF_HOURS = /수업 시간 밖|업무 시간 밖|새벽|심야/;
const ARCHIVE = /압축/;
const REPEAT_WORD = /반복|연속|\d+번/;
const C2_WORD = /명령 통로/;
const WHOLE_COPY = /전체가 외부|자료실 전체/;

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

function mb(bytes) {
  return `${Math.round(bytes / 100000) / 10}MB`;
}

export function decide(alert) {
  const level = toNum(alert?.rule?.level);
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre.map(String) : [];
  const tagged = mitre.some((m) => TECHNIQUES.some((t) => m.startsWith(t)));
  const desc = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const bytes = toNum(alert?.data?.bytes);
  const files = toNum(alert?.data?.files);
  const count = toNum(alert?.data?.count);

  // (1) 정보성 이벤트(레벨 3 이하) 또는 유출 기법 태그 없음 → 기록
  if (level <= INFO_LEVEL || !tagged) {
    return act(0.1, [PATTERNS.NORMAL.name], `정보성 이벤트(레벨 ${level}, ${mb(bytes)}) — 정상`);
  }

  // (2) 신호 모으기
  const large = bytes >= LARGE_BYTES;
  const many = files >= MANY_FILES || WHOLE_COPY.test(desc);
  const repeated = count >= REPEAT_MIN;
  const newDest = NEW_DEST.test(desc) || WHOLE_COPY.test(desc);
  const offHours = OFF_HOURS.test(desc);
  const archive = ARCHIVE.test(desc) && (offHours || REPEAT_WORD.test(desc) || newDest);

  const names = [];
  if ((large || many) && (newDest || many)) names.push(PATTERNS.LARGE_NEW_DEST.name);
  if (repeated && (large || C2_WORD.test(desc) || REPEAT_WORD.test(desc))) names.push(PATTERNS.C2_REPEAT.name);
  if (archive && large) names.push(PATTERNS.OFF_HOURS_ARCHIVE.name);
  if (names.length === 0 && large && level >= CLEAR_LEVEL) names.push(PATTERNS.LARGE_NEW_DEST.name);
  const strong = [large, many, repeated, newDest, offHours, archive].filter(Boolean).length;

  // (3) 명확한 유출: 높은 심각도 + 대용량 전송 + 뚜렷한 신호 → 목적지 차단 후보
  if (level >= CLEAR_LEVEL && large && names.length > 0) {
    const confidence = 0.88 + 0.03 * Math.min(strong - 1, 3);
    return act(clamp(confidence, BLOCK_AT, 0.99), names,
      `레벨 ${level}, ${mb(bytes)}${files ? `·파일 ${files}건` : ''}${count ? `·${count}회` : ''} — 목적지 차단 후보`);
  }

  // (4) 태그는 있지만 작은 전송·1회성 → 알림만
  let confidence = 0.55;
  if (level >= 7) confidence += 0.05;
  if (newDest || offHours) confidence += 0.05;
  return act(clamp(confidence, ALERT_AT, 0.75), [PATTERNS.SUSPECT.name, ...names],
    `레벨 ${level}, ${mb(bytes)} — 대용량·반복 아님, 막지 않고 사람 확인`);
}
