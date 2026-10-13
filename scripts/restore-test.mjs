// 10단계 복구 경로 로컬 연습입니다. 메모리 안의 가짜 저장소로 restoreNote 를 시험합니다.
// 실제 Supabase·배포·심판 판정과 무관하며, 실제 시험 계정 B 의 복구는 배포에서 따로 확인합니다.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentSha256, ensureBackup } from '../src/note-backup.mjs';

// 아주 작은 가짜 저장소: from(table).select/insert/update/upsert + eq/order/limit/maybeSingle
function fakeStore() {
  const tables = { notes: [], note_backups: [], note_audit: [] };
  const query = (table) => {
    const filters = [];
    let op = 'select'; let payload = null; let order = null; let limit = null; let opts = {};
    const rows = () => tables[table].filter(row => filters.every(([k, v]) => row[k] === v));
    const run = () => {
      if (op === 'insert') {
        if (table === 'notes' && tables.notes.some(r => r.id === payload.id)) return { error: { message: 'dup' } };
        tables[table].push({ ...payload, ...(table === 'note_audit' ? { at: new Date().toISOString() } : {}) });
        return { error: null };
      }
      if (op === 'upsert') {
        const dup = tables[table].some(r => r.note_id === payload.note_id && r.version === payload.version);
        if (!dup) tables[table].push({ ...payload, captured_at: new Date().toISOString() });
        return { error: null };
      }
      if (op === 'update') { rows().forEach(r => Object.assign(r, payload)); return { error: null }; }
      let list = rows();
      if (order) list = [...list].sort((a, b) => (a[order.k] - b[order.k]) * (order.asc ? 1 : -1));
      if (limit !== null) list = list.slice(0, limit);
      return { data: list, error: null };
    };
    const builder = {
      select() { return builder; },
      insert(value) { op = 'insert'; payload = value; return builder; },
      update(value) { op = 'update'; payload = value; return builder; },
      upsert(value, options) { op = 'upsert'; payload = value; opts = options; return builder; },
      eq(k, v) { filters.push([k, v]); return builder; },
      order(k, { ascending }) { order = { k, asc: ascending }; return builder; },
      limit(n) { limit = n; return builder; },
      async maybeSingle() { const { data } = run(); return { data: data[0] ?? null, error: null }; },
      then(resolveFn, rejectFn) { return Promise.resolve(run()).then(resolveFn, rejectFn); },
    };
    void opts;
    return builder;
  };
  return { tables, from: query };
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const NOTE_B = '33333333-3333-4333-8333-333333333333';
const NOTE_B2 = '44444444-4444-4444-8444-444444444444';
const NOTE_A = '55555555-5555-4555-8555-555555555555';

export async function checkRestore(restoreNote) {
  const store = fakeStore();
  const seed = (id, owner, title, content) => store.tables.notes.push({ id, owner_id: owner, title, content });
  seed(NOTE_B, B, 'B 시험 메모', '공개 가능한 학습용 가상 메모입니다.');
  seed(NOTE_B2, B, 'B 두 번째', '다른 메모는 그대로여야 합니다.');
  seed(NOTE_A, A, 'A 메모', 'A 의 가상 메모입니다.');
  for (const note of [...store.tables.notes]) await ensureBackup(store, note);
  const original = contentSha256('B 시험 메모', '공개 가능한 학습용 가상 메모입니다.');
  const other = JSON.stringify(store.tables.notes.filter(n => n.id !== NOTE_B));
  const asUser = (userId, id, body = {}) => restoreNote({ supabase: store,
    identity: { kind: 'judge', userId }, request: { query: { id }, body } });
  const noteB = () => store.tables.notes.find(n => n.id === NOTE_B);
  const results = [];
  const check = (name, passed) => results.push({ name, passed: Boolean(passed) });

  // 변조 → 실행 전 계획 → 복구
  noteB().content = '변조된 내용';
  const dry = await asUser(B, NOTE_B, { dryRun: true });
  check('실행 전 계획에 사본 버전과 바뀔 항목이 보임', dry.status === 200 && dry.body.dryRun
    && dry.body.plan.backupVersion === 1 && dry.body.plan.changes.join() === 'body' && noteB().content === '변조된 내용');
  const fixed = await asUser(B, NOTE_B);
  check('변조된 B 메모 한 건 복구: ID·소유자·내용 해시가 사본과 같음', fixed.status === 200 && fixed.body.restored
    && noteB().owner_id === B && contentSha256(noteB().title, noteB().content) === original
    && fixed.body.restoredSha256 === original);

  // 삭제 → 복구
  store.tables.notes.splice(store.tables.notes.indexOf(noteB()), 1);
  const recreated = await asUser(B, NOTE_B);
  check('삭제된 B 메모 한 건 복구: 같은 ID·소유자로 되살아남', recreated.status === 200
    && recreated.body.changes.join() === 'recreate' && noteB()?.owner_id === B
    && contentSha256(noteB().title, noteB().content) === original);

  check('다른 메모는 바뀌지 않음', JSON.stringify(store.tables.notes.filter(n => n.id !== NOTE_B)) === other);
  check('감사 기록이 지워지지 않고 복구마다 쌓임',
    store.tables.note_audit.filter(a => a.action === 'restore' && a.note_id === NOTE_B).length === 2);

  const crossOwner = await asUser(A, NOTE_B);
  check('A 가 B 메모 복구 요청 → 거부(404)', crossOwner.status === 404);
  const noBackup = await asUser(B, '66666666-6666-4666-8666-666666666666');
  check('사본이 없는 메모 → 복원하지 않고 멈춤(404)', noBackup.status === 404);
  store.tables.note_backups.find(b => b.note_id === NOTE_B).content = '사본 변조';
  noteB().content = '다시 변조';
  const badBackup = await asUser(B, NOTE_B);
  check('검증에 실패한 사본 → 복원하지 않고 멈춤(409)', badBackup.status === 409 && noteB().content === '다시 변조');
  const ownerInBody = await asUser(B, NOTE_B, { owner_id: A });
  check('본문의 소유자 값은 받지 않음(400)', ownerInBody.status === 400);
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { restoreNote } = await import('../api/restore.js');
    const results = await checkRestore(restoreNote);
    for (const item of results) process.stdout.write(`${item.passed ? '통과' : '확인 필요'} · ${item.name}\n`);
    process.stdout.write('메모리 안 가짜 저장소 연습이며 배포 복구나 심판 통과 증거가 아닙니다.\n');
    if (results.some(item => !item.passed)) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`복구 연습 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
