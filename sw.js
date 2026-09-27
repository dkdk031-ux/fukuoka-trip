// 앱 화면은 네트워크 우선(항상 최신 배포), 실패하면 캐시로 오프라인 표시.
// 구글 시트 데이터는 앱이 localStorage에 따로 저장하므로 여기서 캐시하지 않음.
const CACHE = "fuk-trip-v7";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || /docs\.google\.com|script\.google(usercontent)?\.com|accounts\.google\.com|open-meteo\.com/.test(u.host)) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && (u.origin === location.origin || /unpkg\.com|fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(u.host))) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request).then(r => r || (e.request.mode === "navigate" ? caches.match("./index.html") : undefined))));
});
