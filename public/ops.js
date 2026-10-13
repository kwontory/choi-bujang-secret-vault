// 12단계 탈환 작전실 화면: 서버 요약과 실측 표를 실제 응답으로만 채웁니다. 성공 문구를 미리 넣지 않습니다.
import { ANON_CASES, LOGIN_CASES, runCase } from './ops-cases.js';

const $ = id => document.getElementById(id);
const tag = result => `<span class="tag ${result === '확인' ? 'ok' : result === '불일치' ? 'bad' : 'skip'}">${result}</span>`;
const esc = value => String(value ?? '').replace(/[&<>"']/gu, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

async function loadSummary() {
  const response = await fetch('/api/checks?view=ops', { cache: 'no-store' });
  const requestId = response.headers.get('x-vercel-id') ?? '없음';
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.schema !== 'aleph.ops.v1') {
    $('summary-meta').textContent = `서버 요약을 받지 못했습니다 (HTTP ${response.status}, 요청 ID ${requestId}). 모든 항목 미실행.`;
    return;
  }
  $('summary-meta').textContent = `확인 시각 ${data.checkedAt} · 배포 커밋 ${data.commit?.slice(0, 12) ?? '알 수 없음'} · 요청 ID ${requestId}`;
  const fixtures = data.rules.fixtures;
  $('rule-count').textContent = `${data.rules.count}개`;
  $('rule-fixtures').textContent = `가상 판정 ${fixtures.filter(f => f.ready).length}/${fixtures.length}건 기대와 일치`;
  const burst = data.detection.burstRead;
  $('detect-state').textContent = burst ? (burst.ready ? burst.outcome : '불일치') : '미실행';
  $('detect-note').textContent = `운영 사건 연결: ${data.detection.liveEvents === 'not_run' ? '미실행' : data.detection.liveEvents}`;
  const revocation = data.revocation;
  $('revoke-state').textContent = revocation.status === 'checked'
    ? `${revocation.devices.approved} / ${revocation.devices.pending} / ${revocation.devices.revoked}` : '미실행';
  $('revoke-note').textContent = revocation.status === 'checked' ? '서버 저장소의 기기 건수(개별 기기·사용자는 표시하지 않음)' : '서버 저장소를 조회하지 못했습니다';
  const recovery = data.recovery;
  $('recovery-state').textContent = recovery.safePolicyVersion ?? '미실행';
  const backups = typeof recovery.backups === 'object' ? `사본 ${recovery.backups.count}건 · 최신 v${recovery.backups.latestVersion ?? '-'}` : '사본 조회 미실행';
  const restores = typeof recovery.restores === 'object' ? `복원 ${recovery.restores.count}건${recovery.restores.lastAt ? ` · 마지막 ${recovery.restores.lastAt}` : ''}` : '복원 기록 미실행';
  $('recovery-note').textContent = `${backups} · ${restores}`;
  $('fixture-table').innerHTML = `<tr><th>가상 사례</th><th>결과</th><th>사유 코드</th><th>판정</th></tr>${fixtures.map(f =>
    `<tr><td class="mono">${esc(f.caseId)}</td><td>${esc(f.outcome)}</td><td class="mono">${esc(f.reasonCode ?? '-')}</td><td>${tag(f.ready ? '확인' : '불일치')}</td></tr>`).join('')}
    <tr><td colspan="4" class="mono">${data.rules.ruleIds.map(esc).join(' · ')}</td></tr>`;
}

async function runTable() {
  const startedAt = new Date().toISOString();
  const rows = [];
  for (const item of ANON_CASES) rows.push(await runCase(location.origin, item));
  for (const [stage, kind, label] of LOGIN_CASES) {
    rows.push({ stage, kind, label, request: '로그인·승인 기기 필요', expected: '-', actual: '-', result: '미실행', requestId: '-', at: '-' });
  }
  rows.push({ stage: 12, kind: '총공세', label: '심판 총공세 41종', request: '심판 실행', expected: '-', actual: '-', result: '미실행', requestId: '-', at: '-' });
  rows.sort((a, b) => a.stage - b.stage);
  $('case-table').innerHTML = `<tr><th>단계</th><th>구분</th><th>요청</th><th>기대</th><th>실제</th><th>판정</th><th>요청 ID</th><th>확인 시각</th></tr>${rows.map(r =>
    `<tr><td>${r.stage}</td><td>${esc(r.kind)}</td><td>${esc(r.label)}<br><span class="muted mono">${esc(r.request)}</span></td><td>${esc(r.expected)}</td><td>${esc(r.actual)}</td><td>${tag(r.result)}</td><td class="mono">${esc(r.requestId)}</td><td class="mono">${esc(r.at)}</td></tr>`).join('')}`;
  const count = result => rows.filter(r => r.result === result).length;
  $('count-ok').textContent = count('확인');
  $('count-bad').textContent = count('불일치');
  $('count-skip').textContent = count('미실행');
  $('table-meta').textContent = `${startedAt} 부터 이 브라우저에서 ${ANON_CASES.length}건을 실제로 보냈습니다.`;
}

async function run() {
  $('rerun').disabled = true;
  try { await Promise.all([loadSummary().catch(() => { $('summary-meta').textContent = '서버 요약 요청 실패 · 모든 항목 미실행'; }), runTable()]); }
  finally { $('rerun').disabled = false; }
}
$('rerun').addEventListener('click', run);
run();
