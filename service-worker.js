// VERA GYM App - Service Worker [TEST]
const CACHE_NAME = 'veragym-v40';
const IMG_CACHE  = 'veragym-test-img-v1'; // 운동 이미지 전용 캐시 (별도 관리)
const MAX_IMG_ENTRIES = 200; // 이미지 캐시 최대 항목 수 (~50MB 기준)

const STATIC = [
  '/veragym-test/',
  '/veragym-test/index.html',
  '/veragym-test/admin-login.html',
  '/veragym-test/admin.html',
  '/veragym-test/trainer-login.html',
  '/veragym-test/trainer-dash.html',
  '/veragym-test/session-write.html',
  '/veragym-test/exercise-library.html',
  '/veragym-test/member-view.html',
  '/veragym-test/image-card.html',
  '/veragym-test/routine-utils.js',
  '/veragym-test/config.js',
  '/veragym-test/manifest.json',
  '/veragym-test/manifest-admin.json',
  '/veragym-test/manifest-member.json',
  '/veragym-test/icons/icon-192.png',
  '/veragym-test/icons/icon-512.png',
  '/veragym-test/icons/icon-admin-192.png',
  '/veragym-test/icons/icon-admin-512.png',
  '/veragym-test/images/anatomy/muscle-front.png',
  '/veragym-test/images/anatomy/muscle-back.png',
  '/veragym-test/images/anatomy/skeleton-front.png',
  '/veragym-test/images/anatomy/skeleton-side.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  const KEEP = new Set([CACHE_NAME, IMG_CACHE]);
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !KEEP.has(k)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // ── Supabase Storage 이미지: 캐시 우선 → 없으면 네트워크 + 저장 ──
  // 한번 본 운동 이미지는 기기 캐시에 저장되어 오프라인/느린 네트워크에서도 즉시 표시
  if (url.includes('supabase.co/storage/v1/object/')) {
    e.respondWith(
      caches.open(IMG_CACHE).then(imgCache =>
        imgCache.match(e.request).then(cached => {
          if (cached) return cached; // 캐시 히트 → 즉시 반환
          // 캐시 미스 → 네트워크에서 가져오고 캐시에 저장
          return fetch(e.request).then(res => {
            if (res.ok) {
              imgCache.put(e.request, res.clone()).then(() => {
                // 최대 항목 초과 시 오래된 것부터 제거 (LRU-approximation)
                imgCache.keys().then(keys => {
                  if (keys.length > MAX_IMG_ENTRIES) {
                    keys.slice(0, keys.length - MAX_IMG_ENTRIES).forEach(k => imgCache.delete(k));
                  }
                });
              });
            }
            return res;
          }).catch(() => new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // ── 나머지 Supabase API (REST/Auth/Functions/RPC): 네트워크 전용 ──
  if (url.includes('supabase.co')) {
    e.respondWith(fetch(e.request).catch(() => new Response('offline', { status: 503 })));
    return;
  }

  // ── HTML + JS: 네트워크 우선 → 항상 최신 버전 보장, 오프라인 시 캐시 폴백 ──
  const isHtmlOrJs = url.includes('/veragym-test/') &&
    (url.endsWith('.html') || url.endsWith('.js') || url.endsWith('/veragym-test/'));

  if (isHtmlOrJs) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // ── 아이콘·매니페스트: 캐시 우선 ──
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
