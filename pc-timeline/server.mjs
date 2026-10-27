// 케셰브 학생 앱 서버: 이 PC(127.0.0.1)에서만 열리고, 화면 파일과 읽기 전용 조회 주소만 제공합니다.
// 설정을 바꾸는 주소는 만들지 않습니다.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readSystem } from './probe/system.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FILES = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']],
]);
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const BASE_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': CSP, 'referrer-policy': 'no-referrer' };

export function readPort(value = process.env.PC_TIMELINE_PORT) {
  const port = Number(value ?? 5190);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('INVALID_PORT');
  return port;
}

function sendJson(res, status, body) {
  res.writeHead(status, { ...BASE_HEADERS, 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
const fail = (res, status, code, message) => sendJson(res, status, { ok: false, error: { code, message }, meta: { checkedAt: new Date().toISOString() } });

export function createPcServer({ port, probes = { system: readSystem } } = {}) {
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const allowedOrigins = new Set([...allowedHosts].map(h => `http://${h}`));
  return http.createServer(async (req, res) => {
    try {
      // 다른 이름으로 들어온 요청(DNS 재바인딩 등)과 다른 사이트에서 보낸 요청은 거절합니다.
      if (!allowedHosts.has(req.headers.host ?? '')) return fail(res, 421, 'HOST_REJECTED', '이 PC 주소(127.0.0.1)로만 열 수 있습니다.');
      const origin = req.headers.origin;
      if ((origin && !allowedOrigins.has(origin)) || req.headers['sec-fetch-site'] === 'cross-site') return fail(res, 403, 'ORIGIN_REJECTED', '다른 사이트에서 보낸 요청은 받지 않습니다.');
      if (req.method !== 'GET') return fail(res, 405, 'METHOD_NOT_ALLOWED', '읽기(GET)만 지원합니다.');
      const { pathname } = new URL(req.url, `http://127.0.0.1:${port}`);
      if (FILES.has(pathname)) {
        const [name, type] = FILES.get(pathname);
        const data = await readFile(join(here, 'public', name));
        res.writeHead(200, { ...BASE_HEADERS, 'content-type': `${type}; charset=utf-8` });
        return res.end(data);
      }
      if (pathname === '/api/pc/system') {
        const data = await probes.system();
        return sendJson(res, 200, { ok: true, data, meta: { mode: 'local', checkedAt: data.checkedAt } });
      }
      return fail(res, 404, 'NOT_FOUND', '없는 주소입니다.');
    } catch {
      return fail(res, 500, 'INTERNAL_ERROR', '조회 중 오류가 났습니다. 앱 창의 메시지를 확인한 뒤 다시 조회하세요.');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = readPort();
  const server = createPcServer({ port });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `포트 ${port}를 이미 쓰고 있습니다. 이미 켜 둔 창이 있는지 확인하세요.` : `서버를 켜지 못했습니다(${error.code ?? '알 수 없는 오류'}).`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`케셰브 PC 타임라인: http://127.0.0.1:${port}  (끄려면 Ctrl+C)`));
}
