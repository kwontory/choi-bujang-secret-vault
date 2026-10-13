// 12단계 탈환 작전실 · 로그인 없이 보낼 수 있는 실측 요청 목록입니다(화면 ops.js 와 명령 scripts/ops-table.mjs 가 함께 씀).
// 기대 결과와 실제 응답을 비교만 합니다. 응답 본문은 표에 넣지 않습니다(메모 본문·토큰 없음).
const UUID = '00000000-0000-4000-8000-000000000001';
const FAKE_JWT = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ0ZXN0In0.';
const noNotes = text => !/"content"\s*:|"body"\s*:|"title"\s*:/u.test(text);
const json = text => { try { return JSON.parse(text); } catch { return null; } };

export const ANON_CASES = Object.freeze([
  { stage: 1, kind: '정상', label: '첫 화면 열기', method: 'GET', path: '/', expected: '200',
    ok: (s) => s === 200 },
  { stage: 1, kind: '금지', label: '공개 data.json 에 메모 없음', method: 'GET', path: '/data.json', expected: '200 · 메모 0건',
    ok: (s, t) => s === 200 && Array.isArray(json(t)?.notes) && json(t).notes.length === 0 },
  { stage: 3, kind: '금지', label: '로그인 없는 내 메모 목록', method: 'GET', path: '/api/my/notes', expected: '401',
    ok: (s, t) => s === 401 && noNotes(t) },
  { stage: 3, kind: '금지', label: '위조 토큰으로 내 메모 목록', method: 'GET', path: '/api/my/notes',
    headers: { authorization: `Bearer ${FAKE_JWT}` }, expected: '401 또는 403 · 자료 없음', ok: (s, t) => [401, 403].includes(s) && noNotes(t) },
  { stage: 4, kind: '금지', label: '쿼리로 신원·역할 위조', method: 'GET', path: `/api/my/notes?userId=${UUID}&role=instructor`,
    expected: '401', ok: (s, t) => s === 401 && noNotes(t) },
  { stage: 4, kind: '금지', label: '로그인 없는 타인 메모 한 건 조회', method: 'GET', path: `/api/notes/${UUID}`, expected: '401',
    ok: (s, t) => s === 401 && noNotes(t) },
  { stage: 5, kind: '금지', label: '배포 주소로 원본 DB 경로 직접 읽기', method: 'GET', path: '/rest/v1/notes', expected: '404',
    ok: (s, t) => s === 404 && noNotes(t) },
  { stage: 8, kind: '금지', label: '로그인 없는 반 공지 읽기', method: 'GET', path: '/api/announcements', expected: '401',
    ok: (s, t) => s === 401 && noNotes(t) },
  { stage: 8, kind: '금지', label: '로그인 없는 반 공지 수정', method: 'PUT', path: `/api/announcements/${UUID}`, expected: '401',
    ok: (s, t) => s === 401 && noNotes(t) },
  { stage: 8, kind: '금지', label: '로그인 없는 강사 자료 읽기', method: 'GET', path: `/api/materials/${UUID}`, expected: '401',
    ok: (s, t) => s === 401 && noNotes(t) },
  { stage: 10, kind: '금지', label: '로그인 없는 한 건 복원', method: 'POST', path: `/api/restore/notes/${UUID}`, expected: '401',
    ok: (s, t) => s === 401 && noNotes(t) },
  { stage: 11, kind: '정상', label: '설치형 앱 manifest', method: 'GET', path: '/manifest.json', expected: '200 · standalone',
    ok: (s, t) => s === 200 && json(t)?.display === 'standalone' },
  { stage: 11, kind: '금지', label: '승인 전 기기 상태', method: 'GET', path: '/api/device/status', expected: '200 · approved=false',
    ok: (s, t) => s === 200 && json(t)?.approved === false },
  ...[
    [6, 's06-unregistered', '미등록 기기 요청 → deny'], [7, 's07-compound', '복합 이상 접속 → step_up'],
    [8, 's08-all-notes', '전체 메모 목록 → deny'], [8, 's08-write-notice', '반 공지 쓰기 → deny'],
    [8, 's08-unknown-route', '구역 밖 경로 → deny'], [9, 's09-burst-read', '조회 폭주 → 회수 제안'],
  ].map(([stage, caseId, label]) => ({ stage, kind: '가상', label: `판정 규칙: ${label}`, method: 'GET',
    path: `/api/checks?case=${caseId}`, expected: '200 · ready=true', ok: (s, t) => s === 200 && json(t)?.ready === true })),
]);

// 한 건 실행: 실제 응답 상태와 Vercel 요청 ID(x-vercel-id), 확인 시각만 남깁니다.
export async function runCase(baseUrl, item, fetchImpl = fetch) {
  const at = new Date().toISOString();
  try {
    const response = await fetchImpl(new URL(item.path, baseUrl), { method: item.method, redirect: 'manual',
      headers: { accept: 'application/json', ...(item.headers ?? {}) }, cache: 'no-store' });
    const text = await response.text();
    return { stage: item.stage, kind: item.kind, label: item.label, request: `${item.method} ${item.path.split('?')[0]}`,
      expected: item.expected, actual: `HTTP ${response.status}`, result: item.ok(response.status, text) ? '확인' : '불일치',
      requestId: response.headers.get('x-vercel-id') ?? '없음', at };
  } catch (error) {
    return { stage: item.stage, kind: item.kind, label: item.label, request: `${item.method} ${item.path.split('?')[0]}`,
      expected: item.expected, actual: '요청 실패', result: '미실행', requestId: '없음', at };
  }
}

// 로그인·승인 기기가 필요해 화면에서는 보내지 않는 요청(명령 npm run ops:table 에 시험 계정을 넣으면 실측)
export const LOGIN_CASES = Object.freeze([
  [3, '정상', '승인 기기의 내 메모 목록'], [4, '정상', '내 메모 추가·조회·수정·삭제'],
  [4, '금지', '다른 계정 메모 조회'], [8, '금지', '로그인한 학생의 전체 목록·공지 쓰기·강사 자료'],
  [10, '정상', '변조된 내 메모 한 건 복원'], [11, '금지', '서명 없는 보호 요청'],
  [11, '금지', '서명 뒤 경로·본문 변경, 재전송, 위조 승인 증표'], [11, '금지', '회수된 기기로 다시 요청'],
]);
