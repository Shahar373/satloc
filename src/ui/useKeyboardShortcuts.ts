import { useEffect } from 'react';
import { useSelection } from '../state/selection';
import { useUi } from '../state/ui';
import { useViewerStore } from '../state/viewer';
import { flyHome, jumpToNow } from '../viewer/createViewer';

const SPEEDS = [-1000, -300, -60, -10, -1, 1, 10, 60, 300, 1000];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Space: play/pause · [ / ]: slower/faster · N: now · H: home view · Esc: deselect / close.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const viewer = useViewerStore.getState().viewer;
      switch (event.key) {
        case ' ':
          if (viewer) viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate;
          break;
        case ']':
        case '[': {
          if (!viewer) return;
          const current = viewer.clock.multiplier;
          const idx = SPEEDS.findIndex((s) => s >= current);
          const at = idx === -1 ? SPEEDS.length - 1 : idx;
          const next = event.key === ']' ? Math.min(SPEEDS.length - 1, at + 1) : Math.max(0, at - 1);
          viewer.clock.multiplier = SPEEDS[next]!;
          break;
        }
        case 'n':
        case 'N':
          if (viewer) jumpToNow(viewer);
          break;
        case 'h':
        case 'H':
          if (viewer) {
            useSelection.getState().setCameraMode('free');
            flyHome(viewer);
          }
          break;
        case 'Escape':
          if (useUi.getState().settingsOpen) useUi.getState().setSettingsOpen(false);
          else if (useSelection.getState().cameraMode !== 'free') useSelection.getState().setCameraMode('free');
          else useSelection.getState().select(null);
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
