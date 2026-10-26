// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
// 공통 도우미: DOM 은 createElement·textContent 로만 만든다.
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text != null) n.textContent = String(text);
  if (cls) n.className = cls;
  return n;
};
const isText = (v) => typeof v === 'string' && v !== '';
const isObj = (v) => v != null && typeof v === 'object';
const DEVICE = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
const SESSION = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
const ACCESS = { allowed: '허용됨', denied: '거부됨', unknown: '확인 불가' };
const KIND = { access: '접속 기록', xdr: 'XDR 경보' };
const MODE = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
const UNVERIFIED = new Set(['CONTRACT_MISMATCH', 'ENGINE_RESULT_UNVERIFIED']);
// 한국어 설명과 원래 값을 함께 적는다. 목록 밖 값은 확인 불가. 예: "확인 불가(unknown)"
const coded = (labels, v) => {
  const raw = isText(v) ? v : 'unknown';
  return Object.hasOwn(labels, raw) ? `${labels[raw]}(${raw})` : `확인 불가(${raw})`;
};
// connected 외의 모드(demo·disconnected·unknown)는 모든 상태에서 함께 안내한다.
const modeNote = (mode) => (mode === 'connected' ? null
  : el('p', `연결 모드: ${MODE[Object.hasOwn(MODE, mode) ? mode : 'unknown']} (${mode || 'unknown'})`, 'tag tag-demo'));
const pair = (dl, label, ...parts) => {
  const dd = el('dd');
  for (const p of parts) dd.append(typeof p === 'string' ? document.createTextNode(p) : p);
  dl.append(el('dt', label), dd);
};
const timeText = (v, empty) => {
  if (!isText(v)) return empty;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? `${v} (시각 형식 확인 불가)` : `${d.toLocaleString('ko-KR')} (${v})`;
};
const msgOf = (err) => (isText(err.message) ? err.message : '서버 메시지 없음');

// 13단계: 로그인 사용자·현재 기기·세션. 매번 새 요소를 만들고 값을 저장하지 않아
// 다시 불러오면 새 값으로 교체되고, 오류일 때 이전 사용자 이름이 남지 않는다.
function renderIdentity({ me, devices, sessions } = {}) {
  const ATTENTION = new Set(['noncompliant', 'unknown', 'expired', 'revoked']);
  const textOf = (v) => (isText(v) ? v : '확인 불가');
  // 정상처럼 보이면 안 되는 상태는 색과 함께 「주의:」 글자로 구분한다. 예: "주의: 보안 기준 미충족 (noncompliant)"
  const stateNode = (labels, v) => {
    const code = typeof v === 'string' && Object.hasOwn(labels, v) ? v : 'unknown';
    const label = `${labels[code]} (${isText(v) ? v : 'unknown'})`;
    return ATTENTION.has(code) ? el('strong', `주의: ${label}`, 'state-error') : el('span', label, 'state-ok');
  };
  const section = (title, res, renderOk) => {
    const box = el('section', null, 'student-identity-section');
    box.append(el('h3', title));
    if (!isObj(res)) res = { status: 'error', mode: 'unknown', error: { message: '전달된 자료가 없습니다.' } };
    const note = modeNote(res.mode);
    if (note) box.append(note);
    if (res.status === 'loading') box.append(el('p', '불러오는 중', 'state state-loading'));
    else if (res.status === 'ok' && res.data != null) renderOk(box, res.data);
    else if (res.status === 'error') {
      const err = isObj(res.error) ? res.error : {};
      box.append(el('p', `${UNVERIFIED.has(err.code) ? '확인 불가' : '연결 실패'}: ${msgOf(err)}`, 'state state-error'));
    } else box.append(el('p', '확인 불가: 상태를 알 수 없는 응답입니다.', 'state state-error'));
    return box;
  };
  const list = (box, data, empty, wrong, line) => {
    if (!Array.isArray(data) || data.length === 0) {
      box.append(el('p', Array.isArray(data) ? empty : wrong, 'state state-empty'));
      return;
    }
    const ul = el('ul', null, 'plain-list');
    for (const item of data) {
      const li = el('li');
      li.append(...line(isObj(item) ? item : {}));
      ul.append(li);
    }
    box.append(ul);
  };
  const root = el('div', null, 'student-identity');
  root.append(section('현재 계정', me, (box, data) => {
    const user = isObj(data.user) ? data.user : {};
    const device = isObj(data.device) ? data.device : {};
    const session = isObj(data.session) ? data.session : {};
    const dl = el('dl', null, 'identity');
    pair(dl, '사용자', `${textOf(user.label)} (ID ${textOf(user.id)})`);
    pair(dl, '현재 기기', `${textOf(device.label)} (ID ${textOf(device.id)}) · `, stateNode(DEVICE, device.status));
    pair(dl, '로그인 세션', `${textOf(session.id)} · `, stateNode(SESSION, session.status));
    box.append(dl);
  }));
  root.append(section('내 기기', devices, (box, data) => list(box, data, '등록된 기기가 없습니다.', '확인 불가: 기기 목록 형식이 아닙니다.',
    (d) => [el('span', `${textOf(d.label)} (ID ${textOf(d.id)})`, 'item-title'), stateNode(DEVICE, d.status)])));
  root.append(section('내 세션', sessions, (box, data) => list(box, data, '로그인 세션이 없습니다.', '확인 불가: 세션 목록 형식이 아닙니다.',
    (s) => [el('span', textOf(s.id), 'item-title'), stateNode(SESSION, s.status)])));
  return root;
}

