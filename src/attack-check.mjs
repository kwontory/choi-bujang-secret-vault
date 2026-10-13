// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
// 연결이 막힌 환경(인터넷 없는 격리 실행 등)에서도 점검이 멈추지 않게, 요청 실패는 HTTP 0 으로 기록합니다.
const nativeFetch = globalThis.fetch;
const fetch = async (url, options) => {
  try {
    return await nativeFetch(url, options);
  } catch {
    return { ok: false, status: 0, json: async () => { throw new Error('network_unavailable'); }, text: async () => '' };
  }
};

export async function runAttackChecks(config) {
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (config.step === 1 && (typeof config.sampleMarker !== 'string' || !config.sampleMarker)) {
    throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  }
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  let staticNotes = null;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
      staticNotes = Array.isArray(data?.notes) ? data.notes.length : null;
    } catch {
    }
  }
  if (config.step === 1) {
    return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
      observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
  }
  const apiResponse = await fetch(new URL('/api/notes', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (config.step >= 3) {
    const get = path => fetch(new URL(path, app), { redirect: 'error', signal: AbortSignal.timeout(10000) });
    const refused = (attackId, expected, label, res) => ({ attackId, expected, observed: [401, 403].includes(res.status)
      ? `비로그인 ${label}이 거부됨 (HTTP ${res.status})` : `비로그인 ${label} 거부를 확인하지 못함 (HTTP ${res.status})` });
    const notRun = (attackId, expected, why) => ({ attackId, expected, observed: `not_run · ${why}` });
    let errorCode = null;
    try { errorCode = (await apiResponse.json())?.error ?? null; } catch { errorCode = null; }
    const attempts = [
      { attackId: 'static_note_read', expected: '정적 data.json에 메모가 없어야 함',
        observed: response.status === 404 || staticNotes === 0
          ? `정적 메모가 노출되지 않음 (HTTP ${response.status})` : `정적 메모 노출 여부를 확인하지 못함 (HTTP ${response.status})` },
      { attackId: 'anonymous_api_read', expected: '토큰 없는 메모 목록 요청은 JSON 오류와 함께 거부',
        observed: [401, 403].includes(apiResponse.status) && typeof errorCode === 'string'
          ? `비로그인 요청이 JSON 오류로 거부됨 (HTTP ${apiResponse.status})` : `비로그인 요청 거부를 확인하지 못함 (HTTP ${apiResponse.status})` },
    ];
    if (config.step >= 4) attempts.push({ attackId: 'cross_owner_access',
      expected: 'A/B 로그인에서 상대 메모의 조회·수정·삭제가 거부', observed: 'A/B 실습 계정이 없어 직접 점검 미실행' });
    if (config.step < 6) return attempts;
    // 6단계부터: 로컬 판정기·탐지 규칙에 가상 요청을 넣은 결과(심판 판정 아님)
    const { fixtureRequests } = await import('../scripts/fixture-7.mjs');
    const { decide } = await import('./decider.mjs');
    const { normal, suspicious } = fixtureRequests();
    const local = (attackId, expected, ok, okText, got) => ({ attackId, expected,
      observed: ok ? `로컬 가상 요청에서 ${okText} 확인` : `로컬 가상 요청 결과가 기대와 다름 (${got})` });
    const unregistered = await decide({ ...normal, deviceRegistered: false });
    attempts.push(local('unregistered_device_read', '미등록 기기의 자료실 읽기 요청은 deny·device_not_registered',
      unregistered?.reasonCode === 'device_not_registered', 'deny·device_not_registered', unregistered?.decision));
    if (config.step >= 7) {
      const unusual = await decide(suspicious);
      attempts.push(local('unusual_access_step_up', '낯선 지역·시각·네트워크와 대량 사건이 겹친 접속은 step_up·step_up_required',
        unusual?.decision === 'step_up', 'step_up·step_up_required (실제 재로그인 차단은 미실행)', unusual?.decision));
    }
    if (config.step >= 8) {
      const zone = (service, method, route, path) => decide({ ...normal, service, method, route, path });
      const list = await zone('notes', 'GET', 'GET /notes', '/notes');
      const write = await zone('announcements', 'PUT', 'PUT /announcements/:id', '/announcements/demo');
      const own = await decide(normal);
      attempts.push(local('zone_decider_check', '자기 메모 한 건 읽기는 allow, 메모 전체 목록·공지 쓰기는 deny',
        own?.decision === 'allow' && list?.decision === 'deny' && write?.decision === 'deny',
        '자기 메모 allow, 전체 목록·공지 쓰기 deny', `${own?.decision}/${list?.decision}/${write?.decision}`));
      attempts.push(refused('anonymous_notice_read', '토큰 없는 반 공지 읽기는 자료 없이 거부', '공지 요청', await get('/api/announcements')));
    }
    if (config.step >= 9) {
      const { detect } = await import('./detect.mjs');
      const start = Date.parse('2026-10-01T00:00:00.000Z');
      const reads = (network, deviceId) => Array.from({ length: 200 }, (_, index) => ({
        at: new Date(start + index * 2000).toISOString(), method: 'GET', identity: { sub: 'learner_fixture' }, deviceId, network }));
      const bad = detect(reads('unusual', 'b'.repeat(16)));
      const fine = detect(reads('usual', 'a'.repeat(16)));
      attempts.push(local('doppelganger_detect', '낯선 네트워크 다량 조회만 기기 한 개 대상 propose_revocation, 평소 네트워크는 observe',
        bad?.action === 'propose_revocation' && bad?.deviceId === 'b'.repeat(16) && fine?.action === 'observe',
        '의심만 회수 제안, 정상은 observe (실제 회수는 미실행)', `${bad?.action}/${fine?.action}`));
    }
    if (config.step >= 10) {
      attempts.push(refused('anonymous_restore_call', '토큰 없는 복구 경로 호출은 자료 없이 거부', '복구 호출',
        await get('/api/restore/notes/00000000-0000-4000-8000-000000000000')));
      attempts.push(notRun('restore_b_note', '시험 계정 B 메모 변조·삭제 뒤 복구 경로로 ID·소유자·내용 해시가 사본과 같게 한 건만 복원',
        '시험 계정 B 로그인과 쓰기 요청이 필요해 직접 점검 미실행(로컬 npm run restore:test 별도)'));
    }
    if (config.step >= 11) {
      const page = await get('/');
      const html = page.ok ? await page.text() : '';
      const manifest = await get('/manifest.webmanifest');
      let manifestOk = false;
      try { const data = manifest.ok ? await manifest.json() : null; manifestOk = Boolean(data?.name && data?.start_url); } catch { manifestOk = false; }
      attempts.push({ attackId: 'app_shell_before_approval', expected: '접속 화면에 manifest 연결이 있고, 승인 전 화면 HTML 에 보호 자료가 없음',
        observed: page.ok && manifestOk && html.includes('rel="manifest"') && !html.includes(config.sampleMarker)
          ? `접속 화면·manifest 확인, 승인 전 HTML 에 자료 없음 (HTTP ${page.status}/${manifest.status})`
          : `접속 화면 점검 결과가 기대와 다름 (HTTP ${page.status}/${manifest.status})` });
      attempts.push(refused('anonymous_device_status', '토큰 없는 기기 승인 상태 확인은 거부', '기기 상태 확인', await get('/api/device/status')));
      attempts.push(notRun('unsigned_or_altered_request', '서명 없는 요청·서명 뒤 경로나 본문을 바꾼 요청은 거부',
        '승인된 기기와 로그인이 필요해 직접 점검 미실행(로컬 npm run device:test 별도)'));
    }
    if (config.step >= 10) attempts.push(notRun('post_restore_retest', '복구 뒤 1~9단계 정상 요청은 통과, 금지 요청은 다시 거부',
      '로그인이 필요한 재시험은 직접 점검 미실행(위 비로그인 점검만 실행)'));
    if (config.step >= 8) attempts.push(notRun('cross_zone_write', '학생 계정의 다른 메모 수정·강사 공지 수정은 API에서 거부',
      '로그인 계정이 필요한 쓰기 요청이라 직접 점검 미실행'));
    return attempts;
  }
  let apiCount = null;
  if (apiResponse.ok) {
    try {
      const data = await apiResponse.json();
      apiCount = Array.isArray(data?.notes) ? data.notes.length : null;
    } catch {
      apiCount = null;
    }
  }
  return [
    { attackId: 'static_note_read', expected: '정적 data.json에 메모가 없어야 함',
      observed: response.status === 404 || staticNotes === 0
        ? `정적 메모가 노출되지 않음 (HTTP ${response.status})`
        : `정적 메모 노출 여부를 확인하지 못함 (HTTP ${response.status})` },
    { attackId: 'public_api_read', expected: '2단계 공개 API에서 가상 메모 네 건을 읽을 수 있음',
      observed: apiCount === 4 ? '공개 API에서 가상 메모 네 건 응답 확인'
        : `공개 API 응답을 확인하지 못함 (HTTP ${apiResponse.status})` },
  ];
}
