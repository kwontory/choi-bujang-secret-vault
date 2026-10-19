// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
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
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
