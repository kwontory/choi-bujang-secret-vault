// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (![1, 2, 3, 4, 5, 6, 7, 8].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
      // A non-JSON response is a failed check, not a successful deployment.
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
    let errorCode = null;
    try { errorCode = (await apiResponse.json())?.error ?? null; } catch { errorCode = null; }
    const attempts = [
      { attackId: 'static_note_read', expected: '정적 data.json에 메모가 없어야 함',
        observed: response.status === 404 || staticNotes === 0
          ? `정적 메모가 노출되지 않음 (HTTP ${response.status})`
          : `정적 메모 노출 여부를 확인하지 못함 (HTTP ${response.status})` },
      { attackId: 'anonymous_api_read', expected: '토큰 없는 메모 목록 요청은 JSON 오류와 함께 거부',
        observed: [401, 403].includes(apiResponse.status) && typeof errorCode === 'string'
          ? `비로그인 요청이 JSON 오류로 거부됨 (HTTP ${apiResponse.status})`
          : `비로그인 요청 거부를 확인하지 못함 (HTTP ${apiResponse.status})` },
    ];
    if (config.step >= 4) attempts.push({
      attackId: 'cross_owner_access',
      expected: 'A/B 로그인에서 상대 메모의 조회·수정·삭제가 거부',
      observed: 'A/B 실습 계정이 없어 직접 점검 미실행',
    });
    if (config.step >= 6) {
      // 로컬 판정기에 미등록 기기 가상 요청 한 건을 직접 넣어 본 결과입니다. 심판 판정이 아닙니다.
      const { fixtureRequests } = await import('../scripts/fixture-7.mjs');
      const { decide } = await import('./decider.mjs');
      const { normal, suspicious } = fixtureRequests();
      const result = await decide({ ...normal, deviceRegistered: false });
      attempts.push({
        attackId: 'unregistered_device_read',
        expected: '미등록 기기의 자료실 읽기 요청은 deny·device_not_registered',
        observed: result?.decision === 'deny' && result?.reasonCode === 'device_not_registered'
          ? '로컬 판정기 가상 요청에서 deny·device_not_registered 확인'
          : `로컬 판정기 가상 요청 결과가 기대와 다름 (${result?.decision ?? '응답 없음'})`,
      });
      if (config.step >= 7) {
        // 복합 이상 가상 사건을 로컬 판정기에 넣어 본 결과입니다. 실제 재로그인 차단은 실측하지 않았습니다.
        const unusual = await decide(suspicious);
        attempts.push({
          attackId: 'unusual_access_step_up',
          expected: '낯선 지역·시각·네트워크와 대량 사건이 겹친 접속은 step_up·step_up_required',
          observed: unusual?.decision === 'step_up' && unusual?.reasonCode === 'step_up_required'
            ? '로컬 판정기 가상 사건에서 step_up·step_up_required 확인 (실제 재로그인 차단은 미실행)'
            : `로컬 판정기 가상 사건 결과가 기대와 다름 (${unusual?.decision ?? '응답 없음'})`,
        });
      }
      if (config.step >= 8) {
        // 다른 구역 요청을 로컬 판정기에 넣고, 배포에는 로그인 없는 공지 읽기 GET 한 건만 보냅니다.
        const zoneRequest = (service, method, route, path) => ({ ...normal, service, method, route, path });
        const list = await decide(zoneRequest('notes', 'GET', 'GET /notes', '/notes'));
        const noticeWrite = await decide(zoneRequest('announcements', 'PUT', 'PUT /announcements/:id', '/announcements/demo'));
        const ownRead = await decide(normal);
        attempts.push({
          attackId: 'zone_decider_check',
          expected: '자기 메모 한 건 읽기는 allow, 메모 전체 목록·공지 쓰기는 deny',
          observed: ownRead?.decision === 'allow' && list?.decision === 'deny' && noticeWrite?.decision === 'deny'
            ? '로컬 판정기 가상 요청에서 자기 메모 allow, 전체 목록·공지 쓰기 deny 확인'
            : `로컬 판정기 결과가 기대와 다름 (${ownRead?.decision}/${list?.decision}/${noticeWrite?.decision})`,
        });
        const notice = await fetch(new URL('/api/announcements', app), {
          redirect: 'error', signal: AbortSignal.timeout(10000),
        });
        attempts.push({
          attackId: 'anonymous_notice_read',
          expected: '토큰 없는 반 공지 읽기는 자료 없이 거부',
          observed: [401, 403].includes(notice.status)
            ? `비로그인 공지 요청이 거부됨 (HTTP ${notice.status})`
            : `비로그인 공지 요청 거부를 확인하지 못함 (HTTP ${notice.status})`,
        });
        attempts.push({
          attackId: 'cross_zone_write',
          expected: '학생 계정의 다른 메모 수정·강사 공지 수정은 API에서 거부',
          observed: 'not_run · 로그인 계정이 필요한 쓰기 요청이라 직접 점검 미실행',
        });
      }
    }
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
