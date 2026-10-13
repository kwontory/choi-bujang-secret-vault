// BYTE BACK 접속 앱 화면. 기기 키·토큰·승인 증표는 메모리에만 두고, 승인은 서버와 판정기가 정합니다.
const loginForm = document.querySelector('#login-form');
const signedIn = document.querySelector('#signed-in');
const vault = document.querySelector('#vault');
const status = document.querySelector('#status');
const sessionText = document.querySelector('#session');
const notes = document.querySelector('#notes');
const noteForm = document.querySelector('#note-form');
const noteId = document.querySelector('#note-id');
const noteTitle = document.querySelector('#note-title');
const noteBody = document.querySelector('#note-body');
const saveNote = document.querySelector('#save-note');
const cancelEdit = document.querySelector('#cancel-edit');
const deviceBadge = document.querySelector('#device-badge');
const deviceDetail = document.querySelector('#device-detail');
const deviceIdText = document.querySelector('#device-id');
const requestDevice = document.querySelector('#request-device');
const checkDevice = document.querySelector('#check-device');
const offline = document.querySelector('#offline');
let session = null;
let currentNotes = [];
let approved = false;
let grant = null;

const encoder = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256Hex = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');
const deviceKey = (async () => {
  if (!globalThis.crypto?.subtle) throw new Error('webcrypto_unavailable');
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const { kty, crv, x, y } = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const publicKey = { kty, crv, x, y };
  const id = (await sha256Hex(`${crv}.${x}.${y}`)).slice(0, 16);
  return { privateKey: pair.privateKey, publicKey, id };
})();
const sign = async message => {
  const { privateKey } = await deviceKey;
  return b64url(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, encoder.encode(message)));
};
const deviceProof = async action => {
  const { publicKey, id } = await deviceKey;
  const timestamp = String(Date.now());
  return { publicKey, timestamp, signature: await sign(`aleph-device-v1|${action}|${id}|${timestamp}`) };
};
const authHeaders = () => (session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {});
const signedHeaders = async (method, path, body) => {
  const { id } = await deviceKey;
  const timestamp = String(Date.now());
  const bodySha256 = await sha256Hex(body ?? '');
  return { 'X-Aleph-Device': id, 'X-Aleph-Timestamp': timestamp, 'X-Aleph-Grant': grant ?? '',
    'X-Aleph-Signature': await sign(`aleph-request-v1|${method}|${path}|${bodySha256}|${timestamp}|${id}`) };
};

// 보호 요청은 모두 선언된 경로(aleph.config.json allowedRoutes)로만, 앱 서명을 붙여 보냅니다.
const api = async (apiPath, options = {}) => {
  if (!approved) throw new Error('device_not_approved');
  const method = options.method ?? 'GET';
  const requestOptions = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(await signedHeaders(method, apiPath, options.body)),
      ...options.headers,
    },
  };
  const response = await fetch(apiPath, requestOptions);
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `request_failed_${response.status}`);
  return body;
};

const resetEditor = () => {
  noteForm.reset();
  noteId.value = '';
  saveNote.textContent = '추가';
  cancelEdit.hidden = true;
};

const renderNotes = () => {
  if (!currentNotes.length) {
    const empty = document.createElement('li');
    empty.textContent = '저장된 가상 메모가 없습니다.';
    notes.replaceChildren(empty);
    return;
  }
  notes.replaceChildren(...currentNotes.map(note => {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    const body = document.createElement('span');
    const actions = document.createElement('div');
    const edit = document.createElement('button');
    const remove = document.createElement('button');
    title.textContent = note.title;
    body.textContent = note.body;
    actions.className = 'row';
    edit.type = remove.type = 'button';
    edit.className = 'secondary';
    remove.className = 'danger';
    edit.textContent = '수정';
    remove.textContent = '삭제';
    edit.addEventListener('click', () => {
      noteId.value = note.id;
      noteTitle.value = note.title;
      noteBody.value = note.body;
      saveNote.textContent = '수정 저장';
      cancelEdit.hidden = false;
      noteTitle.focus();
    });
    remove.addEventListener('click', async () => {
      try {
        await api(`/api/notes/${note.id}`, { method: 'DELETE' });
        await loadNotes();
        status.textContent = '가상 메모를 삭제했습니다.';
      } catch (error) { status.textContent = `삭제 실패: ${error.message}`; }
    });
    actions.append(edit, remove);
    item.append(title, body, actions);
    return item;
  }));
};