// 14단계: 선택한 업무 앱 한 개의 접근 판정·이유·시각.
// 요청 실패(error)는 접근 거부와 다르게, 확인 불가(unknown·목록 밖 값·다른 앱의 판정)는 허용과 다르게 보인다.
function renderDecision({ status, mode, data, error, appId } = {}) {
  const DECISION = {
    allow: ['접근 허용', '정책상 접근이 허용됐습니다. 실제 앱 접속 성공을 보장하지는 않습니다.', 'state state-ok'],
    deny: ['접근 거부', '서버가 이 앱 접근을 거부했습니다.', 'state state-error'],
    challenge: ['추가 인증 또는 확인 필요', '서버가 추가 확인을 요구했습니다. 이 앱이 추가 인증을 대신 수행하지 않습니다.', 'state state-loading'],
    unknown: ['판정 확인 불가', '판정을 확인할 수 없습니다. 접근이 허용되지 않은 것으로 보고, 허용으로 간주하지 마세요.', 'state state-empty'],
  };
  const root = el('div', null, 'student-decision');
  const note = status !== 'idle' && modeNote(mode);
  if (note) root.append(note);
  const app = isText(appId) ? appId : '앱 정보 없음';
  if (status === 'idle') {
    root.append(el('p', '앱을 골라 접속을 요청하세요. 아직 요청한 업무 앱이 없습니다.', 'muted'));
  } else if (status === 'loading') {
    root.append(el('p', `판정 확인 중 · 업무 앱 ${app}`, 'state state-loading'));
  } else if (status === 'error') {
    const err = isObj(error) ? error : {};
    root.append(
      el('p', `${UNVERIFIED.has(err.code) ? '확인 불가(응답 형식 불일치)' : '요청 실패'}: ${msgOf(err)}`, 'state state-error'),
      el('p', `업무 앱 ${app} · 접근 거부 판정이 아닙니다. 허용도 아닙니다. 필요하면 직접 다시 요청하세요.`, 'muted'),
    );
  } else if (status !== 'ok' || !isObj(data)) {
    root.append(el('p', '판정 확인 불가 (unknown): 상태를 알 수 없는 응답입니다. 허용으로 간주하지 마세요.', 'state state-empty'));
  } else {
    const got = data.decision;
    const sameApp = !isText(appId) || data.appId === appId;
    const code = sameApp && typeof got === 'string' && Object.hasOwn(DECISION, got) ? got : 'unknown';
    const [label, text, cls] = DECISION[code];
    root.append(el('p', `판정: ${label} (${code})`, cls), el('p', text));
    const dl = el('dl', null, 'identity');
    pair(dl, '업무 앱', isText(data.appId) ? data.appId : app);
    pair(dl, '판정 이유', isText(data.reason) ? data.reason : '판정 이유 정보 없음');
    pair(dl, '판정 시각', timeText(data.checkedAt, '판정 시각 정보 없음'));
    if (code === 'unknown' && got !== 'unknown') {
      pair(dl, '서버가 보낸 값', sameApp ? String(got) : `다른 앱(${String(data.appId)})의 판정이라 표시하지 않음`);
    }
    root.append(dl);
  }
  return root;
}

// 15단계 필터·상세 선택 상태. 새 자료가 오면 renderEvents 가 초기화한다.
const eventsState = { filters: { kind: 'all', app: 'all', access: 'all' }, selectedId: null, dataKey: null };

