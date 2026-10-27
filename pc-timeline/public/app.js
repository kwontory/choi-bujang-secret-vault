// 조회할 때마다 결과를 종류별 기록으로 만들어 타임라인 맨 위에 쌓고, 종류별로 걸러 봅니다.
// 서버가 준 값만 그리며, 읽지 못한 값을 예시 값으로 채우지 않습니다. HTML 문자열을 쓰지 않습니다.
import { FILTERS, entryMatches, visibleItems, countFor, summarize } from './filter.mjs';

const MAX_ENTRIES = 60;
const entries = [];
let latestBatch = [];
let filter = 'all';
let busy = false;
let batchSeq = 0;

// 종류별 조회 주소. SDP 연결 상태는 PC 조회와 따로 기록합니다.
const SOURCES = [
  { kind: 'system', path: '/api/pc/system', title: 'CPU·메모리·디스크', note: '' },
  { kind: 'connections', path: '/api/pc/connections', title: '네트워크·방화벽·Windows 기록', note: '이 PC를 읽기만 한 결과입니다. Windows 경고·오류 건수는 침해나 공격 탐지 결과가 아닙니다.' },
  { kind: 'sdp', path: '/api/sdp/status', title: 'SDP 서버 연결', note: '케셰브 앱이 SDP 서버에 연결됐는지에 대한 상태입니다. 이 PC 조회 결과와 별개입니다.' },
];
const titleOf = kind => SOURCES.find(s => s.kind === kind)?.title ?? kind;

const $ = id => document.getElementById(id);
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'className') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}
const timeText = iso => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '시각 확인 불가' : d.toLocaleTimeString('ko-KR', { hour12: false });
};
const CHIP = { ok: ['ok', '● 정상'], warn: ['warn', '▲ 주의'], info: ['info', 'ℹ 참고'], unknown: ['unknown', '? 확인 불가'] };

function itemRow(item) {
  const measured = item.status === 'measured' && (typeof item.display === 'string' || Number.isFinite(item.value));
  const [cls, chipText] = CHIP[measured ? item.level : 'unknown'] ?? CHIP.unknown;
  const value = measured ? (item.display ?? `${item.value}${item.unit}`) : '확인 불가';
  const note = measured
    ? [`실측 · ${timeText(item.measuredAt)}`, item.note].filter(Boolean).join(' · ')
    : (item.reason || '이유를 받지 못했습니다.');
  const more = el('details', { className: 'more' }, [
    el('summary', { text: '자세히' }),
    el('p', { text: `출처: ${item.source || '확인 불가'}` }),
    el('p', { text: `잰 시각: ${item.measuredAt || '확인 불가'}` }),
  ]);
  return el('li', { className: `item ${cls}` }, [
    el('span', { className: `chip ${cls}`, text: chipText }),
    el('span', { className: 'label', text: item.label || item.key }),
    el('span', { className: 'value', text: value }),
    measured && item.detail ? el('span', { className: 'detail', text: item.detail }) : null,
    el('span', { className: 'note', text: note }),
    more,
  ]);
}

function entryNode(entry) {
  const head = [el('time', { datetime: entry.at, text: timeText(entry.at) }), el('span', { className: 'kind', text: titleOf(entry.kind) })];
  if (!entry.ok) {
    return el('li', { className: `entry failed kind-${entry.kind}` }, [
      el('p', { className: 'entry-head' }, [...head, el('span', { className: 'chip unknown', text: '? 조회 실패' })]),
      el('p', { className: 'fail-text', text: `${entry.message} (${entry.code})` }),
      el('p', { className: 'fail-next', text: '앱 창(PowerShell)이 켜져 있는지 확인한 뒤 「다시 조회」를 누르세요.' }),
    ]);
  }
  const { warn, unknown } = summarize([entry]);
  const shown = visibleItems(entry, filter);
  const hidden = entry.items.length - shown.length;
  const source = SOURCES.find(s => s.kind === entry.kind);
  return el('li', { className: `entry kind-${entry.kind}` }, [
    el('p', { className: 'entry-head' }, [...head, el('span', { className: 'summary', text: `주의 ${warn} · 확인 불가 ${unknown} · 전체 ${entry.items.length}` })]),
    source?.note ? el('p', { className: 'entry-note', text: source.note }) : null,
    el('ul', { className: 'items' }, shown.map(itemRow)),
    hidden > 0 ? el('p', { className: 'hidden-note', text: `거르기 때문에 다른 항목 ${hidden}개를 숨겼습니다.` }) : null,
  ]);
}

