// 내 메모 목록: GET /api/my/notes (vercel.json 이 이 함수로 연결)
// 전체 목록(GET /api/notes)과 구분된 경로이며, 판정기 zone_my_notes_owner_list 가 허용하고
// 서버는 검증된 사용자 ID 와 저장된 owner_id 가 같은 메모만 돌려줍니다.
import { json, serverRuntime } from '../src/zone-api.mjs';
import { guardProtected } from '../src/api-guard.mjs';

export default async function handler(request, response) {
  const active = serverRuntime();
  if (!active) return json(response, 503, { error: 'server_not_configured' });
  const identity = await active.verifyLogin(request.headers?.authorization);
  if (!identity) return json(response, 401, { error: 'login_required' });
  const guard = await guardProtected({ supabase: active.supabase, identity, request, apiPath: '/api/my/notes' });
  if (guard.error) return json(response, guard.error.status, guard.error.body);
  const { data, error } = await active.supabase.from('notes').select('id, title, content')
    .eq('owner_id', identity.userId).order('created_at', { ascending: true });
  if (error) return json(response, 502, { error: 'notes_unavailable' });
  return json(response, 200, (data ?? []).map(note => ({
    id: note.id, resourceId: `note:${note.id}`, title: note.title, body: note.content,
  })));
}
