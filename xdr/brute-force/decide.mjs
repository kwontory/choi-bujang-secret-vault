// 보너스 모듈 · 무차별 로그인(brute-force) 경보 판정  (제작 3 · Jev 판단)
//
// 반 엔진이 검증한 Wazuh 모양 로그인 경보 하나(alert)를 패턴과 맞춰 본 뒤
// 확신도(confidence)를 매기고, 그 확신도로 행동을 나눕니다.
//   - confidence >= 0.85 → block  (아주 명확한 대입/분사 → 판정기 거부 규칙 후보)
//   - confidence >= 0.5  → alert  (애매한 시도 → xdr/alerts.log 에 한 줄씩)
//   - 그 아래            → record (정상 로그인·성공한 오타·사용자 정상 행동·정보성 이벤트)
// 이 모듈은 ZTNA 판정기 규칙(src/decider.mjs)을 대신하지 않고, 확인 단계를 더하는 부품입니다.
// 경보 원본은 고치지 않습니다.

import { appendFileSync, writeFileSync } from 'node:fs';

// 제작 4 · 알림과 차단 — 산출 경로
const ALERT_LOG = new URL('../alerts.log', import.meta.url);       // xdr/alerts.log (알림 적재)
const DENY_RULES = new URL('./deny-rules.jsonl', import.meta.url);  // 차단 후보 → 판정기 거부 규칙 후보

try { writeFileSync(ALERT_LOG, ''); } catch { /* 로그 실패는 판정을 막지 않습니다 */ }
try { writeFileSync(DENY_RULES, ''); } catch { /* 무시 */ }

// 제작 2 · 패턴 목록(요약) — 근거: MITRE ATT&CK T1110 (무차별 대입)
const CLEAR_LEVEL = 10;      // Wazuh 심각도 10 이상 = 지속/분사 실패로 본 상태
const HIGH_FAIL_COUNT = 15;  // 짧은 시간 같은 주소 연속 실패가 이 수를 넘으면 명확한 대입
const SPRAY_ACCOUNTS = 5;    // 한 주소가 이만큼 많은 계정에 번갈아 넣으면 명확한 분사
const BENIGN_FAIL_MAX = 6;   // 성공으로 끝난 소수 실패는 정상 사용자 오타 범위

// 사용자로 설명되는 정상 맥락(공격 신호 아님) — 기록 대상
const BENIGN_CONTEXT = ['비밀번호 변경', '현재 비밀번호', '잠금'];

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function logAlert(alert, reason) {
  try {
    const id = alert?.id ?? '';
    const ip = alert?.data?.srcip ?? '';
    appendFileSync(ALERT_LOG, `${alert?.timestamp ?? ''}\tALERT\t${id}\t${ip}\t${reason}\n`);
  } catch { /* 무시 */ }
}

function logDeny(alert, reason) {
  try {
    const ip = alert?.data?.srcip ?? '';
    const base = Date.parse(alert?.timestamp ?? '') || Date.now();
    const expiresAt = new Date(base + 24 * 60 * 60 * 1000).toISOString(); // 만료 24시간
    const rule = {
      ruleId: `xdr.brute-force.${alert?.id ?? 'unknown'}`,
      action: 'deny',
      match: { srcip: ip },
      sourceAlertId: alert?.id ?? '',
      expiresAt,
      reason,
    };
    appendFileSync(DENY_RULES, `${JSON.stringify(rule)}\n`);
  } catch { /* 무시 */ }
}

function act(alert, confidence, reason, patternName) {
  const fullReason = patternName ? `${patternName}: ${reason}` : reason;
  let action = 'record';
  if (confidence >= 0.85) action = 'block';
  else if (confidence >= 0.5) action = 'alert';

  if (action === 'block') logDeny(alert, fullReason);
  if (action === 'alert') logAlert(alert, fullReason);
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
  const benignContext = BENIGN_CONTEXT.some((m) => desc.includes(m));

  // (1) 정보성 이벤트(로그인 성공·로그아웃·세션 유지 등 낮은 심각도): 정상 → 기록
  if (level > 0 && level <= 3) {
    return act(alert, 0.1, `정보성 이벤트(레벨 ${level}) — 로그인 실패 급증 아님`, '정상 트래픽');
  }

  // (2) 명확한 공격: 높은 심각도 + 성공 흔적 없음 + (대량 연속 실패 또는 다수 계정 분사) → 차단
  if (level >= CLEAR_LEVEL && !succeeded && (failCount >= HIGH_FAIL_COUNT || accounts >= SPRAY_ACCOUNTS)) {
    const detail = accounts >= 2 ? `계정 ${accounts}개 분사` : `연속 실패 ${failCount || '다수'}건`;
    const pattern = accounts >= 2 ? '비밀번호 분사(T1110)' : '연속 대입(T1110)';
    return act(alert, 0.95, `레벨 ${level} ${detail}·성공 없음`, pattern);
  }

  // (3) 소수 실패 뒤 성공 = 정상 사용자 오타 → 기록(과차단 방지)
  if (succeeded && failCount > 0 && failCount <= BENIGN_FAIL_MAX) {
    return act(alert, 0.2, `실패 ${failCount}건 뒤 로그인 성공 — 정상 사용자 오타`, '정상 트래픽');
  }

  // (4) 사용자로 설명되는 정상 맥락(비밀번호 변경 화면·계정 잠금 후 재시도 등) → 기록
  if (benignContext) {
    return act(alert, 0.2, `정상 사용자 맥락(레벨 ${level}, 실패 ${failCount || '-'}건) — 공격 신호 아님`, '정상 트래픽');
  }

  // (5) 그 밖의 실패 패턴(기준 미달): 애매 → 알림
  return act(alert, 0.6, `실패 패턴(실패 ${failCount || '-'}건·계정 ${accounts || 1}개, 레벨 ${level}) — 차단 기준 미달`, '대입 의심(T1110)');
}
