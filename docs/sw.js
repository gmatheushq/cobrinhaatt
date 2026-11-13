// PWA: abre rapido e funciona offline (o envio de partidas usa a fila local do jogo).
const CACHE = "cobrinha-v1";
const BASE = ["./", "index.html", "jogo.js", "nucleo.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;

  // Modelo da IA: rede primeiro (pega o mais novo), cache se estiver offline.
  if (u.pathname.endsWith("/modelo.json")) {
    e.respondWith(
      fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; })
        .catch(() => caches.match(e.request)),
    );
    return;
  }
  // Resto: cache imediato e atualizacao em segundo plano.
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const rede = fetch(e.request).then((r) => {
        if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); }
        return r;
      }).catch(() => hit);
      return hit || rede;
    }),
  );
});