// 15단계: 본인의 최근 접속 기록(access)·저장된 XDR 경보(xdr)를 최신순 목록·필터·상세로 보여 준다.
// 받은 배열은 복사해 정렬하고(원본 불변), 서버에 다시 묻지 않고 받은 배열 안에서만 거른다.
// 새 자료(다시 불러오기의 loading·error 또는 다른 목록)가 오면 이전 목록·필터·상세를 모두 지운다.
function renderEvents({ status, mode, data, error } = {}) {
  const state = eventsState;
  const reset = () => Object.assign(state, { filters: { kind: 'all', app: 'all', access: 'all' }, selectedId: null, dataKey: null });
  const appText = (id) => (isText(id) ? id : '앱 확인 불가(appId 없음)');
  const root = el('div', null, 'student-events');
  const note = modeNote(mode);
  if (note) root.append(note);
  root.append(el('p', '관측 범위: 서버가 현재 등록 정보와 맞춰 본 본인의 최근 기록(최대 40건)과 서버에 이미 저장된 XDR 경보입니다. 모든 직원의 전체 이력이나 화면을 열 때 새로 탐지한 결과가 아닙니다.', 'muted'));

  if (status === 'loading' || status === 'error' || status !== 'ok' || !Array.isArray(data) || data.length === 0) {
    reset();
    if (status === 'loading') root.append(el('p', '기록을 불러오는 중', 'state state-loading'));
    else if (status === 'error') {
      const err = isObj(error) ? error : {};
      const bad = UNVERIFIED.has(err.code);
      root.append(
        el('p', bad ? `확인 불가(응답 형식 불일치): 기록을 표시하지 않습니다. ${msgOf(err)}` : `기록을 불러오지 못했습니다: ${msgOf(err)}`, 'state state-error'),
        el('p', `빈 목록이 아니라 ${bad ? '기록을 확인할 수 없는 상태' : '조회 실패'}입니다. 이전 기록은 지웠습니다. 필요하면 직접 다시 불러오세요.`, 'muted'),
      );
    } else if (status !== 'ok' || !Array.isArray(data)) root.append(el('p', '확인 불가: 기록 목록 형식이 아닙니다. 이전 기록은 지웠습니다.', 'state state-error'));
    else root.append(el('p', '표시할 기록이 없습니다. 조회는 성공했고 해당 범위에 기록이 0건입니다.', 'state state-empty'));
    return root;
  }

  // at 기준 최신순. 시각을 읽을 수 없는 기록은 맨 뒤.
  const timeOf = (e) => {
    const ms = isText(e.at) ? Date.parse(e.at) : NaN;
    return Number.isNaN(ms) ? -Infinity : ms;
  };
  const events = data.filter(isObj).slice().sort((a, b) => timeOf(b) - timeOf(a));
  const dataKey = JSON.stringify(events.map((e) => [e.id, e.at]));
  if (state.dataKey !== dataKey) reset();
  state.dataKey = dataKey;
  const kindOf = (e) => (isText(e.kind) ? e.kind : 'unknown');
  const appOf = (e) => (isText(e.appId) ? e.appId : '');
  const accessOf = (e) => (isObj(e.state) && isText(e.state.access) ? e.state.access : 'unknown');

  // 필터 선택 상자: 접근 가능한 이름은 「기록 종류」「업무 앱」「접속 상태」, 전체 값은 all, 나머지는 원래 값.
  const select = (name, key, valueOf, describe) => {
    const wrap = el('label', null, 'student-filter');
    wrap.append(el('span', `${name} `, 'muted'));
    const box = el('select');
    box.setAttribute('aria-label', name);
    box.dataset.studentFilter = key;
    const values = ['all', ...new Set(events.map(valueOf))];
    for (const v of values) {
      const option = el('option', v === 'all' ? '전체(all)' : describe(v));
      option.value = v;
      box.append(option);
    }
    if (!values.includes(state.filters[key])) state.filters[key] = 'all';
    box.value = state.filters[key];
    box.addEventListener('change', () => { state.filters[key] = box.value; draw(); });
    wrap.append(box);
    return wrap;
  };
  const bar = el('div', null, 'row');
  bar.append(
    select('기록 종류', 'kind', kindOf, (v) => coded(KIND, v)),
    select('업무 앱', 'app', appOf, (v) => (v === '' ? '앱 확인 불가(appId 없음)' : v)),
    select('접속 상태', 'access', accessOf, (v) => coded(ACCESS, v)),
  );
  const results = el('div', null, 'student-events-results');
  root.append(bar, results);

  const textList = (title, entries) => {
    const block = el('div');
    block.append(el('h4', title));
    const items = Array.isArray(entries) ? entries.filter(isObj) : [];
    if (items.length === 0) block.append(el('p', `${title} 없음`, 'muted'));
    else {
      const ul = el('ul');
      for (const x of items) ul.append(el('li', `${isText(x.id) ? x.id : 'ID 없음'}: ${isText(x.text) ? x.text : '내용 없음'}`));
      block.append(ul);
    }
    return block;
  };
  // 상세: 사건 ID·appId·근거·규칙과 접속·세션·기기 세 상태를 따로 보여 준다.
  const detailOf = (e) => {
    const box = el('section', null, 'student-event-detail');
    box.dataset.studentEventDetail = String(e.id);
    box.append(el('h4', `${e.id} 상세`));
    const dl = el('dl', null, 'identity');
    const st = isObj(e.state) ? e.state : {};
    pair(dl, '사건 ID', String(e.id));
    pair(dl, '앱', appText(e.appId));
    pair(dl, '접속 상태', coded(ACCESS, st.access));
    pair(dl, '세션 상태', coded(SESSION, st.session));
    pair(dl, '기기 상태', coded(DEVICE, st.device));
    box.append(dl, textList('근거(evidence)', e.evidence), textList('규칙(rules)', e.rules));
    // 16단계: 연결되지 않은 조치가 넘어온 경우에만 「<action> 미지원」 비활성 버튼과 안내를 둔다.
    // supportedActions 가 비어 있으면 버튼을 만들지 않는다. 어떤 요청도 보내지 않는다.
    const actions = Array.isArray(e.supportedActions) ? e.supportedActions.filter(isText) : [];
    if (actions.length > 0) {
      const actionBox = el('div');
      actionBox.append(el('h4', '조치(아직 지원하지 않음)'), el('p', '조치 실행 연결은 준비 중입니다. 아래 버튼은 비활성이며 누르거나 선택해도 요청을 보내지 않습니다.', 'muted'));
      for (const action of actions) {
        const b = el('button', `${action} 미지원`, 'btn');
        b.type = 'button';
        b.disabled = true;
        b.setAttribute('aria-label', `${action} 미지원`);
        b.dataset.studentUnsupportedAction = action;
        actionBox.append(b);
      }
      box.append(actionBox);
    }
    return box;
  };
  // 필터·상세를 바꿀 때는 결과 영역만 다시 그리고, 누른 버튼으로 포커스를 돌려준다.
  function draw(focusId) {
    const f = state.filters;
    const shown = events.filter((e) => (f.kind === 'all' || kindOf(e) === f.kind)
      && (f.app === 'all' || appOf(e) === f.app) && (f.access === 'all' || accessOf(e) === f.access));
    if (!shown.some((e) => String(e.id) === state.selectedId)) state.selectedId = null;
    const out = [el('p', `표시 ${shown.length}건 / 받은 기록 ${events.length}건 (최신순)`, 'muted')];
    if (shown.length === 0) out.push(el('p', '선택한 필터 조건에 맞는 기록이 없습니다. 필터를 전체(all)로 바꾸면 다시 보입니다.', 'state state-empty'));
    else {
      const ul = el('ul', null, 'plain-list');
      for (const e of shown) {
        const id = String(e.id);
        const li = el('li');
        li.dataset.studentEventId = id;
        const info = el('div');
        info.append(
          el('span', `${id} · ${timeText(e.at, '시각 정보 없음')}`, 'item-title'),
          el('p', `종류: ${coded(KIND, e.kind)} · 앱: ${appText(e.appId)}`, 'muted'),
          el('p', isText(e.summary) ? e.summary : '요약 없음'),
        );
        const b = el('button', `${id} 상세`, 'btn');
        b.type = 'button';
        b.setAttribute('aria-label', `${id} 상세`);
        b.setAttribute('aria-expanded', String(state.selectedId === id));
        b.dataset.studentDetailFor = id;
        b.addEventListener('click', () => { state.selectedId = state.selectedId === id ? null : id; draw(id); });
        li.append(info, b);
        ul.append(li);
      }
      out.push(ul);
      const picked = shown.find((e) => String(e.id) === state.selectedId);
      if (picked) out.push(detailOf(picked));
    }
    results.replaceChildren(...out);
    if (focusId != null) [...results.querySelectorAll('button')].find((b) => b.dataset.studentDetailFor === focusId)?.focus();
  }
  draw();
  return root;
}

