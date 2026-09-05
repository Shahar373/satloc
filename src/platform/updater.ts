import { isTauri } from './env';

export interface AvailableUpdate {
  version: string;
  currentVersion: string;
  notes: string | null;
  date: string | null;
  /** Download and install; `onProgress` gets 0..1 (or null when the size is unknown). Relaunches when done. */
  install(onProgress?: (fraction: number | null) => void): Promise<void>;
}

/**
 * Ask GitHub Releases (via the Tauri updater plugin) whether a newer signed build exists.
 * Resolves to null when up to date or when not running inside Tauri; rejects on network or
 * signature problems.
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!isTauri()) return null;
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check({ timeout: 20_000 });
  if (!update) return null;
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body ?? null,
    date: update.date ?? null,
    async install(onProgress) {
      let total: number | null = null;
      let received = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? null;
          onProgress?.(total ? 0 : null);
        } else if (event.event === 'Progress') {
          received += event.data.chunkLength;
          onProgress?.(total ? Math.min(1, received / total) : null);
        } else if (event.event === 'Finished') {
          onProgress?.(1);
        }
      });
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    },
  };
}
