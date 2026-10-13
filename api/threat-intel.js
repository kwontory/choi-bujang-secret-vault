// /api/checks 는 vercel.json 이 이 함수로 연결합니다(배포 함수 개수 제한 때문에 새 함수 파일을 만들지 않음).
//   GET /api/checks?case=<사례> → 고정된 가상 입력만 판정기·탐지 규칙에 넣은 결과(src/rule-check.mjs)
//   GET /api/checks              → artifacts/submission.json 점검 기록 요약(없으면 503)
// 그 밖의 위협 정보 요청은 아직 구현하지 않았습니다(501).
import { readFile } from 'node:fs/promises';
import { runRuleCheck } from '../src/rule-check.mjs';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request?.query?.mode !== 'checks') {
    response.status(501).json({ error: 'THREAT_INTEL_NOT_IMPLEMENTED' });
    return;
  }
  // 고정된 가상 입력만 실행한다. 사용자 입력을 코드로 실행하지 않는다.
  if (request.query.case !== undefined) {
    const result = typeof request.query.case === 'string' ? await runRuleCheck(request.query.case) : null;
    if (result) response.status(200).json(result);
    else response.status(400).json({ error: 'unknown_check' });
    return;
  }
  try {
    const bundle = JSON.parse(await readFile(new URL('../artifacts/submission.json', import.meta.url), 'utf8'));
    const attempts = Array.isArray(bundle.attackAttempts) ? bundle.attackAttempts : [];
    const blocked = attempts.filter(a => a.result === 'blocked').length;
    const notRun = attempts.filter(a => a.result === 'not_run').length;
    response.status(200).json({ checkedAt: bundle.checkedAt, commit: bundle.commit, total: attempts.length, blocked, notRun,
      failed: attempts.length - blocked - notRun });
  } catch {
    response.status(503).json({ error: 'checks_unavailable', message: '점검 기록을 읽지 못했습니다.' });
  }
}
