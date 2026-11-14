/**
 * Single source of truth for backend URLs.
 *
 * The UI runs in one of three places, and the scheme matters:
 *  1. Steam's CEF overlay (Decky), origin `https://steamloopback.host`. The page
 *     is HTTPS, and loopback is a trustworthy origin, so plain HTTP to
 *     127.0.0.1 is allowed.
 *  2. A standalone page served by FastAPI over plain HTTP (LAN, e.g.
 *     http://192.168.4.223:8765). Same host and port, so same origin.
 *  3. A standalone page served over HTTPS through a reverse proxy
 *     (e.g. `tailscale serve` at https://steamdeck.tail9760ad.ts.net). Here the
 *     API must be reached through the SAME origin — an absolute
 *     `http://<host>:8765` would be blocked as mixed content, and an absolute
 *     `https://<host>:8765` would hit a port the proxy is not listening on.
 *
 * So: HTTPS pages talk to their own origin; HTTP pages keep the explicit port.
 */

/**
 * Default API port. Overridden by the page's own port when the studio is served
 * by the API itself — otherwise running the server anywhere other than 8765
 * leaves the UI silently calling the wrong host.
 */
const DEFAULT_API_PORT = 8765;
const STEAM_CEF_HOST_SUFFIX = 'steamloopback.host';

function isSteamCefOrigin(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === STEAM_CEF_HOST_SUFFIX || normalized.endsWith(`.${STEAM_CEF_HOST_SUFFIX}`);
}

function currentLocation(): { protocol: string; hostname: string; port: string; origin: string } {
  if (typeof window === 'undefined') {
    return { protocol: 'http:', hostname: '127.0.0.1', port: String(DEFAULT_API_PORT), origin: 'http://127.0.0.1' };
  }
  const { protocol, hostname, port, origin } = window.location;
  return { protocol, hostname, port, origin };
}

/** Port the API is listening on. */
function apiPort(): number {
  const { port } = currentLocation();
  const parsed = Number(port);
  // A page served by the API knows the port from its own URL; the Steam CEF
  // overlay has no port of its own and must use the default.
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_API_PORT;
}

/**
 * True when the API lives on this page's own origin rather than on port 8765.
 * That is the case for any HTTPS page: the proxy terminates TLS and forwards to
 * the backend, so the port is invisible to us.
 */
function usesSameOrigin(): boolean {
  const { protocol } = currentLocation();
  return protocol === 'https:' && !isSteamCefOrigin(currentLocation().hostname);
}

function backendHost(): string {
  const { hostname } = currentLocation();
  if (isSteamCefOrigin(hostname)) return '127.0.0.1';
  return hostname || '127.0.0.1';
}

/** REST base, e.g. `http://127.0.0.1:8765` or `https://host` (same origin). */
export function apiBase(): string {
  if (usesSameOrigin()) return currentLocation().origin;
  return `http://${backendHost()}:${apiPort()}`;
}

/** WebSocket base, e.g. `ws://127.0.0.1:8765` or `wss://host`. */
export function wsBase(): string {
  if (usesSameOrigin()) {
    const { origin } = currentLocation();
    return origin.replace(/^http/, 'ws');
  }
  return `ws://${backendHost()}:${apiPort()}`;
}

/** Resolve an API path (with or without a leading slash) to a full URL. */
export function apiUrl(path: string): string {
  return `${apiBase()}/${path.replace(/^\/+/, '')}`;
}

/** Resolve a WebSocket path to a full URL. */
export function wsUrl(path: string): string {
  return `${wsBase()}/${path.replace(/^\/+/, '')}`;
}

/** `fetch` against the DeckForge API. */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}

/** Full WebSocket URL for the DeckForge API. */
export function apiWs(path: string): string {
  return wsUrl(path);
}
