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
const VERSION = "0.7.3";
// true: this release installs and takes over on its own, and open pages are
// reloaded, with no "Update" banner. Must equal `silent` on the newest entry
// in lib/changelog.js (next.config.mjs fails the build otherwise). Set it back
// to false for any normal release.
const SILENT_UPDATE = false;
let replacingWorker = false;
const PREFIX = "mob-";
// Bump REV to ship a fix under the same VERSION: any change to this file makes
// phones install the worker (silently while SILENT_UPDATE is true), and a new
// REV drops the cached HTML and JSON from the previous build.
const REV = 1;
const CACHES = {
  pages: `${PREFIX}pages-${VERSION}-r${REV}`,
  data: `${PREFIX}data-${VERSION}-r${REV}`,
  static: `${PREFIX}static-v1`,
  thumbs: `${PREFIX}thumbs-v1`,
  photos: `${PREFIX}photos-v1`,
  // Not tied to VERSION: survives activate cleanup; also re-put on every install.
  offline: `${PREFIX}offline-v1`,
  // Saved and My kitchen recipes kept for offline use (see KEEP_OFFLINE).
  // Pages and JSON follow the build; photos do not depend on it.
  kept: `${PREFIX}kept-${VERSION}-r${REV}`,
  keptPhotos: `${PREFIX}kept-photos-v1`,
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
const KEEP_MAX_PAGES = 600; // pages + JSON, about 300 recipes
const KEEP_MAX_PHOTOS = 900;
const KEEP_PARALLEL = 3;

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
      // First install: no previous worker, so nothing to wait for. Updates
      // stay in "waiting" until the user accepts them, unless SILENT_UPDATE.
      replacingWorker = !!self.registration.active;
      if (!self.registration.active || SILENT_UPDATE) await self.skipWaiting();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (type === "KEEP_OFFLINE") {
    event.waitUntil(keepOffline(event.data, event.source));
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
      if (SILENT_UPDATE && replacingWorker) {
        // Pick up the new pages and scripts. Only visible windows: this runs
        // when the app is opened, and saved data lives in localStorage.
        const windows = await self.clients.matchAll({ type: "window" });
        await Promise.all(
          windows
            .filter((c) => c.visibilityState === "visible")
            .map((c) => c.navigate(c.url).catch(() => {})),
        );
      }
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
    event.respondWith(cacheFirst(event, CACHES.thumbs, CACHES.keptPhotos));
    return;
  }
  if (path === "/search-index.json" || path.startsWith("/api/recipe/")) {
    event.respondWith(staleWhileRevalidate(event, CACHES.data, CACHES.kept));
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

// `kept` (optional): a KEEP_OFFLINE cache that is looked at first.
async function cacheFirst(event, cacheName, kept) {
  const { request } = event;
  const cache = await caches.open(cacheName);
  const hit =
    (kept && (await (await caches.open(kept)).match(request, { ignoreVary: true }))) ||
    (await cache.match(request));
  if (hit) return hit;
  const res = await fetch(request);
  if (isCacheable(res)) event.waitUntil(put(cacheName, request, res.clone()));
  return res;
}

async function staleWhileRevalidate(event, cacheName, kept) {
  const { request } = event;
  const cache = await caches.open(cacheName);
  const hit =
    (await cache.match(request, { ignoreVary: true })) ||
    (kept && (await (await caches.open(kept)).match(request, { ignoreVary: true }))) ||
    null;
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
    (await (await caches.open(CACHES.kept)).match(request, { ignoreSearch: true, ignoreVary: true })) ||
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

// --- Offline copies of Saved and My kitchen ---------------------------------
// The app (components/OfflineKeeper.jsx) posts the same-site URLs it wants
// kept: recipe pages and JSON in `pages`, photos in `photos`. The worker
// downloads what is missing, a few at a time, and drops what is no longer
// listed. Requests line up so only the newest list is worked on.
let keepJob = Promise.resolve();
let keepNext = null;

function sameSitePaths(list, max) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const raw of list) {
    if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) continue;
    out.push(new URL(raw, self.location.origin).href);
    if (out.length >= max) break;
  }
  return out;
}

