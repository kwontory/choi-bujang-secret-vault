// 제작 4 · 알림과 차단 연결
// 사용법: node xdr/apply.mjs <moduleKey>   (먼저 npm run xdr:run -- <moduleKey> 로 result.json 을 만듭니다)
//  - block  → xdr/<moduleKey>/deny-rules.json : 판정기 거부 규칙 후보(만료 시각·근거 경보 번호 포함)
//  - alert  → xdr/alerts.log                  : 한 줄에 경보 하나씩 쌓음(같은 모듈의 이전 줄은 교체)
//  - record → 아무 조치 없음
// src/decider.mjs 의 기존 규칙은 고치지 않습니다. 정상(record) 경보로는 규칙을 만들지 않습니다.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TTL_MS = 24 * 60 * 60 * 1000; // 거부 규칙 만료: 근거 경보 시각 + 24시간

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const moduleKey = process.argv[2];
if (!['brute-force', 'web-injection', 'known-cve', 'persistence', 'privilege', 'exfiltration'].includes(moduleKey)) {
  console.error('moduleKey 를 넣어 주세요. 예: node xdr/apply.mjs brute-force');
  process.exit(1);
}

const result = JSON.parse(await readFile(join(root, 'xdr', moduleKey, 'result.json'), 'utf8'));
const fixture = JSON.parse(await readFile(join(root, 'xdr', 'fixtures', `${moduleKey}.json`), 'utf8'));
const byId = new Map(fixture.alerts.map((a) => [a.id, a]));

const denyRules = [];
const alertLines = [];
for (const d of result.decisions) {
  const src = byId.get(d.alertId) ?? {};
  const ip = src.data?.srcip ?? '';
  if (d.action === 'block') {
    const base = Date.parse(src.timestamp ?? '') || Date.now();
    denyRules.push({
      ruleId: `xdr.${moduleKey}.${d.alertId}`,
      decision: 'deny',
      match: { srcip: ip },
      sourceAlertId: d.alertId,
      expiresAt: new Date(base + TTL_MS).toISOString(),
      reason: d.reason,
    });
  } else if (d.action === 'alert') {
    alertLines.push([src.timestamp ?? '', moduleKey, d.alertId, ip, d.confidence, d.reason].join('\t'));
  }
}

await writeFile(join(root, 'xdr', moduleKey, 'deny-rules.json'),
  `${JSON.stringify({ schema: 'aleph.xdr.deny.v1', moduleKey, rules: denyRules }, null, 2)}\n`, 'utf8');

const logPath = join(root, 'xdr', 'alerts.log');
let kept = [];
try {
  kept = (await readFile(logPath, 'utf8')).split('\n').filter((l) => l && l.split('\t')[1] !== moduleKey);
} catch { /* 처음이면 새로 만듭니다 */ }
await writeFile(logPath, `${[...kept, ...alertLines].join('\n')}\n`, 'utf8');

console.log(`${moduleKey}: 거부 규칙 ${denyRules.length}건, 알림 ${alertLines.length}줄`);
