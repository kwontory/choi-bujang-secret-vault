// 10단계 정책 복원 로컬 연습: 임시 폴더의 사본으로만 시험하고 저장소 파일은 바꾸지 않습니다.
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { applyRestore, planRestore } from '../src/policy-restore.mjs';

const root = resolve(import.meta.dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'aleph-policy-'));
const safePath = join(dir, 'safe-policy.json');
const testPath = join(dir, 'test-policy.json');
const results = [];
const check = (name, passed) => results.push({ name, passed: Boolean(passed) });
const read = path => JSON.parse(readFileSync(path, 'utf8'));
try {
  copyFileSync(resolve(root, 'policy', 'safe-policy.json'), safePath);
  copyFileSync(resolve(root, 'policy', 'test-policy.json'), testPath);
  // 침해 흉내: 메모 소유자 확인 규칙을 지우고 공지 쓰기를 허용으로 바꿈, 다른 서비스 규칙과 감사 이력은 남겨 둠
  const tampered = read(testPath);
  tampered.rules = tampered.rules.filter(rule => rule.id !== 'api.notes.owner_only')
    .map(rule => rule.id === 'zone_announcements_read_only' ? { ...rule, deny: [] } : rule);
  tampered.audit = [{ at: '2026-10-13T00:00:00.000Z', action: 'earlier_record' }];
  writeFileSync(testPath, JSON.stringify(tampered));
  const plan = planRestore({ safePath, testPath });
  check('실행 전에 복원할 버전과 바뀔 항목만 보임', plan.ok && plan.version
    && plan.changes.map(c => `${c.id}:${c.change}`).sort().join()
      === 'api.notes.owner_only:missing_in_test,zone_announcements_read_only:modified');
  const unconfirmed = applyRestore({ safePath, testPath, confirm: false });
  check('확인 없이는 바꾸지 않음', !unconfirmed.applied && read(testPath).rules.length === tampered.rules.length);
  const applied = applyRestore({ safePath, testPath, confirm: true });
  const after = read(testPath);
  check('확인 뒤 시험 정책이 사본 버전으로 돌아옴(소유자 확인 규칙 복귀)', applied.applied
    && planRestore({ safePath, testPath }).changes.length === 0
    && after.rules.some(rule => rule.id === 'api.notes.owner_only'));
  check('다른 서비스 규칙과 감사 이력은 보존되고 복원 기록이 덧붙음',
    JSON.stringify(after.otherServices) === JSON.stringify(tampered.otherServices)
    && after.audit[0]?.action === 'earlier_record' && after.audit.at(-1)?.action === 'restore_policy');
  const broken = read(safePath); broken.rules[0].effect = 'allow';
  writeFileSync(safePath, JSON.stringify(broken));
  const unverified = applyRestore({ safePath, testPath, confirm: true });
  check('검증에 실패한 사본이면 멈춤', !unverified.ok && unverified.error === 'safe_policy_unverified');
  rmSync(safePath);
  const missing = applyRestore({ safePath, testPath, confirm: true });
  check('사본이 없으면 멈춤', !missing.ok && missing.error === 'safe_policy_missing');
} catch (error) {
  check(`첫 오류: ${error.message}`, false);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
for (const item of results) process.stdout.write(`${item.passed ? '통과' : '확인 필요'} · ${item.name}\n`);
process.stdout.write('임시 사본으로 한 연습이며 운영 정책이나 심판 판정과 무관합니다.\n');
if (results.some(item => !item.passed)) process.exitCode = 1;
