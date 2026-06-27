// Service worker mínimo do dashboard (Canal do Anfitrião).
// Objetivo: tornar o app instalável (home screen / standalone) e dar um
// fallback offline para navegação. NÃO faz cache de dados/API, pra nunca
// mostrar número velho — dados são sempre buscados da rede.

const CACHE = "cda-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(["/"]))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  // Só intercepta navegação (abrir páginas): rede primeiro, cai pro shell
  // em cache se estiver offline. Requisições de dados passam direto.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/")));
  }
});
