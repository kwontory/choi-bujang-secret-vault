// 10단계 메모 사본·감사 기록 부품입니다. 서버 함수에서만 씁니다.
// 사본(note_backups)은 침해 전 상태를 보관하고, 감사 기록(note_audit)은 지우지 않고 쌓기만 합니다.
// 메모 본문은 응답·로그에 내보내지 않고, 대조에는 내용 해시만 씁니다.
import { createHash } from 'node:crypto';

// 내용 해시: 제목과 본문을 줄바꿈 하나로 이어 UTF-8 SHA-256 (supabase/step10-backup.sql 과 같은 방식)
export const contentSha256 = (title, content) =>
  createHash('sha256').update(`${title}\n${content}`, 'utf8').digest('hex');

// 이 메모의 가장 최근 사본을 읽습니다. 표가 없거나 조회에 실패하면 error 를 돌려줍니다.
export async function latestBackup(supabase, noteId) {
  const { data, error } = await supabase.from('note_backups')
    .select('note_id, owner_id, version, title, content, content_sha256, captured_at')
    .eq('note_id', noteId).order('version', { ascending: false }).limit(1).maybeSingle();
  return { backup: data ?? null, error: error ?? null };
}

// 사본 검증: 다시 읽은 사본의 ID·소유자·내용 해시가 맞아야 합니다.
export function verifyBackup(backup, noteId, ownerId) {
  if (!backup || typeof backup !== 'object') return 'backup_not_found';
  if (backup.note_id !== noteId || backup.owner_id !== ownerId) return 'backup_not_found';
  if (typeof backup.title !== 'string' || typeof backup.content !== 'string'
      || typeof backup.content_sha256 !== 'string') return 'backup_unverified';
  if (contentSha256(backup.title, backup.content) !== backup.content_sha256) return 'backup_unverified';
  return null;
}

// 아직 사본이 없는 메모만 지금(바뀌기 전) 상태로 첫 사본을 만듭니다. 이미 있으면 그대로 둡니다.
// 사본 저장에 실패해도 메모의 정상 사용은 막지 않습니다(복구 경로는 사본이 없으면 멈춥니다).
export async function ensureBackup(supabase, note) {
  try {
    const { backup, error } = await latestBackup(supabase, note.id);
    if (error || backup) return;
    await supabase.from('note_backups').upsert({
      note_id: note.id, owner_id: note.owner_id, version: 1, title: note.title,
      content: note.content, content_sha256: contentSha256(note.title, note.content),
    }, { onConflict: 'note_id,version', ignoreDuplicates: true });
  } catch {
    // 사본 표가 아직 없을 때도 메모 화면은 계속 동작합니다.
  }
}

// 감사 기록을 한 줄 덧붙입니다. 본문은 넣지 않고 해시만 남깁니다.
export async function appendAudit(supabase, entry) {
  try {
    const { error } = await supabase.from('note_audit').insert({
      action: entry.action, note_id: entry.noteId, owner_id: entry.ownerId,
      actor_id: entry.actorId, before_sha256: entry.beforeSha256 ?? null,
      after_sha256: entry.afterSha256 ?? null, backup_version: entry.backupVersion ?? null,
    });
    return !error;
  } catch {
    return false;
  }
}
