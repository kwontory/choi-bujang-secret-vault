import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const config = JSON.parse(await read('../aleph.config.json'));

test('3단계 인증 발급자와 실제 CRUD 경로가 선언되어 있다', () => {
  assert.equal(config.step, 3);
  assert.equal(config.identityProvider.issuer,
    'https://arsjjhghidyozzvknmqn.supabase.co/auth/v1');
  assert.equal(config.identityProvider.audience, 'authenticated');
  assert.match(config.identityProvider.jwksUrl, /\.well-known\/jwks\.json$/u);
  assert.deepEqual(config.allowedRoutes, [
    'GET /api/notes', 'POST /api/notes', 'GET /api/notes/:id',
    'PUT /api/notes/:id', 'DELETE /api/notes/:id',
  ]);
});

test('서버 API가 제공된 로그인 검증기와 검증된 사용자 ID를 사용한다', async () => {
  const api = await read('../api/notes.js');
  assert.match(api, /createLoginVerifier/u);
  assert.match(api, /request\.headers\?\.authorization/u);
  assert.match(api, /owner_id: identity\.userId/u);
  assert.match(api, /login_required/u);
  assert.doesNotMatch(api, /request\.body\.(?:userId|role)/u);
});

test('브라우저는 공식 Supabase 로그인 흐름과 bearer 토큰을 사용한다', async () => {
  const page = await read('../public/index.html');
  assert.match(page, /signInWithPassword/u);
  assert.match(page, /auth\.signOut/u);
  assert.match(page, /Authorization: `Bearer \$\{session\.access_token\}`/u);
  assert.doesNotMatch(page, /SUPABASE_SECRET_KEY|sb_secret_/u);
});