function renderFilters() {
  $('filters').replaceChildren(...FILTERS.map(f => {
    const button = el('button', { type: 'button', className: `filter${f.id === filter ? ' active' : ''}`, 'aria-pressed': String(f.id === filter), 'data-filter': f.id, text: `${f.label} ${countFor(entries, f.id)}` });
    // 다시 그리면 버튼이 새로 만들어지므로, 누른 버튼 자리에 키보드 초점을 되돌립니다.
    button.addEventListener('click', () => { filter = f.id; render(); $('filters').querySelector(`[data-filter="${f.id}"]`)?.focus(); });
    return button;
  }));
}

function renderLatest() {
  if (latestBatch.length === 0) { $('latest').hidden = true; $('alert').hidden = true; return; }
  const { warn, unknown, failed } = summarize(latestBatch);
  $('latest').hidden = false;
  $('latest-text').textContent = `최근 조회 ${timeText(latestBatch[0].at)} · 주의 ${warn} · 확인 불가 ${unknown} · 조회 실패 ${failed}`;
  const failures = latestBatch.filter(e => !e.ok);
  $('alert').hidden = failures.length === 0;
  $('alert-list').replaceChildren(...failures.map(e => el('li', { text: `${titleOf(e.kind)}: ${e.message} (${e.code})` })));
}

function render() {
  const shown = entries.filter(e => entryMatches(e, filter));
  $('timeline').replaceChildren(...shown.map(entryNode));
  $('empty').hidden = shown.length > 0;
  $('empty').textContent = entries.length === 0 ? '조회 기록이 없습니다. 「다시 조회」를 누르면 기록이 생깁니다.' : '이 거르기에 맞는 기록이 없습니다. 「전체」를 누르면 모든 기록을 봅니다.';
  renderFilters();
  renderLatest();
}

async function fetchOne(source, batch) {
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch(source.path, { cache: 'no-store' });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok || !Array.isArray(body.data?.items)) {
      return { ok: false, batch, kind: source.kind, at: startedAt, code: body?.error?.code || `HTTP_${response.status}`, message: body?.error?.message || '조회 결과를 받지 못했습니다.' };
    }
    return { ok: true, batch, kind: source.kind, at: body.data.checkedAt || startedAt, items: body.data.items };
  } catch {
    return { ok: false, batch, kind: source.kind, at: startedAt, code: 'NETWORK_ERROR', message: '앱 서버에 연결하지 못했습니다.' };
  }
}

async function refresh() {
  if (busy) return;
  busy = true;
  const button = $('refresh');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = '조회 중…';
  $('status').textContent = '이 PC의 값을 읽는 중입니다. Windows 기록은 몇 초 걸릴 수 있습니다.';
  try {
    const batch = ++batchSeq;
    const results = await Promise.all(SOURCES.map(s => fetchOne(s, batch)));
    for (const entry of [...results].reverse()) entries.unshift(entry);
    entries.length = Math.min(entries.length, MAX_ENTRIES);
    latestBatch = results;
    render();
    const failed = results.filter(r => !r.ok).length;
    $('status').textContent = failed ? `조회 끝 · 실패 ${failed}건 · 위쪽 안내를 확인하세요.` : `조회 완료 · ${timeText(new Date().toISOString())}`;
  } finally {
    busy = false;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = '다시 조회';
  }
}

$('refresh').addEventListener('click', refresh);
render();
refresh();
