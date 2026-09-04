import { isTauri } from './env';

export interface FetchTextOptions {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * GET a URL and return its body as text.
 * Inside Tauri the request goes through the Rust HTTP plugin, so browser CORS rules do not apply.
 * In a plain browser it uses `fetch` (the Vite dev server proxies CelesTrak, see vite.config.ts).
 */
export async function fetchText(url: string, options: FetchTextOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const doFetch = isTauri() ? (await import('@tauri-apps/plugin-http')).fetch : fetch;
    const response = await doFetch(url, { method: 'GET', signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}
