import { create } from 'zustand';
import { checkForUpdate, type AvailableUpdate } from '../platform/updater';

export type UpdateStatus = 'idle' | 'checking' | 'upToDate' | 'available' | 'installing' | 'error';

interface UpdatesState {
  status: UpdateStatus;
  update: AvailableUpdate | null;
  /** Download progress 0..1 while installing; null when unknown. */
  progress: number | null;
  error: string | null;
  checkedAt: Date | null;
  /** Hide the top-bar banner for this session. */
  dismissed: boolean;
  check(): Promise<void>;
  install(): Promise<void>;
  dismiss(): void;
}

export const useUpdates = create<UpdatesState>()((set, get) => ({
  status: 'idle',
  update: null,
  progress: null,
  error: null,
  checkedAt: null,
  dismissed: false,

  async check() {
    if (get().status === 'checking' || get().status === 'installing') return;
    set({ status: 'checking', error: null });
    try {
      const update = await checkForUpdate();
      set({ status: update ? 'available' : 'upToDate', update, checkedAt: new Date(), dismissed: false });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err), checkedAt: new Date() });
    }
  },

  async install() {
    const update = get().update;
    if (!update || get().status === 'installing') return;
    set({ status: 'installing', progress: null, error: null });
    try {
      await update.install((progress) => set({ progress }));
      // The app relaunches; nothing to do if we get here.
    } catch (err) {
      set({ status: 'available', progress: null, error: err instanceof Error ? err.message : String(err) });
    }
  },

  dismiss() {
    set({ dismissed: true });
  },
}));
