import { createClient } from '@supabase/supabase-js';

const json = (response, status, body) => {
  response.status(status);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
};

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return json(response, 405, { error: 'method_not_allowed' });
  }

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return json(response, 503, { error: 'server_not_configured' });

  const supabase = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from('notes')
    .select('title, content')
    .order('id', { ascending: true });

  if (error) return json(response, 502, { error: 'notes_unavailable' });
  return json(response, 200, { notes: data ?? [] });
}
