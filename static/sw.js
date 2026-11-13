/* DeckForge Input Studio — service worker.
 *
 * Scope is deliberately narrow. The app shell (HTML, bundle, icons, manifest) is
 * cached so the PWA opens instantly and survives a dropped connection; the API
 * is never cached, because every useful thing here is live hardware state — a
 * stale device list or template count is worse than an honest failure.
 *
 * The cache name carries a version: changing BUILT_VERSION retires the previous
 * shell on activate, which is what keeps a redeployed bundle from being served
 * out of an old cache.
 */

const BUILT_VERSION = 'v1';
const SHELL_CACHE = `deckforge-shell-${BUILT_VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/static/dist/web-entry.js',
  '/manifest.webmanifest',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/icon-maskable-512.png',
  '/assets/svg/deckforge-logo.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll() rejects wholesale if any single asset 404s, which would leave
      // the PWA with no shell at all. Add them individually instead.
      await Promise.all(
        SHELL_ASSETS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch (err) {
            // A missing optional asset must not fail the install.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('deckforge-shell-') && name !== SHELL_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

const isApiRequest = (url) =>
  url.pathname.startsWith('/api/') ||
  url.pathname.startsWith('/ws/') ||
  url.protocol === 'ws:' ||
  url.protocol === 'wss:';

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never touch non-GET, and never touch live state.
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Cross-origin (e.g. a tailnet host) API calls bypass the cache entirely.
  if (isApiRequest(url)) return;

  // Navigations: network first so a redeploy is picked up, cache as fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put('/', fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached = await caches.match('/', { ignoreSearch: true });
          if (cached) return cached;
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>DeckForge offline</title>' +
              '<body style="background:#0e0e17;color:#eee;font:16px system-ui;padding:32px">' +
              '<h1>Offline</h1><p>The studio shell is cached, but the Deck is unreachable. ' +
              'Reconnect to the LAN or tailnet and reload.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
          );
        }
      })(),
    );
    return;
  }

  // Same-origin static assets: cache first, refresh in the background.
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              caches
                .open(SHELL_CACHE)
                .then((cache) => cache.put(request, response.clone()))
                .catch(() => {});
            }
            return response;
          })
          .catch(() => null);
        if (cached) return cached;
        const fresh = await network;
        if (fresh) return fresh;
        return new Response('Offline', { status: 503 });
      })(),
    );
  }
});
