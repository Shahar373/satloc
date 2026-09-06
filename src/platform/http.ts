import { isTauri } from './env';

export interface FetchTextOptions {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

let serverClockOffsetMs: number | null = null;

/**
 * Difference between the last server's clock (HTTP Date header, whole seconds) and this machine's,
 * in ms, or null before any successful response. A wrong PC clock shifts every satellite position.
 */
export function getServerClockOffsetMs(): number | null {
  return serverClockOffsetMs;
}
const USER_AGENT = 'Mozilla/5.0 (compatible; SatLoc; +https://github.com/Shahar373/satloc)';

/**
 * GET a URL and return its body as text.
 * Inside Tauri the request goes through the Rust HTTP plugin, so browser CORS rules do not apply.
 * In a plain browser it uses `fetch` (the Vite dev server proxies CelesTrak, see vite.config.ts).
 */
export async function fetchText(url: string, options: FetchTextOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const tauri = isTauri();
    const doFetch = tauri ? (await import('@tauri-apps/plugin-http')).fetch : fetch;
    const response = await doFetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: tauri ? { 'User-Agent': USER_AGENT, Accept: 'application/json, text/plain' } : undefined,
    });
    const dateHeader = response.headers.get('date');
    if (dateHeader) {
      const serverMs = Date.parse(dateHeader);
      if (Number.isFinite(serverMs)) serverClockOffsetMs = serverMs - Date.now();
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }
    return await response.text();
  } catch (err) {
    if (timedOut || (err instanceof Error && err.name === 'AbortError')) {
      throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)} s for ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
