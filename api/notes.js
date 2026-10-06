import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';

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
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!title || title.length > 120 || !body || body.length > 2_000) return null;
  return { title, body };
};

export default async function handler(request, response) {
  const active = serverRuntime();
  if (!active) return json(response, 503, { error: 'server_not_configured' });

  const identity = await active.verifyLogin(request.headers?.authorization);
  if (!identity) return json(response, 401, { error: 'login_required' });

  const routeId = typeof request.query?.id === 'string' ? request.query.id : null;
  if (routeId && !UUID.test(routeId)) return json(response, 400, { error: 'invalid_note_id' });

  if (request.method === 'GET' && !routeId) {
    const { data, error } = await active.supabase
      .from('notes')
      .select('id, title, content')
      .eq('owner_id', identity.userId)
      .order('created_at', { ascending: true });
    if (error) return json(response, 502, { error: 'notes_unavailable' });
    return json(response, 200, (data ?? []).map(note => ({
      id: note.id, title: note.title, body: note.content,
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
    return json(response, 201, { id });
  }

  if (request.method === 'GET' && routeId) {
    const { data, error } = await active.supabase
      .from('notes').select('id, title, content').eq('id', routeId)
      .eq('owner_id', identity.userId).maybeSingle();
    if (error) return json(response, 502, { error: 'note_unavailable' });
    if (!data) return json(response, 404, { error: 'note_not_found' });
    return json(response, 200, { id: data.id, title: data.title, body: data.content });
  }

  if (request.method === 'PUT' && routeId) {
    const input = noteInput(request);
    if (!input) return json(response, 400, { error: 'invalid_note' });
    const { data, error } = await active.supabase.from('notes')
      .update({ title: input.title, content: input.body })
      .eq('id', routeId).eq('owner_id', identity.userId)
      .select('id, title, content').maybeSingle();
    if (error) return json(response, 502, { error: 'note_update_failed' });
    if (!data) return json(response, 404, { error: 'note_not_found' });
    return json(response, 200, { id: data.id, title: data.title, body: data.content });
  }

  if (request.method === 'DELETE' && routeId) {
    const { data, error } = await active.supabase.from('notes')
      .delete().eq('id', routeId).eq('owner_id', identity.userId)
      .select('id').maybeSingle();
    if (error) return json(response, 502, { error: 'note_delete_failed' });
    if (!data) return json(response, 404, { error: 'note_not_found' });
    return json(response, 200, { deleted: true });
  }

  response.setHeader('Allow', routeId ? 'GET, PUT, DELETE' : 'GET, POST');
  return json(response, 405, { error: 'method_not_allowed' });
}
