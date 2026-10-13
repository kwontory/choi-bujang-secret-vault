// 제작 4 · 알림과 차단 — 권한 가로채기(privilege)
// 사용법: node xdr/privilege/respond.mjs
//  - decide 결과 가운데 block(차단 후보)만 → xdr/privilege/deny-rules.json : 내 ZTNA 판정기 거부 규칙 후보
//      규칙마다 만료 시각(expiresAt = 근거 경보 시각 + 24시간)과 근거 경보 번호(sourceAlertId)를 붙입니다.
//      세션 회수는 "그 계정 + 그 출발 주소" 짝(match: { srcuser, srcip })으로만 겁니다. 계정만으로 막으면
//      같은 계정의 평소 주소 접속(정상 로그인)까지 막히므로, 도용된 세션만 거둡니다.
//      정상(record) 경보에 나온 주소나 계정·주소 짝은 규칙으로 만들지 않습니다(정상 사용자 보호).
//  - alert → xdr/alerts.log : 한 줄에 경보 하나씩 쌓음(이 모듈의 이전 줄만 교체, 다른 모듈 줄은 그대로)
//  - record → 아무 조치 없음
// decide.mjs 는 판단만 돌려주고, 파일 쓰기·판정기 연결은 이 파일이 맡습니다.
// src/decider.mjs 의 기존 규칙은 고치지 않습니다. 경보 원본도 고치지 않습니다.
// 그룹 이름 등 경보 원본 값은 규칙에 옮기지 않습니다(근거 패턴 이름만 남김).
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';

const MODULE_KEY = 'privilege';
const TTL_MS = 24 * 60 * 60 * 1000;

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const fixture = JSON.parse(await readFile(join(root, 'xdr', 'fixtures', `${MODULE_KEY}.json`), 'utf8'));
const alerts = Array.isArray(fixture.alerts) ? fixture.alerts : [];

const judged = [];
for (const alert of alerts) {
  judged.push({ alert, decision: await decide(alert) });
}

// 정상 이벤트에서 본 주소 = 막으면 안 되는 대상
const normalIps = new Set();
const normalPairs = new Set();
for (const { alert, decision } of judged) {
  if (decision.action !== 'record') continue;
  if (alert?.data?.srcip) normalIps.add(alert.data.srcip);
  normalPairs.add(`${alert?.data?.srcuser ?? ''}@${alert?.data?.srcip ?? ''}`);
}

const rules = [];
const skipped = [];
const alertLines = [];
for (const { alert, decision } of judged) {
  const id = String(alert?.id ?? '');
  const ip = String(alert?.data?.srcip ?? '');
  const user = String(alert?.data?.srcuser ?? '');
  const at = String(alert?.timestamp ?? '');
  if (decision.action === 'block') {
    if (!ip || !user || normalIps.has(ip) || normalPairs.has(`${user}@${ip}`)) {
      skipped.push(id); // 정상 사용자와 겹치면 규칙을 넣지 않고 알림으로 돌립니다.
      alertLines.push([at, MODULE_KEY, id, ip, decision.confidence, `차단 보류(정상 사용자와 겹침) ${decision.reason}`].join('\t'));
      continue;
    }
    const base = Date.parse(at) || Date.now();
    rules.push({
      ruleId: `xdr.${MODULE_KEY}.${id}`,
      decision: 'deny',
      reasonCode: 'privilege_session_revoked',
      match: { srcuser: user, srcip: ip },
      sourceAlertId: id,
      createdAt: new Date(base).toISOString(),
      expiresAt: new Date(base + TTL_MS).toISOString(),
      confidence: decision.confidence,
      reason: decision.reason,
    });
  } else if (decision.action === 'alert') {
    alertLines.push([at, MODULE_KEY, id, ip, decision.confidence, decision.reason].join('\t'));
  }
}

await writeFile(join(root, 'xdr', MODULE_KEY, 'deny-rules.json'),
  `${JSON.stringify({ schema: 'aleph.xdr.deny.v1', moduleKey: MODULE_KEY, ttlHours: 24, rules }, null, 2)}\n`, 'utf8');

const logPath = join(root, 'xdr', 'alerts.log');
let kept = [];
try {
  kept = (await readFile(logPath, 'utf8')).split('\n').filter((l) => l && l.split('\t')[1] !== MODULE_KEY);
} catch { /* 처음이면 새로 만듭니다 */ }
await writeFile(logPath, `${[...kept, ...alertLines].join('\n')}\n`, 'utf8');

// 시험 경보 다시 흘리기: 거부 규칙에 걸리는 경보가 명확한 공격뿐인지 확인
const now = Date.parse(alerts[0]?.timestamp ?? '') || Date.now();
const active = rules.filter((r) => Date.parse(r.expiresAt) > now);
const blockedPairs = new Set(active.map((r) => `${r.match.srcuser}@${r.match.srcip}`));
let blockedNormal = 0;
let blockedAttack = 0;
for (const { alert, decision } of judged) {
  if (!blockedPairs.has(`${alert?.data?.srcuser}@${alert?.data?.srcip}`)) continue;
  if (decision.action === 'block') blockedAttack += 1; else blockedNormal += 1;
}
console.log(`${MODULE_KEY}: 거부 규칙 ${rules.length}건(보류 ${skipped.length}), 알림 ${alertLines.length}줄 · 다시 흘림: 공격 차단 ${blockedAttack}건, 정상 차단 ${blockedNormal}건`);
if (blockedNormal > 0) process.exitCode = 1;
