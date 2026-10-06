import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';

const root = new URL('../', import.meta.url);

test('step 2 deployment identity keeps repository metadata', () => {
  const identity = deploymentIdentity({
    VERCEL_GIT_PROVIDER: 'github',
    VERCEL_GIT_REPO_OWNER: 'kwontory',
    VERCEL_GIT_REPO_SLUG: 'choi-bujang-secret-vault',
    VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
    VERCEL_URL: 'student-defense.vercel.app',
  }, {
    step: 2,
    judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
    sampleMarker: 'SAMPLE_NOTE_1',
  });
  assert.equal(identity.step, 2);
  assert.equal(identity.repoUrl, 'https://github.com/kwontory/choi-bujang-secret-vault');
});

test('tracked static data contains no notes and the page reads the server API', async () => {
  const sourceData = JSON.parse(await readFile(new URL('data.json', root), 'utf8'));
  const publicData = JSON.parse(await readFile(new URL('public/data.json', root), 'utf8'));
  const html = await readFile(new URL('public/index.html', root), 'utf8');
  assert.deepEqual(sourceData.notes, []);
  assert.deepEqual(publicData.notes, []);
  assert.match(html, /fetch\('\/api\/notes'/u);
  assert.doesNotMatch(html, /fetch\('\/data\.json'/u);
});

test('security headers and Supabase server-only environment names are configured', async () => {
  const vercel = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
  const api = await readFile(new URL('api/notes.js', root), 'utf8');
  assert.equal(vercel.headers[0].headers[0].key, 'X-Content-Type-Options');
  assert.equal(vercel.headers[0].headers[0].value, 'nosniff');
  assert.match(api, /SUPABASE_URL/u);
  assert.match(api, /SUPABASE_SECRET_KEY/u);
  assert.doesNotMatch(api, /sb_secret_|Bearer\s|eyJ/u);
});
