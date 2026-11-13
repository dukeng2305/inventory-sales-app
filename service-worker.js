const CACHE_PREFIX = `inventory-sales-app:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}27`;
const ASSETS = ["./", "./index.html", "./styles.css?v=27", "./app.js?v=27", "./manifest.webmanifest", "./icon.svg", "./apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS.map((url) =>
    new Request(new URL(url, self.registration.scope), { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" ||
      !ASSETS.some((asset) => new URL(asset, self.registration.scope).href === event.request.url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached && (event.request.destination === "script" || event.request.destination === "style")) {
      return cached;
    }
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        event.waitUntil(cache.put(event.request, response.clone()));
        return response;
      }
      return cached || response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  })());
});
