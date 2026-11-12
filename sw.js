// Service worker демо ABL: оболочка приложения — из кэша, данные — сначала из сети (с откатом на кэш).
const VERSION = "abl-demo-20261112151625";
const SHELL = ["./", "index.html", "styles.css?v=20261112151625", "app.js?v=20261112151625", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-180.png", "icons/round_mark.svg", "icons/main_logo.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// В подвальных залах сеть часто «висит», а не обрывается: если ответа нет за 4 секунды, отдаём сохранённую копию.
// Ответ из кэша помечается заголовком X-ABL-Cache, чтобы приложение показало плашку «Нет сети».
const NET_TIMEOUT = 4000;
function fromCache(req) {
  return caches.match(req).then((hit) => {
    if (!hit) return null;
    const h = new Headers(hit.headers);
    h.set("X-ABL-Cache", "1");
    return hit.blob().then((b) => new Response(b, { status: hit.status, statusText: hit.statusText, headers: h }));
  });
}
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isData = url.origin === location.origin && url.pathname.includes("/data/");
  const net = fetch(req).then((res) => {
    if (res.ok && (url.origin === location.origin || req.url.includes("fonts.g"))) {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  });
  if (!isData) { e.respondWith(net.catch(() => caches.match(req))); return; }
  e.respondWith(new Promise((resolve, reject) => {
    let done = false;
    const fallback = () => fromCache(req).then((r) => { if (r && !done) { done = true; resolve(r); } return r; });
    const timer = setTimeout(fallback, NET_TIMEOUT);
    net.then((res) => { clearTimeout(timer); if (!done) { done = true; resolve(res); } })
      .catch(() => { clearTimeout(timer); fallback().then((r) => { if (!r && !done) reject(new Error("offline")); }); });
  }));
});
