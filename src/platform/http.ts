import { isTauri } from './env';

export interface FetchTextOptions {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;
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
