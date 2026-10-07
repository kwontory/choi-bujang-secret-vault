// 보너스 모듈 · 무차별 로그인(brute-force) 경보 판정  (제작 3 · Jev 판단)
//
// 반 엔진이 검증한 Wazuh 모양 로그인 경보 하나(alert)를 패턴과 맞춰 본 뒤
// 확신도(confidence)를 매기고, 그 확신도로 행동을 나눕니다.
//   - confidence >= 0.85 → block  (아주 명확한 대입/분사 → 판정기 거부 규칙 후보)
//   - confidence >= 0.5  → alert  (애매한 시도 → xdr/apply.mjs 가 xdr/alerts.log 에 한 줄씩)
//   - 그 아래            → record (정상 로그인·로그아웃·세션 유지 등 정보성 이벤트)
// 이 모듈은 ZTNA 판정기 규칙(src/decider.mjs)을 대신하지 않고, 확인 단계를 더하는 부품입니다.
// 경보 원본은 고치지 않습니다. decide 는 파일·네트워크를 쓰지 않는 순수 함수입니다.

// 제작 2 · 패턴 목록(요약) — 근거: MITRE ATT&CK T1110 (무차별 대입)
const CLEAR_LEVEL = 10;      // Wazuh 심각도 10 이상 = 지속/분사 실패로 본 상태
const HIGH_FAIL_COUNT = 15;  // 짧은 시간 같은 주소 연속 실패가 이 수를 넘으면 명확한 대입
const SPRAY_ACCOUNTS = 5;    // 한 주소가 이만큼 많은 계정에 번갈아 넣으면 명확한 분사


function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function act(alert, confidence, reason, patternName) {
  const fullReason = patternName ? `${patternName}: ${reason}` : reason;
  let action = 'record';
  if (confidence >= 0.85) action = 'block';
  else if (confidence >= 0.5) action = 'alert';

  return { action, confidence, reason: fullReason };
}

export function decide(alert) {
  // 제작 1 · 경보 읽기 — 계약에 있는 필드만 읽습니다.
  const level = toNum(alert?.rule?.level);
  const desc = String(alert?.rule?.description ?? '');
  const data = alert?.data ?? {};
  const failCount = toNum(data.count);
  const accounts = typeof data.accounts === 'string'
    ? data.accounts.split(',').map((s) => s.trim()).filter(Boolean).length
    : 0;
  // 실제 로그인/비밀번호 변경 성공만 참. "성공은 없습니다" 같은 부정문은 제외.
  const succeeded = desc.includes('성공') && !/성공\s*(은|이)?\s*없/.test(desc);

  // (1) 정보성 이벤트(레벨 3 이하, 공격 기법 태그 없음: 로그인 성공·로그아웃·세션 유지 등): 정상 → 기록
  const tagged = Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.length > 0;
  if (level <= 3 || !tagged) {
    return act(alert, 0.1, `정보성 이벤트(레벨 ${level}) — 로그인 실패 급증 아님`, '정상 트래픽');
  }

  // (2) 명확한 공격: 높은 심각도 + 성공 흔적 없음 + (대량 연속 실패 또는 다수 계정 분사) → 차단
  if (level >= CLEAR_LEVEL && !succeeded && (failCount >= HIGH_FAIL_COUNT || accounts >= SPRAY_ACCOUNTS)) {
    const detail = accounts >= 2 ? `계정 ${accounts}개 분사` : `연속 실패 ${failCount || '다수'}건`;
    const pattern = accounts >= 2 ? '비밀번호 분사(T1110)' : '연속 대입(T1110)';
    return act(alert, 0.95, `레벨 ${level} ${detail}·성공 없음`, pattern);
  }

  // (3) 그 밖의 로그인 실패 경보(공격 기법 태그가 붙었지만 차단 기준 미달): 애매 → 알림
  //     실패 뒤 성공·비밀번호 변경·잠금 뒤 재시도처럼 정상일 수도 있는 건은 사람이 확인하도록 알림으로 남깁니다.
  return act(alert, 0.6, `실패 패턴(실패 ${failCount || '-'}건·계정 ${accounts || 1}개, 레벨 ${level}) — 차단 기준 미달`, '대입 의심(T1110)');
}
