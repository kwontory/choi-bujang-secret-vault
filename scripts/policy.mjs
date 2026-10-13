// 사용법:
//   npm run policy:diff               안전 정책 사본과 시험 정책의 차이만 보여 줍니다(아무것도 바꾸지 않음)
//   npm run policy:restore            바뀔 항목만 보여 주고 멈춥니다
//   npm run policy:restore -- --yes   확인 뒤 시험 정책을 검증한 사본 버전으로 되돌립니다
// 사본이 없거나 검증에 실패하면 즉시 멈춥니다. 실제 운영 정책은 건드리지 않습니다.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyRestore, planRestore } from '../src/policy-restore.mjs';

const root = resolve(import.meta.dirname, '..');
const safePath = resolve(root, 'policy', 'safe-policy.json');
const testPath = resolve(root, 'policy', 'test-policy.json');
const [command = 'diff', ...flags] = process.argv.slice(2);
const out = text => process.stdout.write(`${text}\n`);

async function liveCheck(safe) {
  // 실제 운영 판정기의 규칙 이름이 사본과 같은지 읽기만 합니다.
  const { RULE_IDS } = await import(pathToFileURL(resolve(root, 'src', 'decider.mjs')).href);
  const expected = safe.rules.filter(rule => rule.layer === 'decider').map(rule => rule.id).sort();
  const live = [...RULE_IDS].sort();
  return expected.join(',') === live.join(',') ? '운영 판정기 규칙 이름: 사본과 같음(읽기만 함)'
    : `운영 판정기 규칙 이름: 사본과 다름(읽기만 함, 고치지 않음) 사본=${expected.join(',')} 운영=${live.join(',')}`;
}

try {
  const plan = planRestore({ safePath, testPath });
  if (!plan.ok) {
    out(`중단: ${plan.error} · 안전 정책 사본이 없거나 검증에 실패해 아무것도 바꾸지 않았습니다.`);
    process.exitCode = 1;
  } else {
    out(`복원할 버전: ${plan.version} (규칙 해시 ${plan.safe.rulesSha256.slice(0, 12)})`);
    out(plan.changes.length ? `바뀔 항목 ${plan.changes.length}개:` : '바뀔 항목 없음: 시험 정책이 사본과 같습니다.');
    for (const item of plan.changes) out(`  - ${item.id}: ${item.change}`);
    out(await liveCheck(plan.safe));
    if (command === 'restore') {
      const result = applyRestore({ safePath, testPath, confirm: flags.includes('--yes') });
      if (result.error) { out(`중단: ${result.error}`); process.exitCode = 1; }
      else if (result.applied) out('시험 정책을 사본 버전으로 되돌렸습니다. 다른 서비스 규칙과 감사 이력은 보존했습니다.');
      else if (result.reason === 'confirmation_required') out('아직 바꾸지 않았습니다. 위 항목을 확인한 뒤 `npm run policy:restore -- --yes` 로 실행합니다.');
      else out('바꿀 것이 없어 그대로 두었습니다.');
    }
  }
} catch (error) {
  out(`정책 대조 첫 오류: ${error.message}`);
  process.exitCode = 1;
}
