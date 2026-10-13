// 10단계 복구 경로: POST /api/restore/notes/:id
// 침해 전 사본(note_backups)에서 지정한 메모 한 건만 되살립니다.
//   1) 로그인한 사용자 확인 → 2) 사본을 다시 읽어 ID·소유자·내용 해시 검증(없거나 실패하면 멈춤)
//   3) 바뀔 항목 계산(본문 { "dryRun": true } 이면 여기서 멈추고 계획만 보여 줌)
//   4) 감사 기록을 먼저 남김(실패하면 멈춤) → 5) 그 한 건만 복원 → 6) 다시 읽어 사본과 대조
// 다른 메모, 다른 사용자 자료, 감사 기록은 바꾸거나 지우지 않습니다. 메모 본문은 응답에 넣지 않습니다.
import { json, requestBody, serverRuntime } from '../src/zone-api.mjs';
import { appendAudit, contentSha256, latestBackup, verifyBackup } from '../src/note-backup.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const targetId = (request, body) => {
  const fromPath = typeof request.query?.id === 'string' ? request.query.id : null;
  if (fromPath && UUID.test(fromPath)) return fromPath;
  const fromBody = typeof body?.id === 'string' ? body.id
    : typeof body?.noteId === 'string' ? body.noteId : null;
  return fromBody && UUID.test(fromBody) ? fromBody : null;
};

export default async function handler(request, response) {
  const active = serverRuntime();
  if (!active) return json(response, 503, { error: 'server_not_configured' });

  const identity = await active.verifyLogin(request.headers?.authorization);
  if (!identity) return json(response, 401, { error: 'login_required' });

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'method_not_allowed' });
  }
  const result = await restoreNote({ supabase: active.supabase, identity, request });
  return json(response, result.status, result.body);
}

// 복구 본체: 서버 함수와 로컬 시험(scripts/restore-test.mjs)이 함께 씁니다.
export async function restoreNote({ supabase, identity, request }) {
  const reply = (status, body) => ({ status, body });
  const body = requestBody(request) ?? {};
  // 소유자는 요청 본문이 아니라 검증된 로그인 사용자로만 정합니다.
  if (Object.hasOwn(body, 'owner_id') || Object.hasOwn(body, 'ownerId') || Object.hasOwn(body, 'role')) {
    return reply(400, { error: 'client_owner_rejected' });
  }
  const id = targetId(request, body);
  if (!id) return reply(400, { error: 'invalid_note_id' });
  const ownerId = identity.userId;

  // 2) 사본을 다시 읽어 검증합니다. 사본이 없거나 검증에 실패하면 복원하지 않습니다.
  const { backup, error: backupError } = await latestBackup(supabase, id);
  if (backupError) return reply(503, { error: 'backup_unavailable' });
  const problem = verifyBackup(backup, id, ownerId);
  if (problem === 'backup_not_found') return reply(404, { error: 'backup_not_found' });
  if (problem) return reply(409, { error: problem });

  // 같은 ID 가 다른 사용자의 메모라면 덮어쓰지 않습니다.
  const { data: current, error: currentError } = await supabase.from('notes')
    .select('id, owner_id, title, content').eq('id', id).maybeSingle();
  if (currentError) return reply(502, { error: 'note_unavailable' });
  if (current && current.owner_id !== ownerId) return reply(409, { error: 'owner_conflict' });

  // 3) 실행 전에 바뀔 항목을 계산합니다.
  const beforeSha256 = current ? contentSha256(current.title, current.content) : null;
  const changes = !current ? ['recreate']
    : [current.title !== backup.title ? 'title' : null, current.content !== backup.content ? 'body' : null]
      .filter(Boolean);
  const plan = {
    id, resourceId: `note:${id}`, backupVersion: backup.version, backupCapturedAt: backup.captured_at,
    backupSha256: backup.content_sha256, currentSha256: beforeSha256, changes,
  };
  if (body.dryRun === true) return reply(200, { dryRun: true, plan });
  if (!changes.length) {
    return reply(200, { restored: false, reason: 'already_matches_backup', ...plan, ownerMatches: true });
  }

  // 4) 감사 기록을 먼저 남깁니다. 기록할 수 없으면 복원하지 않습니다.
  const audited = await appendAudit(supabase, {
    action: 'restore', noteId: id, ownerId, actorId: ownerId,
    beforeSha256, afterSha256: backup.content_sha256, backupVersion: backup.version,
  });
  if (!audited) return reply(503, { error: 'audit_unavailable' });

  // 5) 지정한 한 건만 복원합니다.
  const write = current
    ? supabase.from('notes').update({ title: backup.title, content: backup.content })
      .eq('id', id).eq('owner_id', ownerId)
    : supabase.from('notes').insert({ id, owner_id: ownerId, title: backup.title, content: backup.content });
  const { error: writeError } = await write;
  if (writeError) return reply(502, { error: 'restore_failed' });

  // 6) 다시 읽어 ID·소유자·내용 해시가 사본과 같은지 확인합니다.
  const { data: after, error: afterError } = await supabase.from('notes')
    .select('id, owner_id, title, content').eq('id', id).eq('owner_id', ownerId).maybeSingle();
  if (afterError || !after) return reply(502, { error: 'restore_unverified' });
  const afterSha256 = contentSha256(after.title, after.content);
  if (after.id !== id || after.owner_id !== ownerId || afterSha256 !== backup.content_sha256) {
    return reply(500, { error: 'restore_mismatch' });
  }
  return reply(200, {
    restored: true, ...plan, restoredSha256: afterSha256, ownerMatches: true, idMatches: true, audit: 'recorded',
  });
}