function keepOffline(data, source) {
  keepNext = {
    pages: sameSitePaths(data && data.pages, KEEP_MAX_PAGES),
    photos: sameSitePaths(data && data.photos, KEEP_MAX_PHOTOS),
    source,
  };
  keepJob = keepJob.then(async () => {
    const job = keepNext;
    keepNext = null;
    if (!job) return;
    const pages = await mirror(CACHES.kept, job.pages);
    // Ask for webp like an <img> does (the optimizer picks the format by Accept).
    const photos = await mirror(CACHES.keptPhotos, job.photos, {
      headers: { Accept: "image/webp,image/*,*/*;q=0.8" },
    });
    try {
      job.source &&
        job.source.postMessage({ type: "OFFLINE_STATUS", pages, photos, wanted: job.pages.length });
    } catch {
      // the page went away
    }
  });
  return keepJob.catch(() => {});
}

// Makes cache `name` hold exactly `urls` (as far as the network allows).
// Returns how many of them are stored.
async function mirror(name, urls, init = {}) {
  const cache = await caches.open(name);
  const want = new Set(urls);
  const have = new Set((await cache.keys()).map((r) => r.url));
  await Promise.all([...have].filter((u) => !want.has(u)).map((u) => cache.delete(u)));
  const missing = urls.filter((u) => !have.has(u));
  let stored = urls.length - missing.length;
  let next = 0;
  const worker = async () => {
    while (next < missing.length) {
      const url = missing[next++];
      try {
        const res = await fetch(url, { credentials: "same-origin", ...init });
        if (isCacheable(res)) {
          await cache.put(url, res);
          stored += 1;
        }
      } catch {
        // offline or quota: try again with the next list
      }
    }
  };
  await Promise.all(Array.from({ length: KEEP_PARALLEL }, worker));
  return stored;
}

// --- Update alerts (Web Push) -------------------------------------------
// iOS revokes a push subscription if a push arrives and no notification is
// shown, so this handler ALWAYS shows one, even for empty or broken payloads.
const PUSH_DEFAULTS = {
  title: "Mob Recipes",
  body: "A new version is ready. Open the app to update.",
  tag: "mob-update",
  url: "/",
};

function parsePush(event) {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    try {
      const text = event.data && event.data.text();
      data = text ? { body: text } : null;
    } catch {
      data = null;
    }
  }
  if (!data || typeof data !== "object") data = {};
  const str = (v, fallback) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : fallback;
  // Only a same-site path under /push/ is used as the icon. Anything else gets the default.
  const icon =
    typeof data.icon === "string" &&
    data.icon.startsWith("/push/") &&
    data.icon.length <= 100 &&
    !data.icon.includes("..")
      ? data.icon
      : "/icons/icon-192.png";
  return {
    title: str(data.title, PUSH_DEFAULTS.title),
    body: str(data.body, PUSH_DEFAULTS.body),
    tag: str(data.tag, PUSH_DEFAULTS.tag),
    url: str(data.url, PUSH_DEFAULTS.url),
    icon,
  };
}

self.addEventListener("push", (event) => {
  const { title, body, tag, url, icon } = parsePush(event);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon,
      badge: "/icons/icon-192.png",
      data: { url },
    }),
  );
});

function sameOriginUrl(raw) {
  try {
    const u = new URL(typeof raw === "string" && raw ? raw : "/", self.location.origin);
    return u.origin === self.location.origin ? u.href : new URL("/", self.location.origin).href;
  } catch {
    return new URL("/", self.location.origin).href;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = sameOriginUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) {
        let client = existing;
        try {
          if (client.url !== target && "navigate" in client) {
            client = (await client.navigate(target)) || client;
          }
        } catch {
          // Navigation can fail (e.g. client not controlled yet): just focus.
        }
        try {
          await client.focus();
        } catch {
          // ignore
        }
        // Harmless if the page ignores it; opening the app already re-checks.
        try {
          client.postMessage({ type: "CHECK_UPDATE" });
        } catch {
          // ignore
        }
        return;
      }
      const opened = await self.clients.openWindow(target);
      try {
        if (opened) opened.postMessage({ type: "CHECK_UPDATE" });
      } catch {
        // ignore
      }
    })(),
  );
});
