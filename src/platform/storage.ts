/**
 * Minimal key/value persistence used for settings.
 * Browser: localStorage. The Tauri store plugin will replace this in a later milestone
 * behind the same interface, so callers never touch the backend directly.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memory = new Map<string, string>();

const memoryStorage: KeyValueStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => void memory.set(key, value),
  removeItem: (key) => void memory.delete(key),
};

export function getStorage(): KeyValueStorage {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = '__satloc_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    }
  } catch {
    // Storage blocked (private mode, sandboxed webview): fall through.
  }
  return memoryStorage;
}
