import { create } from 'zustand';
import { IMAGERY_SOURCES, type ImagerySource } from '../viewer/imagery';
import { useSettings } from './settings';

/**
 * Non-persisted overrides supplied through the URL, e.g. `?imagery=offline`.
 * Used by the smoke tests and for debugging; they never touch saved settings.
 */
interface OverridesState {
  imagery?: ImagerySource;
  /** Initial simulation time (ISO 8601), e.g. `?time=2026-09-04T12:00:00Z`. */
  time?: Date;
}

export const useOverrides = create<OverridesState>()(() => ({}));

export function applyUrlOverrides(params: URLSearchParams): void {
  const imagery = params.get('imagery');
  if (imagery && (IMAGERY_SOURCES as readonly string[]).includes(imagery)) {
    useOverrides.setState({ imagery: imagery as ImagerySource });
  }
  const time = params.get('time');
  if (time) {
    const parsed = new Date(time);
    if (!Number.isNaN(parsed.getTime())) useOverrides.setState({ time: parsed });
  }
}

/** Effective imagery source: URL override first, then the saved setting. */
export function useImagerySource(): ImagerySource {
  const override = useOverrides((s) => s.imagery);
  const setting = useSettings((s) => s.imagery);
  return override ?? setting;
}
