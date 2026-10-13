// 공개 점검용 가상 입력만 실행합니다. 실제 세션·메모·기기 상태는 읽거나 바꾸지 않습니다.
// /api/checks?case=<사례> 가 이 함수를 부르고, src/attack-check.mjs 는 그 HTTP 응답만 관측합니다.
import { createHash } from 'node:crypto';
import { decide } from './decider.mjs';
import { detect } from './detect.mjs';

const base = () => ({
  schema: 'aleph.decision.v1', requestId: 'check', classId: 'class_fixture',
  projectId: 'project_fixture', subjectId: 'learner_fixture', deviceId: 'a'.repeat(16),
  service: 'notes', method: 'GET', path: '/notes/demo', route: 'GET /notes/:id',
  queryLength: 0, querySha256: createHash('sha256').update('').digest('hex'),
  at: new Date().toISOString(), policyRevision: 1, deviceRegistered: true,
  stepUp: { verified: false, authAgeSeconds: null }, recentEvents: [],
  signals: { source: 'check', region: 'local', network: 'usual', hour: 14 },
});

const CASES = Object.freeze({
  's06-unregistered': [() => ({ ...base(), deviceRegistered: false }), 'deny'],
  's07-compound': [() => ({ ...base(), signals: { source: 'check', region: 'foreign', network: 'unusual', hour: 3 },
    recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: 20 }] }), 'step_up'],
  's08-unknown-route': [() => ({ ...base(), service: 'unknown', path: '/__unknown__', route: 'GET /__unknown__' }), 'deny'],
  's08-all-notes': [() => ({ ...base(), path: '/notes', route: 'GET /notes' }), 'deny'],
  's08-write-notice': [() => ({ ...base(), service: 'announcements', method: 'POST',
    path: '/announcements', route: 'POST /announcements' }), 'deny'],
});

export async function runRuleCheck(caseId) {
  if (Object.hasOwn(CASES, caseId)) {
    const [make, expected] = CASES[caseId];
    const result = await decide(make());
    return { ready: result?.decision === expected, decision: result?.decision, reasonCode: result?.reasonCode };
  }
  if (caseId === 's09-burst-read') {
    const t0 = Date.now();
    const events = Array.from({ length: 200 }, (_, i) => ({ at: new Date(t0 + i * 2000).toISOString(),
      method: 'GET', identity: { sub: 'check_user' }, deviceId: 'b'.repeat(16), network: 'unusual' }));
    const result = detect(events);
    return { ready: result?.action === 'propose_revocation', action: result?.action };
  }
  return null;
}
