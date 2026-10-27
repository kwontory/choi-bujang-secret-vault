// 조회할 때마다 결과를 한 묶음(기록)으로 만들어 타임라인 맨 위에 쌓습니다.
// 서버가 준 값만 그리며, 읽지 못한 값을 예시 값으로 채우지 않습니다. HTML 문자열을 쓰지 않습니다.
const MAX_ENTRIES = 50;
const entries = [];
let busy = false;

const $ = id => document.getElementById(id);
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
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
const CHIP = { ok: ['ok', '● 정상'], warn: ['warn', '▲ 주의'], unknown: ['unknown', '? 확인 불가'] };

function itemRow(item) {
  const measured = item.status === 'measured' && Number.isFinite(item.value);
  const [cls, chipText] = CHIP[measured ? item.level : 'unknown'] ?? CHIP.unknown;
  const value = measured ? `${item.value}${item.unit}` : '확인 불가';
  const note = measured ? `실측 · ${timeText(item.measuredAt)}` : (item.reason || '이유를 받지 못했습니다.');
  return el('li', { className: `item ${cls}` }, [
    el('span', { className: `chip ${cls}`, text: chipText }),
    el('span', { className: 'label', text: item.label || item.key }),
    el('span', { className: 'value', text: value }),
    el('span', { className: 'detail', text: measured ? (item.detail || '') : '' }),
    el('span', { className: 'note', text: note, title: `출처: ${item.source || '확인 불가'}` }),
  ]);
}

function entryNode(entry) {
  if (!entry.ok) {
    return el('li', { className: 'entry failed' }, [
      el('p', { className: 'entry-head' }, [el('time', { datetime: entry.at, text: timeText(entry.at) }), el('span', { className: 'chip unknown', text: '? 조회 실패' })]),
      el('p', { className: 'fail-text', text: `${entry.message} (${entry.code})` }),
      el('p', { className: 'fail-next', text: '앱 창(PowerShell)이 켜져 있는지 확인한 뒤 「지금 조회」를 다시 누르세요.' }),
    ]);
  }
  const warn = entry.items.filter(i => i.status === 'measured' && i.level === 'warn').length;
  const unknown = entry.items.filter(i => i.status !== 'measured').length;
  const summary = `주의 ${warn} · 확인 불가 ${unknown} · 전체 ${entry.items.length}`;
  return el('li', { className: 'entry' }, [
    el('p', { className: 'entry-head' }, [el('time', { datetime: entry.at, text: timeText(entry.at) }), el('span', { className: 'kind', text: 'CPU·메모리·디스크' }), el('span', { className: 'summary', text: summary })]),
    el('ul', { className: 'items' }, entry.items.map(itemRow)),
  ]);
}

function render() {
  $('timeline').replaceChildren(...entries.map(entryNode));
  $('empty').hidden = entries.length > 0;
}

function addEntry(entry) {
  entries.unshift(entry);
  entries.length = Math.min(entries.length, MAX_ENTRIES);
  render();
}

async function refresh() {
  if (busy) return;
  busy = true;
  const button = $('refresh');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  $('status').textContent = '이 PC의 값을 읽는 중입니다…';
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch('/api/pc/system', { cache: 'no-store' });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok || !Array.isArray(body.data?.items)) {
      addEntry({ ok: false, at: startedAt, code: body?.error?.code || `HTTP_${response.status}`, message: body?.error?.message || '조회 결과를 받지 못했습니다.' });
      $('status').textContent = '조회에 실패했습니다. 아래 기록을 확인하세요.';
    } else {
      addEntry({ ok: true, at: body.data.checkedAt || startedAt, items: body.data.items });
      $('status').textContent = `조회 완료 · ${timeText(body.data.checkedAt || startedAt)}`;
    }
  } catch {
    addEntry({ ok: false, at: startedAt, code: 'NETWORK_ERROR', message: '앱 서버에 연결하지 못했습니다.' });
    $('status').textContent = '조회에 실패했습니다. 아래 기록을 확인하세요.';
  } finally {
    busy = false;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

$('refresh').addEventListener('click', refresh);
render();
refresh();
