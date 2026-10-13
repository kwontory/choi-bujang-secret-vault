// BYTE BACK 접속 앱 서비스 워커: 오프라인 안내 화면만 보관합니다.
// 로그인 토큰, 기기 키, /api/ 응답(메모 자료)은 저장하지 않습니다.
const CACHE = 'byteback-offline-v2';
const OFFLINE_FILES = ['/offline.html', '/icon.svg'];

self.addEventListener('install', event => {
  // 안내 화면을 미리 담지 못해도(연결 없음 등) 설치는 끝내고, 화면 동작에는 영향을 주지 않습니다.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(OFFLINE_FILES)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  // 화면 이동만 다루고, 연결이 끊겼을 때 오프라인 안내를 보여 줍니다. API 요청은 손대지 않습니다.
  if (request.mode !== 'navigate' || request.method !== 'GET') return;
  event.respondWith(fetch(request).catch(async () => (await caches.match('/offline.html'))
    ?? new Response('오프라인입니다. 연결되면 다시 시도하세요.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
});
