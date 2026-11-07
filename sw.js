// Offline-first with background refresh: the app opens instantly from cache,
// and any newer files are fetched and stored for the next launch.
const VERSION = "tally-v13";
const FILES = ["./", "index.html", "app.css", "i18n.js", "app.js", "share.js", "parse.js", "manifest.json", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) {
    return;
  }
  // ?add= and ?voice= links all map to the cached app shell.
  const key = event.request.mode === "navigate" ? "./" : event.request;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(key);
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            cache.put(key, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