// 16단계 도움정보 복사 결과 안내. 복사할 값이 바뀌면 renderStatus 가 초기화한다.
const statusState = { copyKey: null, message: null, fallback: false };

// 16단계: 기기·세션·도움정보의 불러오는 중·빈 목록·실패(시간 초과 구분)와 알림, 다시 시도 방법을 안내한다.
// diagnostics 는 제공 화면이 조회해 넘겨준 값이며 이 함수는 /api/diagnostics 를 부르지 않는다.
// 자동으로 다시 요청하지 않는다. 다시 시도는 사용자가 「다시 불러오기」를 직접 누른다.
function renderStatus({ devices, sessions, notifications, diagnostics, mode } = {}) {
  const RESOURCE = { me: '로그인 정보', apps: '업무 앱', access: '접속 판정', events: '보안 기록', devices: '등록 기기', sessions: '현재 세션', diagnostics: '도움정보', vulnerabilities: '라이브러리 취약점', aiConnection: 'AI 연결' };
  const OBJECT_NAMES = { '등록 기기': '등록 기기를', '현재 세션': '현재 세션을', '도움정보': '도움정보를' };
  const RETRY = '다시 시도는 위쪽 「다시 불러오기」 버튼을 직접 누르세요. 자동으로 다시 요청하지 않습니다.';
  // 화면·복사 내용에 비밀처럼 보이는 값이 섞이지 않도록 가린다.
  const SECRET = /(?:Bearer\s+\S+|sk-[A-Za-z0-9_-]{8,}|sb_secret_\S+|github_pat_\S+|eyJ[A-Za-z0-9_-]{10,}\S*|-----BEGIN [A-Z ]*KEY-----|(?:api[_ -]?key|token|secret|password|authorization|비밀번호|토큰)\s*[:=]\s*\S+)/gi;
  const safe = (v) => (isText(v) ? v.replace(SECRET, '[가림]') : '');
  const safeCode = (v) => (typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(v) ? v : 'unknown');
  const state = statusState;

  // 실패 안내: 무엇을 불러오지 못했는지, 시간 초과 여부, message, 다시 시도 안내.
  const failure = (what, error) => {
    const err = isObj(error) ? error : {};
    const reason = typeof err.code === 'string' && err.code.toUpperCase().includes('TIMEOUT') ? '시간 초과로 불러오지 못했습니다'
      : UNVERIFIED.has(err.code) ? '응답 형식을 확인할 수 없습니다(확인 불가)' : '불러오지 못했습니다';
    const box = el('div');
    box.append(
      el('p', `${OBJECT_NAMES[what] || `${what}:`} ${reason} [${safeCode(err.code)}]: ${safe(err.message) || '서버 메시지 없음'}`, 'state state-error'),
      el('p', RETRY, 'muted'),
    );
    return box;
  };
  const section = (title, note) => {
    const box = el('section', null, 'student-status-section');
    box.append(el('h3', title));
    if (note) box.append(el('p', note, 'muted'));
    return box;
  };
  // 기기·세션: 불러오는 중·빈 목록·실패·정상을 서로 다른 문장으로.
  const listSection = (title, note, res, empty, describe) => {
    const box = section(title, note);
    if (!isObj(res)) res = { status: 'unknown' };
    if (res.status === 'loading') box.append(el('p', `${title} 불러오는 중`, 'state state-loading'));
    else if (res.status === 'error') box.append(failure(title, res.error));
    else if (res.status === 'ok' && Array.isArray(res.data) && res.data.length === 0) box.append(el('p', empty, 'state state-empty'));
    else if (res.status === 'ok' && Array.isArray(res.data)) {
      const ul = el('ul', null, 'plain-list');
      for (const item of res.data) {
        const [name, value] = describe(isObj(item) ? item : {});
        const li = el('li');
        li.append(el('span', name, 'item-title'), el('span', value, 'muted'));
        ul.append(li);
      }
      box.append(ul);
    } else box.append(el('p', `${title}: 확인 불가(상태를 알 수 없는 응답)`, 'state state-error'));
    return box;
  };

  const root = el('div', null, 'student-status');
  const note = modeNote(mode);
  if (note) root.append(note);

  // 알림: 항목마다 어느 자료(resource)인지, 안전한 code, message.
  const alertBox = section('주의할 알림');
  if (!Array.isArray(notifications)) alertBox.append(el('p', '알림 목록을 확인할 수 없습니다(확인 불가).', 'state state-error'));
  else if (!notifications.some(isObj)) alertBox.append(el('p', '주의할 알림이 없습니다.', 'state state-empty'));
  else {
    const ul = el('ul');
    for (const a of notifications.filter(isObj)) {
      const key = isText(a.resource) ? a.resource : 'unknown';
      ul.append(el('li', `자료: ${Object.hasOwn(RESOURCE, key) ? RESOURCE[key] : '확인 불가'}(${safeCode(key)}) · 코드: ${safeCode(a.code)} · ${safe(a.message) || '메시지 없음'}`));
    }
    alertBox.append(ul);
  }
  root.append(alertBox);

  root.append(listSection('등록 기기', '내 이름으로 등록되고 회수되지 않은 기기(최대 100개)입니다. 지금 쓰는 기기가 맨 앞에 옵니다. 서버가 모르는 값은 확인 불가로 표시합니다.',
    devices, '등록된 기기가 없습니다.', (d) => [`${isText(d.label) ? d.label : '이름 없음'} (ID ${isText(d.id) ? d.id : '없음'})`, coded(DEVICE, d.status)]));
  root.append(listSection('현재 세션', '지금 검증된 연결 하나만 표시합니다. 지난 세션 목록이 아닙니다.',
    sessions, '현재 연결이 없습니다.', (s) => [isText(s.id) ? s.id : 'ID 없음', coded(SESSION, s.status)]));

  // 도움정보: 정해진 여섯 값만 고른다. 그 밖의 항목은 화면에도 복사 내용에도 넣지 않는다.
  const diagBox = section('도움정보', '도움 요청에 쓰도록 비밀 없는 점검 값만 표시하고 복사합니다. 자료는 위쪽 제공 화면의 「도움정보 불러오기」로 직접 불러옵니다.');
  const diag = isObj(diagnostics) ? diagnostics : { status: 'idle' };
  let six = null;
  if (diag.status === 'ok' && isObj(diag.data)) {
    const engine = isObj(diag.data.engine) ? diag.data.engine : {};
    six = {
      requestId: safe(diag.data.requestId) || '확인 불가',
      component: safe(diag.data.component) || '확인 불가',
      version: safe(diag.data.version) || '확인 불가',
      checkedAt: safe(diag.data.checkedAt) || '확인 불가',
      'engine.mode': safe(engine.mode) || '확인 불가',
      'engine.code': safeCode(engine.code),
    };
    const dl = el('dl', null, 'identity');
    for (const [k, v] of Object.entries(six)) pair(dl, k, v);
    diagBox.append(dl);
  } else if (diag.status === 'loading') diagBox.append(el('p', '도움정보 불러오는 중', 'state state-loading'));
  else if (diag.status === 'error') diagBox.append(failure('도움정보', diag.error));
  else diagBox.append(el('p', '아직 도움정보를 불러오지 않았습니다.', 'state state-empty'));

  const copyText = six ? Object.entries(six).map(([k, v]) => `${k}: ${v}`).join('\n') : '';
  if (state.copyKey !== copyText) Object.assign(state, { copyKey: copyText, message: null, fallback: false });
  const copy = el('button', '도움정보 복사', 'btn');
  copy.type = 'button';
  copy.setAttribute('aria-label', '도움정보 복사');
  copy.disabled = !copyText;
  const copyStatus = el('p', state.message || (copyText ? '누르면 위의 여섯 값만 클립보드에 복사합니다.' : '도움정보를 불러온 뒤 복사할 수 있습니다.'), 'muted');
  copyStatus.setAttribute('role', 'status');
  const fallback = el('pre', copyText, 'diag-output');
  fallback.hidden = !state.fallback;
  // 사용자가 누를 때만 복사한다. 자동 복사·자동 전송은 하지 않는다.
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      Object.assign(state, { message: '도움정보 여섯 값을 클립보드에 복사했습니다. 붙여 넣기 전에 내용을 직접 확인하세요.', fallback: false });
    } catch {
      Object.assign(state, { message: '자동 복사를 사용할 수 없습니다. 아래 내용을 직접 선택해 복사하세요.', fallback: true });
    }
    copyStatus.textContent = state.message;
    fallback.hidden = !state.fallback;
  });
  diagBox.append(copy, copyStatus, fallback);
  root.append(diagBox);
  return root;
}

