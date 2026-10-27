// 4일차: 타임라인 거르기와 요약 규칙을 확인합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { entryMatches, visibleItems, countFor, summarize } from '../public/filter.mjs';

const ok = (level) => ({ status: 'measured', level });
const na = { status: 'unavailable', level: 'unknown' };
const entries = [
  { ok: true, kind: 'system', items: [ok('ok'), ok('warn'), ok('ok')] },
  { ok: true, kind: 'connections', items: [ok('ok'), na, ok('info')] },
  { ok: false, kind: 'sdp', code: 'NETWORK_ERROR' },
];

test('전체는 모든 기록', () => assert.equal(countFor(entries, 'all'), 3));
test('주의는 주의 항목이 있는 기록만', () => assert.deepEqual(entries.map(e => entryMatches(e, 'warn')), [true, false, false]));
test('확인 불가는 못 읽은 항목과 조회 실패 기록', () => assert.deepEqual(entries.map(e => entryMatches(e, 'unknown')), [false, true, true]));
test('참고는 참고 항목이 있는 기록만', () => assert.deepEqual(entries.map(e => entryMatches(e, 'info')), [false, true, false]));
test('거른 기록 안에서는 맞는 항목만 보인다', () => {
  assert.equal(visibleItems(entries[0], 'warn').length, 1);
  assert.equal(visibleItems(entries[0], 'all').length, 3);
  assert.equal(visibleItems(entries[2], 'all').length, 0);
});
test('요약은 주의·확인 불가·실패를 센다', () => assert.deepEqual(summarize(entries), { warn: 1, unknown: 1, failed: 1 }));
