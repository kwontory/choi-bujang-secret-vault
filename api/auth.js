import { createClient } from '@supabase/supabase-js';
let client;
const json = (response, status, body) => { response.status(status); response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.end(JSON.stringify(body)); };
export default async function handler(request, response) {
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return json(response, 405, { error: 'method_not_allowed' }); }
  if (!client) { const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SECRET_KEY; if (!url || !key) return json(response, 503, { error: 'server_not_configured' }); client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }
  let input = request.body; if (typeof input === 'string') { try { input = JSON.parse(input); } catch { input = null; } }
  const email = typeof input?.email === 'string' ? input.email.trim() : ''; const password = typeof input?.password === 'string' ? input.password : '';
  if (!email || !password || email.length > 320 || password.length > 200) return json(response, 400, { error: 'invalid_credentials' });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) return json(response, 401, { error: 'login_failed' });
  return json(response, 200, { access_token: data.session.access_token });
}
