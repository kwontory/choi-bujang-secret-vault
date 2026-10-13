// 보너스 모듈 · 알려진 취약점(known-cve) 경보 판정  (제작 3)
//
// Wazuh 모양 경보 하나(alert)를 아래 패턴(xdr/known-cve/patterns.json 을 옮겨 적은 상수)과 맞춰
// 확신도(confidence, 0~1 — 경보가 패턴과 얼마나 뚜렷하게 맞는지)를 매기고 행동을 나눕니다.
//   - confidence >= 0.85 → block  (완전한 원격 조회 구문 = 알려진 악용 형태가 뚜렷함)
//   - confidence >= 0.5  → alert  (CVE 번호·단어·조각·점검 흔적만 있음 = 애매 → 사람 확인)
//   - 그 아래            → record (공격 기법 태그도 신호도 없는 정상 이벤트)
// 이 파일은 다른 파일·패키지를 불러오지 않고, 파일·네트워크를 쓰지 않는 순수 계산만 합니다.
// 판정기 규칙(src/decider.mjs)을 대신하지 않으며, 차단·알림 기록은 respond.mjs 가 맡습니다.
// 경보 원본은 고치지 않습니다. reason 에는 근거 패턴 이름만 적고 경보 속 구문은 옮기지 않습니다.

// ── 제작 2 · 패턴 목록 (근거: CVE-2021-44228, MITRE ATT&CK T1190) ──
const PATTERNS = Object.freeze({
  HEADER_LOOKUP: { name: '머리글 원격 조회 구문', basis: 'CVE-2021-44228 / T1190', confidence: 0.9 },
  ARG_LOOKUP: { name: '인자 원격 조회 구문', basis: 'CVE-2021-44228 / T1190', confidence: 0.9 },
  OBFUSCATED_LOOKUP: { name: '변형 조회 구문', basis: 'CVE-2021-44228 우회 표기 / T1190', confidence: 0.9 },
  SCANNER_TRACE: { name: '취약점 점검 도구 흔적', basis: 'T1190 사전 점검', confidence: 0.6 },
  PARTIAL_TRACE: { name: '불완전 조회 흔적', basis: 'T1190 태그 · 악용 구문 없음', confidence: 0.55 },
  NORMAL: { name: '정상 트래픽', basis: '태그·신호 없음', confidence: 0.1 },
});

// 완전한 원격 조회 구문: ${jndi:<프로토콜>://
const FULL_LOOKUP = /\$\{\s*jndi\s*:\s*(?:ldaps?|rmi|dns|iiop|nis|nds|corba|https?)\s*:\s*\/\//i;
// 중첩 치환 표기(${lower:j}, ${upper:n}, ${::-d}, ${env:X:-i})를 풀어 숨긴 jndi 를 드러냄
const NESTED_CASE = /\$\{\s*(?:lower|upper)\s*:([^${}]*)\}/gi;
const NESTED_DEFAULT = /\$\{[^${}]*?:-([^${}]*)\}/g;
// 약한 신호(단독으로는 막지 않음)
const WEAK_SIGNAL = /cve-?\d{4}-\d{4,}|jndi|log4j|log4shell|lookup|\$\{/i;
const SCANNER_SIGNAL = /log4j-?scan|nuclei|interactsh|jndi-?exploit|scanner|class-check|vuln-?scan/i;
const SCANNER_DESC = /점검 (?:도구|흔적)/;
// 주소·인자 쪽 필드 이름 (그 밖의 문자열 필드는 머리글로 봅니다)
const ARG_FIELDS = new Set(['url', 'uri', 'path', 'query', 'request', 'args', 'body']);

const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function decodeOnce(text) {
  try { return decodeURIComponent(text); } catch { return text; }
}

function unwrapNested(text) {
  let out = text;
  for (let i = 0; i < 5; i += 1) {
    const next = out.replace(NESTED_CASE, '$1').replace(NESTED_DEFAULT, '$1');
    if (next === out) break;
    out = next;
  }
  return out;
}

// alert.data 의 문자열 필드를 [필드 이름, 값] 으로 모읍니다(한 단계 아래 객체까지).
function collectFields(data) {
  const fields = [];
  if (!data || typeof data !== 'object') return fields;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') fields.push([key.toLowerCase(), value]);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k2, v2] of Object.entries(value)) {
        if (typeof v2 === 'string') fields.push([k2.toLowerCase(), v2]);
      }
    }
  }
  return fields;
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
  const tagged = Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.includes('T1190');
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const fields = collectFields(alert?.data).filter(([key]) => key !== 'srcip' && key !== 'srcuser' && key !== 'count');

  // (1) 완전한 원격 조회 구문 찾기 — 머리글 / 인자 / 변형 표기
  let header = false;
  let arg = false;
  let obfuscated = false;
  let weak = false;
  let scanner = SCANNER_DESC.test(description);
  for (const [key, raw] of fields) {
    const decoded = decodeOnce(raw);
    const isArg = ARG_FIELDS.has(key);
    if (FULL_LOOKUP.test(decoded)) {
      if (isArg) arg = true; else header = true;
    } else if (FULL_LOOKUP.test(unwrapNested(decoded))) {
      obfuscated = true;
    }
    if (WEAK_SIGNAL.test(decoded)) weak = true;
    if (SCANNER_SIGNAL.test(decoded)) scanner = true;
  }

  if (header || arg || obfuscated) {
    const names = [];
    if (header) names.push(PATTERNS.HEADER_LOOKUP.name);
    if (arg) names.push(PATTERNS.ARG_LOOKUP.name);
    if (obfuscated) names.push(PATTERNS.OBFUSCATED_LOOKUP.name);
    if (scanner) names.push(PATTERNS.SCANNER_TRACE.name);
    let confidence = PATTERNS.HEADER_LOOKUP.confidence;
    if (names.length > 1) confidence += 0.03;           // 여러 곳·여러 신호에서 함께 나옴
    if (count >= 3 || level >= 12) confidence += 0.03;  // 반복되거나 심각도 높음
    return act(clamp(confidence, BLOCK_AT, 0.99), names,
      `CVE-2021-44228 형태의 완전한 원격 조회 구문(레벨 ${level}${count ? `, ${count}회` : ''}) — 차단 후보`);
  }

  // (2) 구문은 없지만 T1190 태그·점검 흔적·약한 신호가 있음 → 알림만
  if (tagged || scanner || (weak && level >= 5)) {
    const names = [];
    if (scanner) names.push(PATTERNS.SCANNER_TRACE.name);
    if (tagged || weak || names.length === 0) names.push(PATTERNS.PARTIAL_TRACE.name);
    let confidence = scanner ? PATTERNS.SCANNER_TRACE.confidence : PATTERNS.PARTIAL_TRACE.confidence;
    if (level >= 7) confidence += 0.05;
    if (count >= 2) confidence += 0.05;
    return act(clamp(confidence, ALERT_AT, 0.75), names,
      `완전한 원격 조회 구문 없음(레벨 ${level}) — 막지 않고 사람 확인`);
  }

  // (3) 태그도 신호도 없는 정상 이벤트 → 기록
  return act(PATTERNS.NORMAL.confidence, [PATTERNS.NORMAL.name], `정보성 이벤트(레벨 ${level}) — 정상 요청`);
}
