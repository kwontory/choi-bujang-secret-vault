// 허용한 주소만 열리고, 다른 주소·다른 이름·다른 사이트·쓰기 요청은 거절되는지 확인합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPcServer } from '../server.mjs';

const PORT = 5397;
const empty = kind => async () => ({ kind, items: [], checkedAt: '2026-10-27T05:00:00.000Z' });
const fake = { system: empty('system'), connections: empty('connections'), sdp: empty('sdp') };

function call(path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path, method, headers: { host: `127.0.0.1:${PORT}`, ...headers } }, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('서버 허용·거절', async t => {
  const server = createPcServer({ port: PORT, probes: fake });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  t.after(() => server.close());

  for (const path of ['/api/pc/system', '/api/pc/connections', '/api/sdp/status']) {
    const ok = await call(path);
    assert.equal(ok.status, 200, path);
    assert.equal(JSON.parse(ok.body).ok, true, path);
  }

  const page = await call('/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-security-policy'], /connect-src 'self'/);

  assert.equal((await call('/api/anything')).status, 404);
  assert.equal((await call('/../server.mjs')).status, 404);
  assert.equal((await call('/api/pc/system', { method: 'POST' })).status, 405);
  assert.equal((await call('/api/pc/system', { headers: { host: 'evil.example' } })).status, 421);
  assert.equal((await call('/api/pc/system', { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call('/api/pc/system', { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
});
