// 타임라인 거르기 규칙(화면과 시험이 함께 씁니다). DOM을 쓰지 않습니다.
export const FILTERS = Object.freeze([
  { id: 'all', label: '전체' },
  { id: 'warn', label: '▲ 주의' },
  { id: 'unknown', label: '? 확인 불가' },
  { id: 'info', label: 'ℹ 참고' },
]);

const isMeasured = item => item?.status === 'measured';

export function itemMatches(item, filter) {
  if (filter === 'all') return true;
  if (filter === 'unknown') return !isMeasured(item);
  return isMeasured(item) && item.level === filter;
}

// 조회 자체가 실패한 기록은 '확인 불가'로 봅니다.
export function entryMatches(entry, filter) {
  if (filter === 'all') return true;
  if (!entry?.ok) return filter === 'unknown';
  return entry.items.some(item => itemMatches(item, filter));
}

export function visibleItems(entry, filter) {
  if (!entry?.ok) return [];
  return entry.items.filter(item => itemMatches(item, filter));
}

export function countFor(entries, filter) {
  return entries.filter(entry => entryMatches(entry, filter)).length;
}

// 같은 조회 묶음(batch)의 요약: 주의·확인 불가·실패 건수.
export function summarize(batch) {
  let warn = 0;
  let unknown = 0;
  let failed = 0;
  for (const entry of batch) {
    if (!entry.ok) { failed += 1; continue; }
    for (const item of entry.items) {
      if (!isMeasured(item)) unknown += 1;
      else if (item.level === 'warn') warn += 1;
    }
  }
  return { warn, unknown, failed };
}