// 17단계: AI 오류 code 를 원인별 안내로 나눈다. 정확한 code 를 먼저, 그 밖은 code 안의 낱말로 고른다.
const AI_CAUSES = [
  ['권한 준비 중·확인 불가', '학생 잘못이 아닙니다. 운영 측의 계정·앱 권한 준비가 끝나지 않았거나 확인할 수 없습니다. 담당자에게 계정 연결과 앱 권한 확인을 요청하세요.',
    /^(ON_AI_PROVISIONING_PENDING|ON_AI_AUTHORIZATION_CHANGED|SUBJECT_SCOPE_UNVERIFIED|AI_REQUEST_UNVERIFIED|CONTRACT_MISMATCH|ENGINE_RESULT_UNVERIFIED)$|PROVISION|UNVERIFIED/],
  ['인증 실패', '보호 현황의 계정 연결과 AI 연결을 다시 확인하고, 계속되면 담당자에게 확인하세요. 열쇠를 복사해 붙이지 마세요.', /AUTH/],
  ['접근 제한', '학생 앱의 이용 권한이 제한됐습니다. 계정 연결을 다시 확인하고 담당자에게 확인하세요.', /ACCESS|BLOCK|FORBIDDEN|DENIED/],
  ['사용량·이용 한도 초과', '반의 AI 사용량 또는 이용 한도에 도달했습니다. 담당자에게 확인하세요.', /BUDGET|LIMIT_REACHED|QUOTA/],
  ['이용 시간 아님', '지금은 AI 이용 시간이 아닙니다. 이용 시간을 확인하세요.', /SESSION_CLOSED|OUTSIDE_HOURS/],
  ['요청 제한', 'AI 요청이 잠시 제한됐습니다. 잠시 뒤 직접 다시 점검하세요.', /RATE/],
  ['시간 초과', '응답이 제한 시간 안에 오지 않아 점검이 끝났습니다(시간 초과). 잠시 뒤 직접 다시 점검하세요.', /TIMEOUT/],
  ['네트워크 오류', '네트워크 연결 문제로 응답을 받지 못했습니다. 잠시 뒤 직접 다시 점검하세요.', /NETWORK|FETCH|OFFLINE|UNREACHABLE/],
  ['취소됨', '사용자가 요청을 취소했습니다. 이전 점검 결과는 현재 결과가 아니며 표시하지 않습니다.', /CANCEL|ABORT/],
  ['쓸 수 있는 모델 없음', '현재 권한으로 쓸 수 있는 AI 모델이 없습니다. 담당자에게 모델 허용 설정 확인을 요청하세요.', /MODEL/],
];
const aiCause = (code) => AI_CAUSES.find(([, , re]) => re.test(code))
  || ['원인 확인 불가', '오류 원인을 확인할 수 없습니다. 성공으로 보지 말고 담당자에게 확인하세요.'];
