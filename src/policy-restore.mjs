// 10단계 안전 정책 사본 대조·복원 부품입니다.
// - 안전 정책 사본(policy/safe-policy.json): 침해 전에 검증한 판정 규칙 표와 그 해시
// - 시험 정책(policy/test-policy.json): 시험에 쓰는 작업 사본. 침해로 바뀔 수 있는 쪽
// 실제 운영 정책(src/decider.mjs, aleph.config.json, Supabase 권한)은 읽기만 하고 고치지 않습니다.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// 키 순서와 상관없이 같은 내용이면 같은 문자열이 되게 만듭니다.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export const rulesSha256 = rules => createHash('sha256').update(canonical(rules), 'utf8').digest('hex');

const readJson = (path) => {
  if (!existsSync(path)) return { error: 'missing' };
  try { return { value: JSON.parse(readFileSync(path, 'utf8')) }; } catch { return { error: 'invalid_json' }; }
};

// 사본을 다시 읽어 검증합니다. 없거나 해시가 다르면 복원 근거로 쓰지 않습니다.
export function loadSafePolicy(path) {
  const { value, error } = readJson(path);
  if (error) return { error: `safe_policy_${error}` };
  if (value?.schema !== 'aleph.safe-policy.v1' || typeof value.version !== 'string'
      || !Array.isArray(value.rules) || typeof value.rulesSha256 !== 'string') {
    return { error: 'safe_policy_invalid' };
  }
  if (rulesSha256(value.rules) !== value.rulesSha256) return { error: 'safe_policy_unverified' };
  return { safe: value };
}

export function loadTestPolicy(path) {
  const { value, error } = readJson(path);
  if (error) return { error: `test_policy_${error}` };
  if (value?.schema !== 'aleph.test-policy.v1' || !Array.isArray(value.rules)) return { error: 'test_policy_invalid' };
  return { test: value };
}

// 규칙 ID 별로 추가·삭제·변경만 골라냅니다.
export function diffRules(safeRules, testRules) {
  const byId = rules => new Map(rules.map(rule => [rule.id, rule]));
  const safe = byId(safeRules); const test = byId(testRules);
  const changes = [];
  for (const [id, rule] of safe) {
    if (!test.has(id)) changes.push({ id, change: 'missing_in_test' });
    else if (canonical(rule) !== canonical(test.get(id))) changes.push({ id, change: 'modified' });
  }
  for (const id of test.keys()) if (!safe.has(id)) changes.push({ id, change: 'extra_in_test' });
  return changes;
}

export function planRestore({ safePath, testPath }) {
  const { safe, error: safeError } = loadSafePolicy(safePath);
  if (safeError) return { ok: false, error: safeError };
  const { test, error: testError } = loadTestPolicy(testPath);
  if (testError) return { ok: false, error: testError };
  return { ok: true, safe, test, version: safe.version, changes: diffRules(safe.rules, test.rules) };
}

// 확인(confirm)을 받은 뒤에만 시험 정책의 규칙 표를 사본으로 되돌립니다.
// 다른 서비스 규칙(otherServices)과 감사 이력(audit)은 그대로 두고, 감사 이력에 한 줄 덧붙입니다.
export function applyRestore({ safePath, testPath, confirm, now = new Date() }) {
  const plan = planRestore({ safePath, testPath });
  if (!plan.ok) return plan;
  if (!plan.changes.length) return { ...plan, applied: false, reason: 'already_matches' };
  if (confirm !== true) return { ...plan, applied: false, reason: 'confirmation_required' };
  const audit = Array.isArray(plan.test.audit) ? plan.test.audit : [];
  const next = {
    ...plan.test,
    rules: plan.safe.rules,
    restoredFrom: { version: plan.safe.version, rulesSha256: plan.safe.rulesSha256 },
    audit: [...audit, { at: now.toISOString(), action: 'restore_policy', version: plan.safe.version,
      beforeSha256: rulesSha256(plan.test.rules), afterSha256: plan.safe.rulesSha256,
      changed: plan.changes.map(item => `${item.id}:${item.change}`) }],
  };
  writeFileSync(testPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  const verify = planRestore({ safePath, testPath });
  if (!verify.ok || verify.changes.length) return { ...plan, applied: false, error: 'restore_unverified' };
  return { ...plan, applied: true };
}
