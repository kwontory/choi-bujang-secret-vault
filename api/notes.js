import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';
import { appendAudit, contentSha256, ensureBackup } from '../src/note-backup.mjs';
import { checkSignedRequest } from '../src/device-approval.mjs';

// 8단계: 메모 응답마다 구역 이름이 붙은 자원 ID(note:<id>)를 함께 돌려줍니다.
const noteResourceId = id => `note:${id}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
let runtime;

const json = (response, status, body) => {
  response.status(status);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
};

const serverRuntime = () => {
  if (runtime) return runtime;
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  const supabase = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  runtime = {
    supabase,
    verifyLogin: createLoginVerifier({ config, supabaseClient: supabase }),
  };
  return runtime;
};

const requestBody = request => {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body !== 'string' || request.body.length > 20_000) return null;
  try { return JSON.parse(request.body); } catch { return null; }
};

const noteInput = request => {
  const input = requestBody(request);
  if (!input || Array.isArray(input)) return null;
  if (Object.hasOwn(input, 'owner_id') || Object.hasOwn(input, 'ownerId')) return null;
  // 8단계: 본문에 적힌 역할 값으로 구역을 열지 않습니다. 역할을 보내면 거부합니다.
  if (Object.hasOwn(input, 'role')) return null;
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!title || title.length > 120 || !body || body.length > 2_000) return null;
  return { title, body };
};

// 10단계: 바꾸거나 지우기 전에 내 메모의 현재 상태를 읽고, 사본이 없으면 첫 사본을 만듭니다.
const ownNoteBeforeChange = async (supabase, id, ownerId) => {
  try {
    const { data, error } = await supabase.from('notes').select('id, owner_id, title, content')
      .eq('id', id).eq('owner_id', ownerId).maybeSingle();
    if (error || !data) return null;
    await ensureBackup(supabase, data);
    return { sha256: contentSha256(data.title, data.content) };
  } catch {
    return null;
  }
};

export default async function handler(request, response) {
  const active = serverRuntime();
  if (!active) return json(response, 503, { error: 'server_not_configured' });

  const identity = await active.verifyLogin(request.headers?.authorization);
  if (!identity) return json(response, 401, { error: 'login_required' });

  const routeId = typeof request.query?.id === 'string' ? request.query.id : null;
  if (routeId && !UUID.test(routeId)) return json(response, 400, { error: 'invalid_note_id' });

  // 11단계: 보호 요청은 서버가 승인한 기기의 설치형 앱 서명이 있어야 합니다(docs/APP_SIGNING.md).
  // 서명이 없거나, 서명 뒤 경로나 본문을 바꿨거나, 승인 전·회수된·다른 사용자 기기의 서명이면 거부합니다.
  const signed = await checkSignedRequest({ supabase: active.supabase, identity, headers: request.headers,
    method: request.method, path: routeId ? `/api/notes/${routeId}` : '/api/notes', body: request.body });
  if (signed.error) return json(response, signed.error === 'device_signature_required' ? 403 : 401, { error: signed.error });

  if (request.method === 'GET' && !routeId) {
    const { data, error } = await active.supabase
      .from('notes')
      .select('id, title, content')
      .eq('owner_id', identity.userId)
      .order('created_at', { ascending: true });
    if (error) return json(response, 502, { error: 'notes_unavailable' });
    return json(response, 200, (data ?? []).map(note => ({
      id: note.id, resourceId: noteResourceId(note.id), title: note.title, body: note.content,
    })));
  }

  if (request.method === 'POST' && !routeId) {
    const input = noteInput(request);
    if (!input) return json(response, 400, { error: 'invalid_note' });
    const posted = requestBody(request);
    const id = typeof posted?.id === 'string' && UUID.test(posted.id)
      ? posted.id : randomUUID();
    const { error } = await active.supabase.from('notes').insert({
      id, owner_id: identity.userId, title: input.title, content: input.body,
    });
    if (error) return json(response, 502, { error: 'note_create_failed' });
    // 10단계: 새 메모의 첫 사본과 감사 기록을 남깁니다(실패해도 생성은 유지).
    await ensureBackup(active.supabase, { id, owner_id: identity.userId, title: input.title, content: input.body });
    await appendAudit(active.supabase, { action: 'create', noteId: id, ownerId: identity.userId,
      actorId: identity.userId, afterSha256: contentSha256(input.title, input.body) });
    return json(response, 201, { id, resourceId: noteResourceId(id) });
  }

  if (request.method === 'GET' && routeId) {
    const { data, error } = await active.supabase
      .from('notes').select('id, title, content').eq('id', routeId)
      .eq('owner_id', identity.userId).maybeSingle();
    if (error) return json(response, 502, { error: 'note_unavailable' });
    if (!data) return json(response, 404, { error: 'note_not_found' });
    return json(response, 200, {
      id: data.id, resourceId: noteResourceId(data.id), title: data.title, body: data.content,
    });
  }

  if (request.method === 'PUT' && routeId) {
    const input = noteInput(request);
    if (!input) return json(response, 400, { error: 'invalid_note' });
    const before = await ownNoteBeforeChange(active.supabase, routeId, identity.userId);
    const { data, error } = await active.supabase.from('notes')
      .update({ title: input.title, content: input.body })
      .eq('id', routeId).eq('owner_id', identity.userId)
      .select('id, title, content').maybeSingle();
    if (error) return json(response, 502, { error: 'note_update_failed' });
    if (!data) return json(response, 404, { error: 'note_not_found' });
    await appendAudit(active.supabase, { action: 'update', noteId: routeId, ownerId: identity.userId,
      actorId: identity.userId, beforeSha256: before?.sha256, afterSha256: contentSha256(data.title, data.content) });
    return json(response, 200, {
      id: data.id, resourceId: noteResourceId(data.id), title: data.title, body: data.content,
    });
  }

  if (request.method === 'DELETE' && routeId) {
    const before = await ownNoteBeforeChange(active.supabase, routeId, identity.userId);
    const { data, error } = await active.supabase.from('notes')
      .delete().eq('id', routeId).eq('owner_id', identity.userId)
      .select('id').maybeSingle();
    if (error) return json(response, 502, { error: 'note_delete_failed' });
    if (!data) return json(response, 404, { error: 'note_not_found' });
    await appendAudit(active.supabase, { action: 'delete', noteId: routeId, ownerId: identity.userId,
      actorId: identity.userId, beforeSha256: before?.sha256 });
    return json(response, 200, { deleted: true });
  }

  response.setHeader('Allow', routeId ? 'GET, PUT, DELETE' : 'GET, POST');
  return json(response, 405, { error: 'method_not_allowed' });
}
