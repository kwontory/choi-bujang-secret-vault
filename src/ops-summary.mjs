// 12단계 탈환 작전실 서버 요약: 판정기 규칙·탐지·회수 상태·복구 버전을 실제 실행·조회 결과로만 돌려줍니다.
// 사용자 ID·기기 ID·메모 본문·토큰은 넣지 않고 건수·버전·시각만 담습니다. 조회하지 못한 항목은 미실행으로 남깁니다.
import safePolicy from '../policy/safe-policy.json' with { type: 'json' };
import { RULE_IDS } from './decider.mjs';
import { runRuleCheck } from './rule-check.mjs';

const CASES = ['s06-unregistered', 's07-compound', 's08-unknown-route', 's08-all-notes', 's08-write-notice', 's09-burst-read'];

async function countRows(supabase, table, filter) {
  let query = supabase.from(table).select('*', { count: 'exact', head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  return error ? null : count;
}

export async function opsSummary({ supabase } = {}) {
  const checkedAt = new Date().toISOString();
  const fixtures = [];
  for (const caseId of CASES) {
    const result = await runRuleCheck(caseId);
    fixtures.push({ caseId, ready: result?.ready === true, outcome: result?.decision ?? result?.action ?? null,
      reasonCode: result?.reasonCode ?? null });
  }
  const summary = {
    schema: 'aleph.ops.v1', checkedAt, commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    rules: { ruleIds: [...RULE_IDS], count: RULE_IDS.length, fixtures },
    detection: { source: 'fixture', burstRead: fixtures.find(item => item.caseId === 's09-burst-read') ?? null,
      liveEvents: 'not_run', note: '운영 엔진의 실제 사건 전달은 연결하지 않았습니다(고정 가상 사건만 실행).' },
    revocation: { status: 'not_run' },
    recovery: { safePolicyVersion: safePolicy.version ?? null, safePolicyVerifiedAt: safePolicy.verifiedAt ?? null,
      backups: 'not_run', restores: 'not_run' },
  };
  if (!supabase) return summary;
  const [approved, pending, revoked] = await Promise.all(['approved', 'pending', 'revoked']
    .map(status => countRows(supabase, 'device_registrations', query => query.eq('status', status))));
  if ([approved, pending, revoked].every(value => typeof value === 'number')) {
    summary.revocation = { status: 'checked', devices: { approved, pending, revoked } };
  }
  const { data: latest, error: latestError } = await supabase.from('note_backups').select('version, captured_at')
    .order('version', { ascending: false }).order('captured_at', { ascending: false }).limit(1);
  const backupCount = await countRows(supabase, 'note_backups');
  if (!latestError && typeof backupCount === 'number') {
    summary.recovery.backups = { count: backupCount, latestVersion: latest?.[0]?.version ?? null,
      latestCapturedAt: latest?.[0]?.captured_at ?? null };
  }
  const { data: lastRestore, error: restoreError } = await supabase.from('note_audit').select('at, backup_version')
    .eq('action', 'restore').order('at', { ascending: false }).limit(1);
  const restoreCount = await countRows(supabase, 'note_audit', query => query.eq('action', 'restore'));
  if (!restoreError && typeof restoreCount === 'number') {
    summary.recovery.restores = { count: restoreCount, lastAt: lastRestore?.[0]?.at ?? null,
      lastBackupVersion: lastRestore?.[0]?.backup_version ?? null };
  }
  return summary;
}
