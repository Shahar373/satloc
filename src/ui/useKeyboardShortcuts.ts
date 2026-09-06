import { useEffect } from 'react';
import { usePicking } from '../state/picking';
import { useSelection } from '../state/selection';
import { useUi } from '../state/ui';
import { useViewerStore } from '../state/viewer';
import { flyHome, jumpToNow } from '../viewer/createViewer';

const SPEEDS = [-1000, -300, -60, -10, -1, 1, 10, 60, 300, 1000];

/** Shortcuts as shown in Settings; keep in sync with the handler below. */
export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Space', action: 'play / pause' },
  { keys: '[ and ]', action: 'slower / faster' },
  { keys: 'N', action: 'jump to now' },
  { keys: 'H', action: 'whole-planet view' },
  { keys: 'Esc', action: 'leave a field, cancel picking, release the camera, deselect' },
];

function isTyping(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Buttons and links activate on Space themselves; the play/pause shortcut must not steal it. */
function activatesOnSpace(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || el.getAttribute('role') === 'button';
}

/**
 * Keys are matched on `event.code` (physical key), so N and H work under a Hebrew or any other
 * layout. Escape unwinds one level at a time: field → settings → picking → camera lock → selection.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const viewer = useViewerStore.getState().viewer;

      if (event.key === 'Escape') {
        if (isTyping(target)) {
          target?.blur();
          // A field inside the settings dialog: leaving it and closing the dialog is what Esc means there.
          if (!target?.closest('.settings')) return;
        }
        const ui = useUi.getState();
        const picking = usePicking.getState();
        const selection = useSelection.getState();
        if (ui.settingsOpen) ui.setSettingsOpen(false);
        else if (picking.mode !== null) picking.setMode(null);
        else if (selection.cameraMode !== 'free') selection.setCameraMode('free');
        else selection.select(null);
        event.preventDefault();
        return;
      }

      if (isTyping(target)) return;
      switch (event.code) {
        case 'Space':
          if (activatesOnSpace(target)) return;
          if (viewer) viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate;
          break;
        case 'BracketRight':
        case 'BracketLeft': {
          if (!viewer) return;
          const current = viewer.clock.multiplier;
          const idx = SPEEDS.findIndex((s) => s >= current);
          const at = idx === -1 ? SPEEDS.length - 1 : idx;
          const next = event.code === 'BracketRight' ? Math.min(SPEEDS.length - 1, at + 1) : Math.max(0, at - 1);
          viewer.clock.multiplier = SPEEDS[next]!;
          break;
        }
        case 'KeyN':
          if (viewer) jumpToNow(viewer);
          break;
        case 'KeyH':
          if (viewer) {
            useSelection.getState().setCameraMode('free');
            flyHome(viewer);
          }
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
