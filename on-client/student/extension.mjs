// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
// 15단계 renderEvents 의 필터·상세 선택 상태. 새 자료가 오면 renderEvents 가 초기화한다.
const studentEventsState = { filters: { kind: 'all', app: 'all', access: 'all' }, selectedId: null, dataKey: null };

// 16단계 renderStatus 의 도움정보 복사 결과 안내. 복사할 값이 바뀌면 renderStatus 가 초기화한다.
const studentStatusState = { copyKey: null, message: null, fallback: false };

export function createStudentView() {
  return {
    // 13단계: 로그인 사용자·현재 기기·세션을 상태별로 표시한다.
    // 입력은 { me, devices, sessions } 이고 각각 { status, mode, data?, error? } 다.
    // 매번 새 DOM 요소를 만들어 돌려주며 이전 값을 모듈에 저장하지 않는다.
    // 그래서 다시 불러오면 새 값으로 교체되고, 오류일 때 이전 사용자 이름이 남지 않는다.
    renderIdentity({ me, devices, sessions } = {}) {
      const DEVICE_LABELS = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
      const SESSION_LABELS = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
      // 정상처럼 보이면 안 되는 상태. 색이 아니라 글자로 구분한다.
      const NEEDS_ATTENTION = new Set(['noncompliant', 'unknown', 'expired', 'revoked']);
      const MODE_LABELS = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
      const UNVERIFIED_CODES = new Set(['CONTRACT_MISMATCH', 'ENGINE_RESULT_UNVERIFIED']);

      const node = (tag, text, className) => {
        const element = document.createElement(tag);
        if (text != null) element.textContent = String(text);
        if (className) element.className = className;
        return element;
      };
      const isObject = (value) => value != null && typeof value === 'object';
      const textOf = (value) => (typeof value === 'string' && value !== '' ? value : '확인 불가');

      // 원래 상태 코드를 함께 보여 준다. 예: "보안 기준 미충족 (noncompliant)"
      const stateText = (labels, value) => {
        const code = typeof value === 'string' && Object.hasOwn(labels, value) ? value : 'unknown';
        const label = `${labels[code]} (${typeof value === 'string' && value ? value : 'unknown'})`;
        return NEEDS_ATTENTION.has(code) ? { text: `주의: ${label}`, warn: true } : { text: label, warn: false };
      };
      const stateNode = (labels, value) => {
        const { text, warn } = stateText(labels, value);
        return node(warn ? 'strong' : 'span', text, warn ? 'state-error' : 'state-ok');
      };

      // connected 외의 모드는 loading·error 에서도 함께 안내한다.
      const modeNotice = (mode) => {
        if (mode === 'connected') return null;
        const key = Object.hasOwn(MODE_LABELS, mode) ? mode : 'unknown';
        return node('p', `연결 모드: ${MODE_LABELS[key]} (${mode || 'unknown'})`, 'tag tag-demo');
      };

      // 한 칸(제목 + 모드 안내 + 상태별 내용)을 만든다.
      const section = (title, resource, renderOk) => {
        const box = node('section', null, 'student-identity-section');
        box.append(node('h3', title));
        const res = isObject(resource) ? resource : { status: 'error', mode: 'unknown', error: { message: '전달된 자료가 없습니다.' } };
        const notice = modeNotice(res.mode);
        if (notice) box.append(notice);

        if (res.status === 'loading') {
          box.append(node('p', '불러오는 중', 'state state-loading'));
        } else if (res.status === 'ok' && res.data != null) {
          renderOk(box, res.data);
        } else if (res.status === 'error') {
          const error = isObject(res.error) ? res.error : {};
          const message = typeof error.message === 'string' && error.message ? error.message : '서버 메시지 없음';
          const prefix = UNVERIFIED_CODES.has(error.code) ? '확인 불가' : '연결 실패';
          box.append(node('p', `${prefix}: ${message}`, 'state state-error'));
        } else {
          box.append(node('p', '확인 불가: 상태를 알 수 없는 응답입니다.', 'state state-error'));
        }
        return box;
      };

      // 제공 화면의 현재 로그인 카드와 같은 dl.identity(제목 dt·값 dd) 배치를 쓴다.
      const pair = (list, label, ...values) => {
        const value = node('dd');
        for (const part of values) value.append(typeof part === 'string' ? document.createTextNode(part) : part);
        list.append(node('dt', label), value);
      };

      const root = node('div', null, 'student-identity');

      root.append(section('현재 계정', me, (box, data) => {
        const user = isObject(data.user) ? data.user : {};
        const device = isObject(data.device) ? data.device : {};
        const session = isObject(data.session) ? data.session : {};
        const list = node('dl', null, 'identity');
        pair(list, '사용자', `${textOf(user.label)} (ID ${textOf(user.id)})`);
        pair(list, '현재 기기', `${textOf(device.label)} (ID ${textOf(device.id)}) · `, stateNode(DEVICE_LABELS, device.status));
        pair(list, '로그인 세션', `${textOf(session.id)} · `, stateNode(SESSION_LABELS, session.status));
        box.append(list);
      }));

      root.append(section('내 기기', devices, (box, data) => {
        if (!Array.isArray(data) || data.length === 0) {
          box.append(node('p', Array.isArray(data) ? '등록된 기기가 없습니다.' : '확인 불가: 기기 목록 형식이 아닙니다.', 'state state-empty'));
          return;
        }
        const list = node('ul', null, 'plain-list');
        for (const item of data) {
          const device = isObject(item) ? item : {};
          const li = node('li');
          li.append(node('span', `${textOf(device.label)} (ID ${textOf(device.id)})`, 'item-title'), stateNode(DEVICE_LABELS, device.status));
          list.append(li);
        }
        box.append(list);
      }));

      root.append(section('내 세션', sessions, (box, data) => {
        if (!Array.isArray(data) || data.length === 0) {
          box.append(node('p', Array.isArray(data) ? '로그인 세션이 없습니다.' : '확인 불가: 세션 목록 형식이 아닙니다.', 'state state-empty'));
          return;
        }
        const list = node('ul', null, 'plain-list');
        for (const item of data) {
          const session = isObject(item) ? item : {};
          const li = node('li');
          li.append(node('span', textOf(session.id), 'item-title'), stateNode(SESSION_LABELS, session.status));
          list.append(li);
        }
        box.append(list);
      }));

      return root;
    },
    // 14단계: 선택한 업무 앱 한 개의 접근 판정·이유·시각을 표시한다.
    // 입력은 { status, mode, data?, error?, appId } 이고 data 는 { appId, decision, reason, checkedAt } 다.
    // 요청 실패(error)는 접근 거부 판정과 다르게, 확인 불가(unknown·목록 밖 값)는 허용과 다르게 보이게 한다.
    renderDecision({ status, mode, data, error, appId } = {}) {
      const DECISION_LABELS = {
        allow: { label: '접근 허용', note: '정책상 접근이 허용됐습니다. 실제 앱 접속 성공을 보장하지는 않습니다.', className: 'state state-ok' },
        deny: { label: '접근 거부', note: '서버가 이 앱 접근을 거부했습니다.', className: 'state state-error' },
        challenge: { label: '추가 인증 또는 확인 필요', note: '서버가 추가 확인을 요구했습니다. 이 앱이 추가 인증을 대신 수행하지 않습니다.', className: 'state state-loading' },
        unknown: { label: '판정 확인 불가', note: '판정을 확인할 수 없습니다. 접근이 허용되지 않은 것으로 보고, 허용으로 간주하지 마세요.', className: 'state state-empty' },
      };
      const MODE_LABELS = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
      const UNVERIFIED_CODES = new Set(['CONTRACT_MISMATCH', 'ENGINE_RESULT_UNVERIFIED']);

      const node = (tag, text, className) => {
        const element = document.createElement(tag);
        if (text != null) element.textContent = String(text);
        if (className) element.className = className;
        return element;
      };
      const isText = (value) => typeof value === 'string' && value !== '';
      const formatTime = (value) => {
        if (!isText(value)) return '판정 시각 정보 없음';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? `${value} (시각 형식 확인 불가)` : `${date.toLocaleString('ko-KR')} (${value})`;
      };
      const pair = (list, label, text) => list.append(node('dt', label), node('dd', text));

      const root = node('div', null, 'student-decision');
      // connected 외의 모드는 모든 상태에서 함께 안내한다.
      if (mode !== 'connected' && status !== 'idle') {
        const key = Object.hasOwn(MODE_LABELS, mode) ? mode : 'unknown';
        root.append(node('p', `연결 모드: ${MODE_LABELS[key]} (${mode || 'unknown'})`, 'tag tag-demo'));
      }
      const appText = isText(appId) ? appId : '앱 정보 없음';

      if (status === 'idle') {
        root.append(node('p', '앱을 골라 접속을 요청하세요. 아직 요청한 업무 앱이 없습니다.', 'muted'));
        return root;
      }
      if (status === 'loading') {
        root.append(node('p', `판정 확인 중 · 업무 앱 ${appText}`, 'state state-loading'));
        return root;
      }
      if (status === 'error') {
        const err = error != null && typeof error === 'object' ? error : {};
        const message = isText(err.message) ? err.message : '서버 메시지 없음';
        const title = UNVERIFIED_CODES.has(err.code) ? '확인 불가(응답 형식 불일치)' : '요청 실패';
        root.append(
          node('p', `${title}: ${message}`, 'state state-error'),
          node('p', `업무 앱 ${appText} · 접근 거부 판정이 아닙니다. 허용도 아닙니다. 필요하면 직접 다시 요청하세요.`, 'muted'),
        );
        return root;
      }
      if (status !== 'ok' || data == null || typeof data !== 'object') {
        root.append(node('p', '판정 확인 불가 (unknown): 상태를 알 수 없는 응답입니다. 허용으로 간주하지 마세요.', 'state state-empty'));
        return root;
      }

      // 목록에 없는 decision, 또는 요청한 앱과 다른 앱의 판정은 확인 불가로 처리한다.
      const received = data.decision;
      const sameApp = !isText(appId) || data.appId === appId;
      const code = sameApp && typeof received === 'string' && Object.hasOwn(DECISION_LABELS, received) ? received : 'unknown';
      const info = DECISION_LABELS[code];
      root.append(node('p', `판정: ${info.label} (${code})`, info.className), node('p', info.note));

      const list = node('dl', null, 'identity');
      pair(list, '업무 앱', isText(data.appId) ? data.appId : appText);
      pair(list, '판정 이유', isText(data.reason) ? data.reason : '판정 이유 정보 없음');
      pair(list, '판정 시각', formatTime(data.checkedAt));
      if (code === 'unknown' && received !== 'unknown') {
        pair(list, '서버가 보낸 값', sameApp ? String(received) : `다른 앱(${String(data.appId)})의 판정이라 표시하지 않음`);
      }
      root.append(list);
      return root;
    },
    // 15단계: 본인의 최근 접속 기록(access)·저장된 XDR 경보(xdr)를 최신순 목록·필터·상세로 표시한다.
    // 입력은 { status, mode, data?, error? } 이고 data 는 기록 배열이다. 받은 배열은 복사해서 정렬하고 원본은 바꾸지 않는다.
    // 필터와 상세 선택은 같은 파일의 studentEventsState 에 두고, 서버에 다시 묻지 않고 받은 배열 안에서만 거른다.
    // 새 자료(다시 불러오기의 loading·error 또는 다른 목록)가 오면 이전 목록·필터·상세를 모두 지우고 다시 그린다.
    renderEvents({ status, mode, data, error } = {}) {
      const KIND_LABELS = { access: '접속 기록', xdr: 'XDR 경보' };
      const ACCESS_LABELS = { allowed: '허용됨', denied: '거부됨', unknown: '확인 불가' };
      const SESSION_LABELS = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
      const DEVICE_LABELS = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
      const MODE_LABELS = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
      const UNVERIFIED_CODES = new Set(['CONTRACT_MISMATCH', 'ENGINE_RESULT_UNVERIFIED']);
      const state = studentEventsState;

      const node = (tag, text, className) => {
        const element = document.createElement(tag);
        if (text != null) element.textContent = String(text);
        if (className) element.className = className;
        return element;
      };
      const isText = (value) => typeof value === 'string' && value !== '';
      const isObject = (value) => value != null && typeof value === 'object';
      // 원래 값과 한국어 설명을 함께 적는다. 목록에 없는 값은 확인 불가로 보이게 한다. 예: "확인 불가(unknown)"
      const coded = (labels, value) => {
        const raw = isText(value) ? value : 'unknown';
        return Object.hasOwn(labels, raw) ? `${labels[raw]}(${raw})` : `확인 불가(${raw})`;
      };
      const timeText = (at) => {
        if (!isText(at)) return '시각 정보 없음';
        const date = new Date(at);
        return Number.isNaN(date.getTime()) ? `${at} (시각 형식 확인 불가)` : `${date.toLocaleString('ko-KR')} (${at})`;
      };
      const appText = (appId) => (isText(appId) ? appId : '앱 확인 불가(appId 없음)');
      const resetView = () => {
        state.filters = { kind: 'all', app: 'all', access: 'all' };
        state.selectedId = null;
        state.dataKey = null;
      };

      const root = node('div', null, 'student-events');
      if (mode !== 'connected') {
        const key = Object.hasOwn(MODE_LABELS, mode) ? mode : 'unknown';
        root.append(node('p', `연결 모드: ${MODE_LABELS[key]} (${mode || 'unknown'})`, 'tag tag-demo'));
      }
      root.append(node('p', '관측 범위: 서버가 현재 등록 정보와 맞춰 본 본인의 최근 기록(최대 40건)과 서버에 이미 저장된 XDR 경보입니다. 모든 직원의 전체 이력이나 화면을 열 때 새로 탐지한 결과가 아닙니다.', 'muted'));

      // 불러오는 중·실패에서는 이전 목록·필터·상세를 지운다.
      if (status === 'loading') {
        resetView();
        root.append(node('p', '기록을 불러오는 중', 'state state-loading'));
        return root;
      }
      if (status === 'error') {
        resetView();
        const err = isObject(error) ? error : {};
        const message = isText(err.message) ? err.message : '서버 메시지 없음';
        root.append(UNVERIFIED_CODES.has(err.code)
          ? node('p', `확인 불가(응답 형식 불일치): 기록을 표시하지 않습니다. ${message}`, 'state state-error')
          : node('p', `기록을 불러오지 못했습니다: ${message}`, 'state state-error'));
        root.append(node('p', UNVERIFIED_CODES.has(err.code)
          ? '빈 목록이 아니라 기록을 확인할 수 없는 상태입니다. 이전 기록은 지웠습니다. 필요하면 직접 다시 불러오세요.'
          : '빈 목록이 아니라 조회 실패입니다. 이전 기록은 지웠습니다. 필요하면 직접 다시 불러오세요.', 'muted'));
        return root;
      }
      if (status !== 'ok' || !Array.isArray(data)) {
        resetView();
        root.append(node('p', '확인 불가: 기록 목록 형식이 아닙니다. 이전 기록은 지웠습니다.', 'state state-error'));
        return root;
      }
      if (data.length === 0) {
        resetView();
        root.append(node('p', '표시할 기록이 없습니다. 조회는 성공했고 해당 범위에 기록이 0건입니다.', 'state state-empty'));
        return root;
      }

      // 받은 배열을 복사해 at 기준 최신순으로 정렬한다. 시각을 읽을 수 없는 기록은 맨 뒤로 둔다.
      const timeOf = (event) => {
        const ms = isObject(event) && isText(event.at) ? Date.parse(event.at) : NaN;
        return Number.isNaN(ms) ? -Infinity : ms;
      };
      const events = data.filter(isObject).slice().sort((a, b) => timeOf(b) - timeOf(a));
      const dataKey = JSON.stringify(events.map((event) => [event.id, event.at]));
      if (state.dataKey !== dataKey) resetView();
      state.dataKey = dataKey;

      const accessOf = (event) => (isObject(event.state) ? event.state.access : undefined);
      const appValue = (event) => (isText(event.appId) ? event.appId : '');
      const uniques = (values) => [...new Set(values)];

      const select = (labelText, key, values, describe) => {
        const wrap = node('label', null, 'student-filter');
        wrap.append(node('span', `${labelText} `, 'muted'));
        const box = node('select');
        box.setAttribute('aria-label', labelText);
        box.dataset.studentFilter = key;
        const options = [['all', '전체(all)'], ...values.map((value) => [value, describe(value)])];
        for (const [value, text] of options) {
          const option = node('option', text);
          option.value = value;
          box.append(option);
        }
        if (!options.some(([value]) => value === state.filters[key])) state.filters[key] = 'all';
        box.value = state.filters[key];
        box.addEventListener('change', () => {
          state.filters[key] = box.value;
          drawResults();
        });
        wrap.append(box);
        return wrap;
      };

      const filterBar = node('div', null, 'row');
      filterBar.append(
        select('기록 종류', 'kind', uniques(events.map((event) => (isText(event.kind) ? event.kind : 'unknown'))), (value) => coded(KIND_LABELS, value)),
        select('업무 앱', 'app', uniques(events.map(appValue)), (value) => (value === '' ? '앱 확인 불가(appId 없음)' : value)),
        select('접속 상태', 'access', uniques(events.map((event) => (isText(accessOf(event)) ? accessOf(event) : 'unknown'))), (value) => coded(ACCESS_LABELS, value)),
      );
      const results = node('div', null, 'student-events-results');
      root.append(filterBar, results);

      const textList = (title, entries) => {
        const block = node('div');
        block.append(node('h4', title));
        const items = Array.isArray(entries) ? entries.filter(isObject) : [];
        if (items.length === 0) {
          block.append(node('p', `${title} 없음`, 'muted'));
          return block;
        }
        const list = node('ul');
        for (const entry of items) list.append(node('li', `${isText(entry.id) ? entry.id : 'ID 없음'}: ${isText(entry.text) ? entry.text : '내용 없음'}`));
        block.append(list);
        return block;
      };

      const detailOf = (event) => {
        const box = node('section', null, 'student-event-detail');
        box.dataset.studentEventDetail = String(event.id);
        box.append(node('h4', `${event.id} 상세`));
        const facts = node('dl', null, 'identity');
        const pair = (label, text) => facts.append(node('dt', label), node('dd', text));
        const eventState = isObject(event.state) ? event.state : {};
        pair('사건 ID', String(event.id));
        pair('앱', appText(event.appId));
        pair('접속 상태', coded(ACCESS_LABELS, eventState.access));
        pair('세션 상태', coded(SESSION_LABELS, eventState.session));
        pair('기기 상태', coded(DEVICE_LABELS, eventState.device));
        box.append(facts, textList('근거(evidence)', event.evidence), textList('규칙(rules)', event.rules));
        // 16단계: 연결되지 않은 조치가 넘어온 경우에만 「<action> 미지원」 비활성 버튼과 안내를 둔다.
        // supportedActions 가 비어 있으면 아무 버튼도 만들지 않는다. 어떤 요청도 보내지 않는다.
        const actions = Array.isArray(event.supportedActions) ? event.supportedActions.filter(isText) : [];
        if (actions.length > 0) {
          const actionBox = node('div');
          actionBox.append(node('h4', '조치(아직 지원하지 않음)'), node('p', '조치 실행 연결은 준비 중입니다. 아래 버튼은 비활성이며 누르거나 선택해도 요청을 보내지 않습니다.', 'muted'));
          for (const action of actions) {
            const button = node('button', `${action} 미지원`, 'btn');
            button.type = 'button';
            button.disabled = true;
            button.setAttribute('aria-label', `${action} 미지원`);
            button.dataset.studentUnsupportedAction = action;
            actionBox.append(button);
          }
          box.append(actionBox);
        }
        return box;
      };

      // 필터·상세를 바꿀 때는 결과 영역만 다시 그리고, 누른 버튼으로 포커스를 돌려준다.
      function drawResults(focusId) {
        const shown = events.filter((event) =>
          (state.filters.kind === 'all' || (isText(event.kind) ? event.kind : 'unknown') === state.filters.kind)
          && (state.filters.app === 'all' || appValue(event) === state.filters.app)
          && (state.filters.access === 'all' || (isText(accessOf(event)) ? accessOf(event) : 'unknown') === state.filters.access));
        if (!shown.some((event) => String(event.id) === state.selectedId)) state.selectedId = null;

        const children = [node('p', `표시 ${shown.length}건 / 받은 기록 ${events.length}건 (최신순)`, 'muted')];
        if (shown.length === 0) {
          children.push(node('p', '선택한 필터 조건에 맞는 기록이 없습니다. 필터를 전체(all)로 바꾸면 다시 보입니다.', 'state state-empty'));
        } else {
          const list = node('ul', null, 'plain-list');
          for (const event of shown) {
            const id = String(event.id);
            const item = node('li');
            item.dataset.studentEventId = id;
            const summary = node('div');
            summary.append(
              node('span', `${id} · ${timeText(event.at)}`, 'item-title'),
              node('p', `종류: ${coded(KIND_LABELS, event.kind)} · 앱: ${appText(event.appId)}`, 'muted'),
              node('p', isText(event.summary) ? event.summary : '요약 없음'),
            );
            const button = node('button', `${id} 상세`, 'btn');
            button.type = 'button';
            button.setAttribute('aria-label', `${id} 상세`);
            button.setAttribute('aria-expanded', String(state.selectedId === id));
            button.dataset.studentDetailFor = id;
            button.addEventListener('click', () => {
              state.selectedId = state.selectedId === id ? null : id;
              drawResults(id);
            });
            item.append(summary, button);
            list.append(item);
          }
          children.push(list);
          const selected = shown.find((event) => String(event.id) === state.selectedId);
          if (selected) children.push(detailOf(selected));
        }
        results.replaceChildren(...children);
        if (focusId != null) {
          const again = [...results.querySelectorAll('button')].find((b) => b.dataset.studentDetailFor === focusId);
          if (again) again.focus();
        }
      }

      drawResults();
      return root;
    },
    // 16단계: 기기·세션·도움정보의 불러오는 중·빈 목록·실패를 구분하고, 알림과 다시 시도 방법을 안내한다.
    // 입력은 { devices, sessions, notifications, diagnostics, mode } 이다. diagnostics 는 제공 화면이 조회해 넘겨준 값이며
    // 이 함수는 /api/diagnostics 를 직접 부르지 않는다. 자동으로 다시 요청하지 않고, 다시 시도는 사용자가 직접 누른다.
    renderStatus({ devices, sessions, notifications, diagnostics, mode } = {}) {
      const DEVICE_LABELS = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
      const SESSION_LABELS = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
      const MODE_LABELS = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
      const RESOURCE_LABELS = { me: '로그인 정보', apps: '업무 앱', access: '접속 판정', events: '보안 기록', devices: '등록 기기', sessions: '현재 세션', diagnostics: '도움정보', vulnerabilities: '라이브러리 취약점', aiConnection: 'AI 연결' };
      const UNVERIFIED_CODES = new Set(['CONTRACT_MISMATCH', 'ENGINE_RESULT_UNVERIFIED']);
      const OBJECT_NAMES = { '등록 기기': '등록 기기를', '현재 세션': '현재 세션을', '도움정보': '도움정보를' };
      const RETRY_TEXT = '다시 시도는 위쪽 「다시 불러오기」 버튼을 직접 누르세요. 자동으로 다시 요청하지 않습니다.';
      // 화면·복사 내용에 비밀처럼 보이는 값이 섞이지 않도록 가린다.
      const SECRET_PATTERN = /(?:Bearer\s+\S+|sk-[A-Za-z0-9_-]{8,}|sb_secret_\S+|github_pat_\S+|eyJ[A-Za-z0-9_-]{10,}\S*|-----BEGIN [A-Z ]*KEY-----|(?:api[_ -]?key|token|secret|password|authorization|비밀번호|토큰)\s*[:=]\s*\S+)/gi;
      const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,64}$/;
      const state = studentStatusState;

      const node = (tag, text, className) => {
        const element = document.createElement(tag);
        if (text != null) element.textContent = String(text);
        if (className) element.className = className;
        return element;
      };
      const isText = (value) => typeof value === 'string' && value !== '';
      const isObject = (value) => value != null && typeof value === 'object';
      const safe = (value) => (isText(value) ? value.replace(SECRET_PATTERN, '[가림]') : '');
      const safeCode = (value) => (typeof value === 'string' && SAFE_CODE.test(value) ? value : 'unknown');
      const coded = (labels, value) => {
        const raw = isText(value) ? value : 'unknown';
        return Object.hasOwn(labels, raw) ? `${labels[raw]}(${raw})` : `확인 불가(${raw})`;
      };
      const isTimeout = (error) => isObject(error) && typeof error.code === 'string' && error.code.toUpperCase().includes('TIMEOUT');

      // 실패 안내: 무엇을 불러오지 못했는지, 시간 초과 여부, message, 사용자가 누르는 다시 시도 안내.
      const failure = (what, error) => {
        const err = isObject(error) ? error : {};
        const message = safe(err.message) || '서버 메시지 없음';
        const reason = isTimeout(err) ? '시간 초과로 불러오지 못했습니다'
          : UNVERIFIED_CODES.has(err.code) ? '응답 형식을 확인할 수 없습니다(확인 불가)' : '불러오지 못했습니다';
        const box = node('div');
        box.append(
          node('p', `${OBJECT_NAMES[what] || `${what}:`} ${reason} [${safeCode(err.code)}]: ${message}`, 'state state-error'),
          node('p', RETRY_TEXT, 'muted'),
        );
        return box;
      };

      const section = (title, note) => {
        const box = node('section', null, 'student-status-section');
        box.append(node('h3', title));
        if (note) box.append(node('p', note, 'muted'));
        return box;
      };

      // 목록 자료(기기·세션)의 불러오는 중·빈 목록·실패·정상을 서로 다른 문장으로 보여 준다.
      const listSection = (title, note, resource, emptyText, describe) => {
        const box = section(title, note);
        const res = isObject(resource) ? resource : { status: 'unknown' };
        if (res.status === 'loading') box.append(node('p', `${title} 불러오는 중`, 'state state-loading'));
        else if (res.status === 'error') box.append(failure(title, res.error));
        else if (res.status === 'ok' && Array.isArray(res.data) && res.data.length === 0) box.append(node('p', emptyText, 'state state-empty'));
        else if (res.status === 'ok' && Array.isArray(res.data)) {
          const list = node('ul', null, 'plain-list');
          for (const item of res.data) list.append(describe(isObject(item) ? item : {}));
          box.append(list);
        } else box.append(node('p', `${title}: 확인 불가(상태를 알 수 없는 응답)`, 'state state-error'));
        return box;
      };
      const row = (title, status) => {
        const item = node('li');
        item.append(node('span', title, 'item-title'), node('span', status, 'muted'));
        return item;
      };

      const root = node('div', null, 'student-status');
      if (mode !== 'connected') {
        const key = Object.hasOwn(MODE_LABELS, mode) ? mode : 'unknown';
        root.append(node('p', `연결 모드: ${MODE_LABELS[key]} (${mode || 'unknown'})`, 'tag tag-demo'));
      }

      // 1) 알림: 항목마다 어느 자료(resource)인지, 안전한 code, message.
      const alertBox = section('주의할 알림');
      const alerts = Array.isArray(notifications) ? notifications.filter(isObject) : [];
      if (!Array.isArray(notifications)) alertBox.append(node('p', '알림 목록을 확인할 수 없습니다(확인 불가).', 'state state-error'));
      else if (alerts.length === 0) alertBox.append(node('p', '주의할 알림이 없습니다.', 'state state-empty'));
      else {
        const list = node('ul');
        for (const alert of alerts) {
          const resourceKey = isText(alert.resource) ? alert.resource : 'unknown';
          const resourceName = Object.hasOwn(RESOURCE_LABELS, resourceKey) ? RESOURCE_LABELS[resourceKey] : '확인 불가';
          list.append(node('li', `자료: ${resourceName}(${safeCode(resourceKey)}) · 코드: ${safeCode(alert.code)} · ${safe(alert.message) || '메시지 없음'}`));
        }
        alertBox.append(list);
      }
      root.append(alertBox);

      // 2) 기기·세션.
      root.append(listSection('등록 기기', '내 이름으로 등록되고 회수되지 않은 기기(최대 100개)입니다. 지금 쓰는 기기가 맨 앞에 옵니다. 서버가 모르는 값은 확인 불가로 표시합니다.',
        devices, '등록된 기기가 없습니다.', (device) => row(`${isText(device.label) ? device.label : '이름 없음'} (ID ${isText(device.id) ? device.id : '없음'})`, coded(DEVICE_LABELS, device.status))));
      root.append(listSection('현재 세션', '지금 검증된 연결 하나만 표시합니다. 지난 세션 목록이 아닙니다.',
        sessions, '현재 연결이 없습니다.', (session) => row(isText(session.id) ? session.id : 'ID 없음', coded(SESSION_LABELS, session.status))));

      // 3) 도움정보: 정해진 여섯 값만 고른다. 그 밖의 항목은 화면에도 복사 내용에도 넣지 않는다.
      const diagBox = section('도움정보', '도움 요청에 쓰도록 비밀 없는 점검 값만 표시하고 복사합니다. 자료는 위쪽 제공 화면의 「도움정보 불러오기」로 직접 불러옵니다.');
      const diag = isObject(diagnostics) ? diagnostics : { status: 'idle' };
      let safeDiag = null;
      if (diag.status === 'ok' && isObject(diag.data)) {
        const engine = isObject(diag.data.engine) ? diag.data.engine : {};
        safeDiag = {
          requestId: safe(diag.data.requestId) || '확인 불가',
          component: safe(diag.data.component) || '확인 불가',
          version: safe(diag.data.version) || '확인 불가',
          checkedAt: safe(diag.data.checkedAt) || '확인 불가',
          'engine.mode': safe(engine.mode) || '확인 불가',
          'engine.code': safeCode(engine.code),
        };
        const facts = node('dl', null, 'identity');
        for (const [key, value] of Object.entries(safeDiag)) facts.append(node('dt', key), node('dd', value));
        diagBox.append(facts);
      } else if (diag.status === 'loading') diagBox.append(node('p', '도움정보 불러오는 중', 'state state-loading'));
      else if (diag.status === 'error') diagBox.append(failure('도움정보', diag.error));
      else diagBox.append(node('p', '아직 도움정보를 불러오지 않았습니다.', 'state state-empty'));

      const copyText = safeDiag ? Object.entries(safeDiag).map(([key, value]) => `${key}: ${value}`).join('\n') : '';
      if (state.copyKey !== copyText) {
        state.copyKey = copyText;
        state.message = null;
        state.fallback = false;
      }
      const copyButton = node('button', '도움정보 복사', 'btn');
      copyButton.type = 'button';
      copyButton.setAttribute('aria-label', '도움정보 복사');
      copyButton.disabled = !copyText;
      const copyStatus = node('p', state.message || (copyText ? '누르면 위의 여섯 값만 클립보드에 복사합니다.' : '도움정보를 불러온 뒤 복사할 수 있습니다.'), 'muted');
      copyStatus.setAttribute('role', 'status');
      const fallback = node('pre', copyText, 'diag-output');
      fallback.hidden = !state.fallback;
      // 사용자가 누를 때만 복사한다. 자동 복사·자동 전송은 하지 않는다.
      copyButton.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(copyText);
          state.message = '도움정보 여섯 값을 클립보드에 복사했습니다. 붙여 넣기 전에 내용을 직접 확인하세요.';
          state.fallback = false;
        } catch {
          state.message = '자동 복사를 사용할 수 없습니다. 아래 내용을 직접 선택해 복사하세요.';
          state.fallback = true;
        }
        copyStatus.textContent = state.message;
        fallback.hidden = !state.fallback;
      });
      diagBox.append(copyButton, copyStatus, fallback);
      root.append(diagBox);
      return root;
    },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
