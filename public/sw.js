// BYTE BACK 접속 앱 서비스 워커: 오프라인 안내 화면만 보관합니다.
// 로그인 토큰, 기기 키, /api/ 응답(메모 자료)은 저장하지 않습니다.
const CACHE = 'byteback-offline-v1';
const OFFLINE_FILES = ['/offline.html', '/icon-192.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(OFFLINE_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  // 화면 이동만 다루고, 연결이 끊겼을 때 오프라인 안내를 보여 줍니다. API 요청은 손대지 않습니다.
  if (request.mode !== 'navigate') return;
  event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
});
