// 케셰브 앱 서버(127.0.0.1:5189)가 SDP 서버에 실제로 연결되어 있는지 읽기만 합니다.
// 이 결과는 SDP 연결 상태이며, 이 PC를 조회한 결과와 섞지 않습니다.
const SOURCE = '케셰브 앱 서버 GET /api/me 응답의 meta.mode';

export function keshevPort(value = process.env.KESHEV_PORT) {
  const port = Number(value ?? 5189);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : 5189;
}

export async function readSdp({ fetchFn = fetch, port = keshevPort(), timeoutMs = 3000, now = () => new Date() } = {}) {
  const base = { key: 'sdp', label: 'SDP 서버 연결', source: SOURCE };
  let body;
  let response;
  try {
    response = await fetchFn(`http://127.0.0.1:${port}/api/me`, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  } catch (error) {
    const reason = error?.name === 'TimeoutError'
      ? `케셰브 앱이 ${timeoutMs / 1000}초 안에 답하지 않아 SDP 연결 여부를 확인하지 못했습니다.`
      : '케셰브 앱(127.0.0.1:' + port + ')에 연결하지 못해 SDP 연결 여부를 확인하지 못했습니다. 케셰브 앱이 켜져 있는지 확인하세요.';
    return { ...base, status: 'unavailable', level: 'unknown', reason, measuredAt: now().toISOString() };
  }
  try {
    body = await response.json();
  } catch {
    return { ...base, status: 'unavailable', level: 'unknown', reason: `127.0.0.1:${port}의 응답이 케셰브 형식(JSON)이 아니어서 SDP 연결 여부를 확인하지 못했습니다(HTTP ${response?.status ?? '확인 불가'}).`, measuredAt: now().toISOString() };
  }
  const measuredAt = now().toISOString();
  const mode = body?.meta?.mode;
  if (body?.ok === true && mode === 'connected') return { ...base, status: 'measured', level: 'ok', display: 'SDP 연결됨', detail: '케셰브가 SDP 서버에서 본인 정보를 받았습니다.', measuredAt };
  if (mode === 'demo') return { ...base, status: 'measured', level: 'info', display: '예제 모드', detail: '케셰브가 예제(demo)로 실행 중입니다. 실제 SDP 연결이 아닙니다.', measuredAt };
  if (mode === 'disconnected' || body?.error?.code === 'ENGINE_NOT_CONNECTED') {
    return { ...base, status: 'measured', level: 'info', display: 'SDP 미연결', detail: `케셰브가 SDP 서버에 연결되어 있지 않습니다(${body?.error?.code ?? 'disconnected'}).`, measuredAt };
  }
  return { ...base, status: 'unavailable', level: 'unknown', reason: `케셰브 응답으로 SDP 연결 여부를 판단하지 못했습니다(${body?.error?.code ?? '형식 확인 불가'}).`, measuredAt };
}
