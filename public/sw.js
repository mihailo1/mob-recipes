/* Mob Recipes service worker. Hand written, no build step.
 *
 * VERSION must equal "version" in package.json (next.config.mjs fails the
 * build otherwise). Bump both together on every release: a changed sw.js is
 * what makes the browser install a new worker and the app show "Update".
 * A bump also drops cached HTML and JSON. Image and static caches have their
 * own names so a bump does not throw away downloaded photos or hashed chunks.
 *
 * Lifecycle: the very first install activates at once (nothing to replace).
 * Later versions install and WAIT until the user taps "Update" in the app,
 * which posts {type: "SKIP_WAITING"}. User data lives in localStorage, which
 * the worker never touches.
 */
const VERSION = "0.4.1";
const PREFIX = "mob-";
const CACHES = {
  pages: `${PREFIX}pages-${VERSION}`,
  data: `${PREFIX}data-${VERSION}`,
  static: `${PREFIX}static-v1`,
  thumbs: `${PREFIX}thumbs-v1`,
  photos: `${PREFIX}photos-v1`,
  // Not tied to VERSION: survives activate cleanup; also re-put on every install.
  offline: `${PREFIX}offline-v1`,
};
const LIMITS = {
  [CACHES.static]: 300,
  [CACHES.thumbs]: 400, // /_next/image output, small
  [CACHES.photos]: 80, // CDN originals are ~1MB each, keep iOS storage sane
  [CACHES.pages]: 60,
  [CACHES.data]: 200,
};
const CDN_HOST = "mob-cdn.ams3.digitaloceanspaces.com";
const OFFLINE_URL = "/";
const OFFLINE_PAGE = "/offline.html";
const PRECACHE_REQUIRED = [OFFLINE_URL];
const PRECACHE_OPTIONAL = ["/pool", "/favorites", "/search-index.json"];
const NAV_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(CACHES.pages);
      await pages.addAll(PRECACHE_REQUIRED);
      await (await caches.open(CACHES.offline)).addAll([
        new Request(OFFLINE_PAGE, { cache: "reload" }),
      ]);
      await Promise.all(
        PRECACHE_OPTIONAL.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "no-cache" });
            if (isCacheable(res)) {
              const name = url.endsWith(".json") ? CACHES.data : CACHES.pages;
              await (await caches.open(name)).put(url, res);
            }
          } catch {
            // Best effort: a missing optional entry must not block install.
          }
        }),
      );
      // First install only: no previous worker, so nothing to wait for.
      // Updates stay in "waiting" until the user accepts them.
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (type === "GET_VERSION") {
    const reply = { type: "VERSION", version: VERSION };
    if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
    else if (event.source) event.source.postMessage(reply);
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set(Object.values(CACHES));
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith(PREFIX) && !keep.has(n))
          .map((n) => caches.delete(n)),
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {});
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
  if (request.headers.has("range")) return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin) {
    // Cross origin: only CORS image requests to the CDN. no-cors requests
    // would give opaque responses, which we never store, so leave them alone.
    if (url.hostname === CDN_HOST && request.mode === "cors") {
      event.respondWith(cacheFirst(event, CACHES.photos));
    }
    return;
  }

  const path = url.pathname;
  if (path === "/sw.js" || path.startsWith("/_next/webpack-hmr")) return;

  if (path.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(event, CACHES.static));
    return;
  }
  if (path === "/_next/image" || path.startsWith("/_next/image/")) {
    event.respondWith(cacheFirst(event, CACHES.thumbs));
    return;
  }
  if (path === "/search-index.json" || path.startsWith("/api/recipe/")) {
    event.respondWith(staleWhileRevalidate(event, CACHES.data));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(event));
    return;
  }
  // Everything else (RSC payloads for client side navigation, other API
  // routes, public files) goes straight to the network. If an RSC fetch fails
  // offline, Next falls back to a full navigation, which is handled above.
});

function isCacheable(res) {
  return (
    res &&
    res.status === 200 &&
    res.type !== "opaque" &&
    res.type !== "opaqueredirect" &&
    !res.redirected &&
    !/no-store/i.test(res.headers.get("cache-control") || "")
  );
}

async function put(cacheName, request, response) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
    await trim(cacheName);
  } catch {
    // Quota errors etc.: caching is an optimisation, never fail the request.
  }
}

const trimming = new Map();
function trim(cacheName) {
  const max = LIMITS[cacheName];
  if (!max || trimming.has(cacheName)) return trimming.get(cacheName);
  const job = (async () => {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys(); // insertion order, oldest first
    const excess = keys.length - max;
    for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
  })().finally(() => trimming.delete(cacheName));
  trimming.set(cacheName, job);
  return job;
}

async function cacheFirst(event, cacheName) {
  const { request } = event;
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (isCacheable(res)) event.waitUntil(put(cacheName, request, res.clone()));
  return res;
}

async function staleWhileRevalidate(event, cacheName) {
  const { request } = event;
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreVary: true });
  const network = fetch(request).then((res) => {
    // Return at once; storing the body must not hold back the response.
    if (isCacheable(res)) event.waitUntil(put(cacheName, request, res.clone()));
    return res;
  });
  if (hit) {
    event.waitUntil(network.catch(() => {}));
    return hit;
  }
  return network;
}

async function networkFirstPage(event) {
  const { request } = event;
  const cache = await caches.open(CACHES.pages);

  const network = (async () => {
    const preloaded = await event.preloadResponse;
    const res = preloaded || (await fetch(request));
    if (isCacheable(res)) event.waitUntil(put(CACHES.pages, request, res.clone()));
    return res;
  })();
  event.waitUntil(network.catch(() => {}));

  const fromCache = async () =>
    (await cache.match(request)) ||
    (await cache.match(request, { ignoreSearch: true })) ||
    null;

  // Race the network against a timeout. On timeout serve the cached copy if
  // we have one (network keeps going and refreshes the cache); otherwise keep
  // waiting for the network.
  const timedOut = new Promise((resolve) =>
    setTimeout(() => resolve("timeout"), NAV_TIMEOUT_MS),
  );
  try {
    const first = await Promise.race([network, timedOut]);
    if (first !== "timeout") return first;
    const cached = await fromCache();
    if (cached) return cached;
    return await network;
  } catch {
    const cached = await fromCache();
    if (cached) return cached;
    // Never serve "/" HTML at another URL (Next would see a mismatched route
    // and can loop). The home page itself is matched by fromCache above.
    const offlineCache = await caches.open(CACHES.offline);
    const offline = await offlineCache.match(OFFLINE_PAGE);
    if (offline) return offline;
    return new Response("You are offline.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