const loadNotes = async () => {
  currentNotes = await api('/api/my/notes');
  renderNotes();
  await loadAnnouncements();
};

const announcementsList = document.querySelector('#announcements');
const loadAnnouncements = async () => {
  try {
    const items = await api('/api/announcements');
    announcementsList.replaceChildren(...(items.length ? items : [{ title: '등록된 반 공지가 없습니다.', body: '' }]).map(item => {
      const li = document.createElement('li'); const title = document.createElement('strong'); const body = document.createElement('span');
      title.textContent = item.title; body.textContent = item.body; li.append(title, body); return li;
    }));
  } catch (error) {
    const li = document.createElement('li'); li.textContent = `반 공지를 불러오지 못했습니다: ${error.message}`;
    announcementsList.replaceChildren(li);
  }
};

const closeVault = () => {
  approved = false;
  vault.hidden = true;
  currentNotes = [];
  notes.replaceChildren();
  document.querySelector('#announcements')?.replaceChildren();
};

const showDevice = (label, kind, detail) => {
  deviceBadge.textContent = label;
  deviceBadge.className = `badge ${kind}`;
  deviceDetail.textContent = detail;
};

const deviceCall = async (action) => {
  const response = await fetch(`/api/device/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ ...(await deviceProof(action)), ...(action === 'status' && grant ? { grant } : {}) }),
  });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, httpStatus: response.status, ...(body ?? {}) };
};

const showLoggedOut = () => {
  session = null; grant = null;
  loginForm.hidden = false; signedIn.hidden = true;
  requestDevice.disabled = true; checkDevice.disabled = true;
  sessionText.textContent = '';
  showDevice('미승인', 'no', '승인 안내: 로그인하면 이 기기의 승인을 서버에 요청합니다. 서버와 판정기가 이 기기를 등록 기기로 확인한 뒤에만 자료실이 열리며, 승인 전에는 보호 자료를 보여 주지 않습니다.');
};
const showLoggedIn = label => {
  loginForm.hidden = true; signedIn.hidden = false;
  requestDevice.disabled = false; checkDevice.disabled = false;
  sessionText.textContent = label;
};

const openIfApproved = async result => {
  if (result.ok && result.approved === true && result.decision === 'allow') {
    approved = true;
    showDevice('승인됨', 'ok', '서버가 이 기기를 등록 기기로 확인했고 판정기가 허용했습니다. 기존 자료실을 엽니다.');
    vault.hidden = false;
    try { await loadNotes(); } catch (error) { status.textContent = `자료 조회 실패: ${error.message}`; }
    return true;
  }
  return false;
};

const requestApproval = async () => {
  closeVault();
  showDevice('승인 요청 중', 'wait', '서버가 로그인과 이 기기의 키 증명을 확인하고 판정기에 묻는 중입니다.');
  const result = await deviceCall('register');
  if (result.httpStatus === 401) { showLoggedOut(); return; }
  if (result.ok && result.approved === true && typeof result.grant === 'string') {
    grant = result.grant;
    return refreshDevice();
  }
  if (result.status === 'revoked') return showDevice('회수됨', 'no', '이 기기의 승인이 회수되어 자료실을 열 수 없습니다.');
  showDevice('승인 거부', 'no', `서버가 이 기기를 승인하지 않았습니다: ${result.reasonCode ?? result.error ?? '알 수 없음'}`);
};

const refreshDevice = async () => {
  closeVault();
  if (!navigator.onLine) return showDevice('오프라인', 'no', '연결되면 다시 확인합니다. 오프라인에서는 자료를 보여 주지 않습니다.');
  try {
    const result = await deviceCall('status');
    if (result.httpStatus === 401) return showLoggedOut();
    if (!session) { session = { user: null }; showLoggedIn('서버가 확인한 계정으로 접속했습니다.'); }
    if (await openIfApproved(result)) return;
    if (result.status === 'revoked') return showDevice('회수됨', 'no', '이 기기의 승인이 회수되어 자료실을 열 수 없습니다.');
    if (!result.ok) return showDevice('확인 실패', 'no', `서버에서 승인 상태를 확인하지 못했습니다: ${result.error ?? result.httpStatus}`);
    showDevice('미승인', 'no', '이 기기는 아직 등록 기기가 아닙니다. 「기기 승인 요청」을 누르면 서버에 승인을 요청합니다.');
  } catch (error) {
    showDevice('확인 실패', 'no', `서버에서 승인 상태를 확인하지 못했습니다: ${error.message}`);
  }
};

const showSession = async nextSession => {
  session = nextSession; grant = null;
  closeVault();
  status.textContent = '';
  resetEditor();
  if (!session) return showLoggedOut();
  showLoggedIn(`${session.user?.email ?? '계정'} 계정으로 로그인했습니다.`);
  await refreshDevice();
  if (!approved) await requestApproval();
};

requestDevice.addEventListener('click', () => requestApproval().catch(error => {
  status.textContent = `승인 요청 실패: ${error.message}`;
}));
checkDevice.addEventListener('click', refreshDevice);

const installState = document.querySelector('#install-state');
const showInstall = () => {
  installState.textContent = matchMedia('(display-mode: standalone)').matches ? '설치된 앱으로 열림' : '브라우저 탭';
};
showInstall();

const showNetwork = () => {
  offline.hidden = navigator.onLine;
  if (!navigator.onLine) closeVault();
};
addEventListener('online', () => { showNetwork(); refreshDevice(); });
addEventListener('offline', showNetwork);
showNetwork();
deviceKey.then(({ id }) => { deviceIdText.textContent = id; })
  .catch(() => { deviceIdText.textContent = '이 브라우저에서는 기기 키를 만들 수 없어 승인할 수 없습니다'; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  status.textContent = '로그인 중입니다.';
  const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: document.querySelector('#email').value, password: document.querySelector('#password').value }) });
  document.querySelector('#password').value = '';
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return void (status.textContent = '로그인 실패: 입력 정보를 확인해 주세요.');
  await showSession({ access_token: data.access_token, user: { email: document.querySelector('#email').value } });
});

document.querySelector('#logout').addEventListener('click', async () => {
  await showSession(null);
});

noteForm.addEventListener('submit', async event => {
  event.preventDefault();
  const id = noteId.value;
  try {
    // 새 메모도 자료 ID 하나를 고르는 경로로 만듭니다: PUT /api/notes/<새 UUID>
    await api(`/api/notes/${id || crypto.randomUUID()}`, {
      method: 'PUT',
      body: JSON.stringify({ title: noteTitle.value, body: noteBody.value }),
    });
    resetEditor();
    await loadNotes();
    status.textContent = id ? '가상 메모를 수정했습니다.' : '가상 메모를 추가했습니다.';
  } catch (error) { status.textContent = `저장 실패: ${error.message}`; }
});
cancelEdit.addEventListener('click', resetEditor);

showLoggedOut();
(async () => {
  try {
    await deviceKey;
    const result = await deviceCall('status');
    if (result.httpStatus === 401) return; // 로그인 필요: 로그인 화면 그대로
    session = { user: null };
    showLoggedIn('서버가 확인한 계정으로 접속했습니다.');
    if (!(await openIfApproved(result))) await requestApproval();
  } catch {
  }
})();
