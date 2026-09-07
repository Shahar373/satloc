import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './fonts';
import './i18n';
import './tokens.css';
import './primitives/primitives.css';
import './shell.css';
import { isTauri } from '../../platform/env';
import { startAutoRefresh } from '../../state/catalog';
import { useSelection } from '../../state/selection';
import { useUpdates } from '../../state/updates';
import { TopBarV2 } from './TopBarV2';
import { RailV2, type WorkspaceId } from './RailV2';
import { InspectorV2 } from './InspectorV2';
import { DockV2 } from './DockV2';
import { GlobeExploreV2 } from './GlobeExploreV2';
import { PlanV2 } from './PlanV2';
import { TrainV2 } from './TrainV2';
import { DebriefV2 } from './DebriefV2';
import { CommandPaletteV2 } from './CommandPaletteV2';

const UPDATE_CHECK_DELAY_MS = 8_000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Shell V2 root — the hybrid layout from the Design Gate (docs/design/gate-01/DECISION.md):
 * Variant A's persistent Top Bar + Rail + Inspector + Dock, with Variant B's command-palette
 * top-bar search and rail-label discoverability.
 *
 * The Explore workspace renders the real Cesium globe (`GlobeExploreV2`), sharing the same
 * viewer-lifecycle hook Shell V1's `GlobeView` used (`useGlobeViewer`) — Shell V1 itself has
 * been removed; its own chrome (Timeline, HoverTooltip) went with it.
 *
 * `dir`/`lang` follow `i18n.language` directly (English/LTR by default — see `i18n.ts`), so
 * switching language via `TopBarV2`'s toggle flips the whole shell's reading direction, and CSS
 * Grid mirrors `.sl-shell`'s columns for free under `dir="rtl"` (no separate RTL layout to
 * maintain — see shell.css).
 */
export function AppV2() {
  const [workspace, setWorkspace] = useState<WorkspaceId>('explore');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const { i18n } = useTranslation();
  const dir = i18n.dir();
  const selectedId = useSelection((s) => s.selectedId);

  // Keeps the ISI element sets from going stale over a long session (was Shell V1's App.tsx
  // effect, ported here — this is app-level background behavior, not shell-specific UI).
  useEffect(() => startAutoRefresh(), []);

  // Checks for a newer signed build shortly after startup and then periodically; UpdateBannerV2
  // in TopBarV2 surfaces the result. Also ported from Shell V1's App.tsx — `useUpdates.check()`
  // itself is a no-op outside Tauri, but the guard avoids scheduling pointless timers in a browser.
  useEffect(() => {
    if (!isTauri()) return;
    const timer = setTimeout(() => void useUpdates.getState().check(), UPDATE_CHECK_DELAY_MS);
    const interval = setInterval(() => void useUpdates.getState().check(), UPDATE_CHECK_INTERVAL_MS);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  // Opens the palette and closes any open drawer first — the palette overlay's z-index sits
  // below the drawer/backdrop stack (see shell.css), so leaving a drawer open would render the
  // palette invisibly behind it. The top bar itself stays reachable while a drawer is open (its
  // backdrop starts below the top bar — see .sl-drawer-backdrop), so this can genuinely happen
  // via a real click, not just the keyboard shortcut below.
  const openPalette = useCallback(() => {
    setRailOpen(false);
    setInspectorOpen(false);
    setPaletteOpen(true);
  }, []);

  // ⌘K/Ctrl+K opens the command palette from anywhere in the shell; the top bar's search button
  // is the other trigger (see TopBarV2's onOpenPalette).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openPalette();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openPalette]);

  // Escape closes whichever drawer is open. Above the 1200px breakpoint this is inert (the
  // drawers render persistently there, ignoring railOpen/inspectorOpen — see shell.css).
  useEffect(() => {
    if (!railOpen && !inspectorOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRailOpen(false);
        setInspectorOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [railOpen, inspectorOpen]);

  // The Inspector is "on-demand" below the breakpoint (Design Gate decision): selecting a
  // satellite is the demand signal, so open it automatically rather than requiring an extra
  // manual toggle. Above the breakpoint this has no visible effect (the Inspector is already
  // persistently visible there).
  useEffect(() => {
    if (selectedId != null) setInspectorOpen(true);
  }, [selectedId]);

  const drawerOpen = railOpen || inspectorOpen;

  return (
    <div className="sl-v2 sl-shell" dir={dir} lang={i18n.language}>
      <TopBarV2 onOpenPalette={openPalette} onOpenRailDrawer={() => setRailOpen(true)} />
      <RailV2
        workspace={workspace}
        onChange={setWorkspace}
        drawerOpen={railOpen}
        onCloseDrawer={() => setRailOpen(false)}
      />
      <main className="sl-shell__main">
        {workspace === 'explore' && <GlobeExploreV2 />}
        {workspace === 'train' && <TrainV2 />}
        {workspace === 'plan' && <PlanV2 />}
        {workspace === 'debrief' && <DebriefV2 />}
      </main>
      <InspectorV2 drawerOpen={inspectorOpen} onCloseDrawer={() => setInspectorOpen(false)} />
      <DockV2 workspace={workspace} />
      <CommandPaletteV2 open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {drawerOpen && (
        <div
          className="sl-drawer-backdrop"
          role="presentation"
          onClick={() => {
            setRailOpen(false);
            setInspectorOpen(false);
          }}
        />
      )}
    </div>
  );
}
