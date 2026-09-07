import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './fonts';
import './i18n';
import './tokens.css';
import './primitives/primitives.css';
import './shell.css';
import { TopBarV2 } from './TopBarV2';
import { RailV2, type WorkspaceId } from './RailV2';
import { InspectorV2 } from './InspectorV2';
import { DockV2 } from './DockV2';
import { GlobeExploreV2 } from './GlobeExploreV2';
import { CommandPaletteV2 } from './CommandPaletteV2';

/**
 * Shell V2 root — the hybrid layout from the Design Gate (docs/design/gate-01/DECISION.md):
 * Variant A's persistent Top Bar + Rail + Inspector + Dock, with Variant B's command-palette
 * top-bar search and rail-label discoverability. Mounted only behind `?shell=v2` (see
 * src/main.tsx); Shell V1 is completely unaffected.
 *
 * The Explore workspace renders the real Cesium globe (`GlobeExploreV2`), sharing the same
 * viewer-lifecycle hook as Shell V1's `GlobeView` (`useGlobeViewer`) without any of V1's own
 * chrome (Timeline, HoverTooltip) — those are separate, not-yet-scheduled task-list items.
 *
 * `dir`/`lang` follow `i18n.language` directly (English/LTR by default — see `i18n.ts`), so
 * switching language via `TopBarV2`'s toggle flips the whole shell's reading direction, and CSS
 * Grid mirrors `.sl-shell`'s columns for free under `dir="rtl"` (no separate RTL layout to
 * maintain — see shell.css).
 */
export function AppV2() {
  const [workspace, setWorkspace] = useState<WorkspaceId>('explore');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { t, i18n } = useTranslation();
  const dir = i18n.dir();

  // ⌘K/Ctrl+K opens the command palette from anywhere in the shell; the top bar's search button
  // is the other trigger (see TopBarV2's onOpenPalette).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const PLACEHOLDER_COPY: Record<Exclude<WorkspaceId, 'explore'>, string> = {
    plan: t('placeholder.plan'),
    train: t('placeholder.train'),
  };

  return (
    <div className="sl-v2 sl-shell" dir={dir} lang={i18n.language}>
      <TopBarV2 onOpenPalette={() => setPaletteOpen(true)} />
      <RailV2 workspace={workspace} onChange={setWorkspace} />
      <main className="sl-shell__main">
        {workspace === 'explore' ? (
          <GlobeExploreV2 />
        ) : (
          <div className="sl-shell__placeholder">{PLACEHOLDER_COPY[workspace]}</div>
        )}
      </main>
      <InspectorV2 />
      <DockV2 workspace={workspace} />
      <CommandPaletteV2 open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