const aiCode = (v) => (typeof v === 'string' && /^[A-Z0-9_]{1,64}$/.test(v) ? v : 'UNKNOWN');
const AI_SECRET = /(?:Bearer\s+\S+|sk-[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{10,}\S*|(?:api[_ -]?key|token|secret|password)\s*[:=]\s*\S+)/gi;
const aiMsg = (err) => (isText(err.message) ? err.message.replace(AI_SECRET, '[가림]') : '서버 메시지 없음');
const MANUAL = '다시 점검은 「현재 API 연결 점검」 버튼을 직접 누르세요. 자동으로 다시 점검하지 않습니다.';

// 17단계: AI 연결 점검(모델 응답)만 보여 준다. 사건 설명 실행과 구분한다.
// 매번 입력만으로 새로 그리고 이전 결과를 저장하지 않아, 재점검 성공·idle·취소 뒤 옛 결과(오류 안내·모델 수)가 남지 않는다.
function renderAiConnection({ status, mode, data, error, checkedAt, explanationAccepted } = {}) {
  const root = el('div', null, 'student-ai-connection');
  root.dataset.studentAiStatus = isText(status) ? status : 'unknown';
  // 연결 모드(예제 자료 등)는 점검 결과가 있을 때만 함께 안내한다.
  const note = status === 'ok' && modeNote(mode);
  if (note) root.append(note);
  if (status === 'idle') {
    root.append(el('p', 'AI 연결 점검 전: 아직 점검을 실행하지 않았습니다. 이전 점검 결과는 표시하지 않습니다.', 'state state-empty'),
      el('p', '연결 완료 뒤 「현재 API 연결 점검」을 직접 누르면 점검합니다.', 'muted'));
  } else if (status === 'loading') {
    root.append(el('p', 'AI 연결 점검 중: 서버를 통해 모델 응답을 확인하고 있습니다. 「취소」로 멈출 수 있습니다.', 'state state-loading'));
  } else if (status === 'error') {
    const err = isObj(error) ? error : {};
    const code = aiCode(err.code);
    const [label, guide] = aiCause(code);
    const head = label === '취소됨' ? 'AI 연결 점검 취소됨(성공 아님)' : 'AI 연결 점검 실패';
    root.append(el('p', `${head} — ${label} [${code}]: ${aiMsg(err)}`, 'state state-error'),
      el('p', guide), el('p', '연결 점검이 성공하지 않았습니다. 모델 수와 이전 결과는 표시하지 않습니다.', 'muted'), el('p', MANUAL, 'muted'));
  } else if (status === 'ok' && isObj(data) && data.transportChecked === true && ['test', 'verified'].includes(data.audienceAuthorization)
    && Number.isInteger(data.modelCount)) {
    const test = data.audienceAuthorization === 'test';
    root.append(el('p', test ? 'AI 연결 점검 결과: 시험 연결 점검(test) · 실제 앱 권한 확인 아님' : 'AI 연결 점검 결과: 앱 권한 확인 후 점검(verified)', 'state state-ok'));
    const dl = el('dl', null, 'identity');
    pair(dl, '점검 종류', test ? '시험 연결 점검(test)' : '앱 권한 확인 후 점검(verified)');
    pair(dl, '응답 모델 수', `${data.modelCount}개`);
    pair(dl, '점검 시각', timeText(checkedAt, '점검 시각 정보 없음'));
    pair(dl, '사건 설명', `아직 실행하지 않음(explanationAccepted: ${explanationAccepted === true})`);
    root.append(dl,
      el('p', '연결(모델 목록 응답)만 점검했습니다. 사건 설명은 아직 실행하지 않았습니다. 사건 설명은 보안 기록에서 기록을 골라 따로 요청하고 확인합니다.', 'muted'),
      el('p', `이 결과는 ${timeText(checkedAt, '점검')} 기준입니다. ${MANUAL}`, 'muted'));
  } else {
    root.append(el('p', 'AI 연결 점검 확인 불가: 상태나 응답 형식을 알 수 없습니다. 성공으로 보지 마세요.', 'state state-error'), el('p', MANUAL, 'muted'));
  }
  return root;
}

// 18단계: 고른 사건의 AI 설명을 그 기록의 근거·규칙·현재 상태와 연결해 보여 준다.
// 매번 입력만으로 새로 그려 다른 기록 선택·다시 불러오기·실패 뒤 이전 설명과 성공 속성이 남지 않는다.
// 성공 표식 data-student-explanation-event 는 근거가 이 기록과 맞는 성공 설명에만 붙인다. 실행 버튼은 만들지 않는다.
function renderExplanation({ event, explanation, checkedAt } = {}) {
  const root = el('div', null, 'student-explanation');
  const ex = isObj(explanation) ? explanation : {};
  const ev = isObj(event) && event.id != null && event.id !== '' ? event : null;
  const id = ev ? String(ev.id) : null;
  const KEPT = '기록은 그대로입니다. AI 설명 실패는 기록 오류나 과제 실패가 아니며, 업무 앱 판정과 보안 기록은 계속 쓸 수 있습니다.';
  const rejected = (reason, code) => {
    root.append(el('p', `AI 설명을 쓸 수 없습니다${id ? ` · 사건 ${id}` : ''}${code ? ` [${aiCode(code)}]` : ''}: ${reason}`, 'state state-error'),
      el('p', `내용을 지어내거나 맞춰 표시하지 않습니다. ${KEPT}`, 'muted'));
    return root;
  };
  // 1) 실패를 먼저: event 가 없어도 안전한 code·message 와 실패 까닭을 보여 준다.
  if (ex.status === 'error') {
    const err = isObj(ex.error) ? ex.error : {};
    const code = aiCode(err.code);
    const why = code === 'ON_AI_INVALID_OUTPUT' ? '근거 부족·근거 불일치·실행했다고 답한 설명 등 응답이 이 기록과 맞지 않습니다'
      : code === 'ON_AI_INVALID_INPUT' ? '설명에 필요한 사건 근거·규칙이 부족합니다' : aiCause(code)[0];
    root.append(el('p', `AI 설명 실패${id ? ` · 사건 ${id}` : ''} [${code}]: ${aiMsg(err)}`, 'state state-error'),
      el('p', `실패 까닭: ${why}`), el('p', `${KEPT} 필요하면 직접 다시 요청하세요.`, 'muted'));
    return root;
  }
  if (!ev) {
    root.append(el('p', '보안 기록에서 기록을 먼저 고르세요. 고른 기록이 없어 AI 설명을 표시하지 않습니다.', 'state state-empty'));
    return root;
  }
  if (ex.status === 'loading') {
    root.append(el('p', `AI 설명 요청 중 · 사건 ${id}`, 'state state-loading'));
    return root;
  }
  if (ex.status === 'idle' || ex.status == null) {
    root.append(el('p', `사건 ${id}: 아직 AI 설명을 요청하지 않았습니다.`, 'state state-empty'));
    return root;
  }
  const d = isObj(ex.data) ? ex.data : null;
  if (ex.status !== 'ok' || !d || !isText(d.summary)) return rejected('설명 상태나 형식을 확인할 수 없습니다(확인 불가).');
  // 2) 실행했다고 답한 설명은 쓰지 않는다. 제안은 사람 확인 전 미실행이어야 한다.
  if (d.executed !== false || d.requiresHumanConfirmation !== true) return rejected('AI 가 조치를 이미 실행했다고 답했거나 사람 확인 조건이 없습니다. 설명·제안만으로 조치는 실행되지 않습니다.');
  // 3) 근거 ID 는 이 기록의 evidence 와 하나도 빠짐없이 맞아야 한다. 없는 ID 를 만들어 맞추지 않는다.
  const evidence = new Map((Array.isArray(ev.evidence) ? ev.evidence : []).filter((x) => isObj(x) && isText(x.id)).map((x) => [x.id, x.text]));
  const cited = Array.isArray(d.evidenceIds) ? d.evidenceIds : null;
  if (!cited || cited.length === 0) return rejected('인용한 근거가 없습니다(근거 부족).');
  const missing = cited.filter((x) => !isText(x) || !evidence.has(x));
  if (missing.length > 0) return rejected(`근거가 맞지 않습니다. 이 기록에 없는 근거 ID: ${missing.map(String).join(', ')} (다른 기록의 설명일 수 있음)`);
  const supported = Array.isArray(ev.supportedActions) ? ev.supportedActions.filter(isText) : [];
  const proposals = Array.isArray(d.proposals) ? d.proposals : null;
  if (!proposals) return rejected('조치 제안 형식을 확인할 수 없습니다.');
  for (const p of proposals) {
    if (!isObj(p) || !isText(p.action) || !supported.includes(p.action)) return rejected(`이 기록이 지원하지 않는 조치 제안이 있습니다(${isObj(p) ? String(p.action) : '형식 오류'}).`);
    if (!Array.isArray(p.evidenceIds) || p.evidenceIds.some((x) => !evidence.has(x))) return rejected(`조치 제안 ${p.action} 의 근거가 이 기록과 맞지 않습니다.`);
  }

  // 성공: 이 기록과 근거가 맞는 설명에만 성공 표식을 붙인다.
  root.dataset.studentExplanationEvent = id;
  const note = modeNote(ex.mode);
  if (note) root.append(note);
  const dl = el('dl', null, 'identity');
  pair(dl, '사건 ID', id);
  pair(dl, '설명 시각', timeText(checkedAt, '시각 정보 없음'));
  root.append(el('h4', 'AI 설명(참고용)'), dl, el('p', d.summary),
    el('p', 'AI 의 해석입니다. 사실 판단은 아래 근거 글과 연동 시스템이 알려 준 현재 상태로 하세요.', 'muted'));
  const block = (title, lines, empty) => {
    const box = el('div');
    box.append(el('h5', title));
    if (lines.length === 0) box.append(el('p', empty, 'muted'));
    else {
      const ul = el('ul');
      for (const line of lines) ul.append(el('li', line));
      box.append(ul);
    }
    root.append(box);
  };
  block('인용한 근거', cited.map((x) => `${x} — ${isText(evidence.get(x)) ? evidence.get(x) : '근거 글 없음'}`), '없음');
  block('규칙', (Array.isArray(ev.rules) ? ev.rules.filter(isObj) : []).map((r) => `${isText(r.id) ? r.id : 'ID 없음'} — ${isText(r.text) ? r.text : '규칙 글 없음'}`), '규칙 없음');
  // 확인 불가 상태: 접속·세션·기기별로, unknown 이거나 알 수 없는 값은 정상·안전으로 바꾸지 않는다.
  const st = isObj(ev.state) ? ev.state : {};
  const unknown = [['접속', 'access', ACCESS], ['세션', 'session', SESSION], ['기기', 'device', DEVICE]]
    .filter(([, k, labels]) => !isText(st[k]) || st[k] === 'unknown' || !Object.hasOwn(labels, st[k]))
    .map(([name, k]) => `${name}: 확인 불가(${isText(st[k]) ? st[k] : 'unknown'})`);
  block('확인할 수 없는 현재 상태', unknown, '없음');
  if (proposals.length === 0) {
    block('조치 제안', [], supported.length === 0 ? '연동 시스템이 지원하는 조치가 없어 제안이 없습니다(정상).' : 'AI 가 이 기록에 맞는 조치를 제안하지 않았습니다.');
  } else {
    block('조치 제안(사람 확인 필요 · 실행되지 않음)', proposals.map((p) => `${p.action} — ${isText(p.reason) ? p.reason : '이유 없음'} (근거 ${p.evidenceIds.join(', ')}) · 사람 확인이 필요하며 실행되지 않았습니다.`), '없음');
  }
  return root;
}

export function createStudentView() {
  return {
    renderIdentity,
    renderDecision,
    renderEvents,
    renderStatus,
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection,
    renderExplanation,
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
