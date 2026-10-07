// 보너스 모듈 · 웹 주입(web-injection) 경보 판정  (제작 3 · Jev 판단)
//
// 반 엔진이 검증한 Wazuh 모양 웹 접근 경보 하나(alert)를 패턴과 맞춰 본 뒤
// 확신도(confidence)를 매기고, 그 확신도로 행동을 나눕니다.
//   - confidence >= 0.85 → block  (같은 주소에서 반복되는 명확한 주입 → 판정기 거부 규칙 후보)
//   - confidence >= 0.5  → alert  (애매한 단발 의심 → xdr/apply.mjs 가 xdr/alerts.log 에 한 줄씩)
//   - 그 아래            → record (정상 조회·새로고침·로그아웃 등 정보성 이벤트)
// 이 모듈은 ZTNA 판정기 규칙(src/decider.mjs)을 대신하지 않고, 확인 단계를 더하는 부품입니다.
// 경보 원본은 고치지 않습니다. decide 는 파일·네트워크를 쓰지 않는 순수 함수입니다. 과제 규칙: "같은 주소에서 반복되는 명확한 주입 시도만" 막습니다.

// 제작 2 · 패턴 목록(요약) — 근거: MITRE ATT&CK T1190 (공개 애플리케이션 악용)
const CLEAR_LEVEL = 10; // Wazuh 심각도 10 이상 = 상관분석이 반복 주입으로 본 상태
const REPEAT_MIN = 3;   // 같은 주소에서 이만큼 반복되면 자동화된 주입으로 봄

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// 확신도 → 행동 (제작 3 임계)
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
  const count = toNum(alert?.data?.count); // 같은 주소에서 반복된 횟수

  // (1) 정보성 이벤트(레벨 3 이하, 공격 기법 태그 없음: 목록·조회·새로고침·로그아웃 등): 정상 → 기록
  const tagged = Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.length > 0;
  if (level <= 3 || !tagged) {
    return act(alert, 0.1, `정보성 이벤트(레벨 ${level}) — 정상 웹 조회`, '정상 트래픽');
  }

  // (2) 명확한 공격: 높은 심각도 + 같은 주소에서 반복된 주입 표기 → 차단
  if (level >= CLEAR_LEVEL && count >= REPEAT_MIN) {
    return act(alert, 0.95, `레벨 ${level} 주입 표기가 같은 주소에서 ${count}회 반복`, '반복 주입(T1190)');
  }

  // (3) 반복되지 않은 단발 주입 의심(따옴표·수업 용어 매칭·긴 주소 등, 공격 기법 태그 있음): 애매 → 알림
  //     막지 않고 사람이 확인하도록 알림으로만 남깁니다.
  return act(alert, 0.6, `단발 주입 의심(레벨 ${level}, 반복 ${count || 1}회) — 반복 아님, 차단하지 않음`, '단발 주입 의심(T1190)');
}
