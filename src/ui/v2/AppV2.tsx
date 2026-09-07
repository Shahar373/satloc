import { useState } from 'react';
import './fonts';
import './tokens.css';
import './primitives/primitives.css';
import './shell.css';
import { TopBarV2 } from './TopBarV2';
import { RailV2, type WorkspaceId } from './RailV2';
import { InspectorV2 } from './InspectorV2';
import { DockV2 } from './DockV2';
import { GlobeExploreV2 } from './GlobeExploreV2';

const PLACEHOLDER_COPY: Record<Exclude<WorkspaceId, 'explore'>, string> = {
  plan: 'Plan workspace lands with the operator-simulation vertical slice (Scenario 01).',
  train: 'Train console lands with the operator-simulation vertical slice (Scenario 01).',
};

/**
 * Shell V2 root — the hybrid layout from the Design Gate (docs/design/gate-01/DECISION.md):
 * Variant A's persistent Top Bar + Rail + Inspector + Dock, with Variant B's command-palette
 * top-bar search and rail-label discoverability. Mounted only behind `?shell=v2` (see
 * src/main.tsx); Shell V1 is completely unaffected.
 *
 * The Explore workspace renders the real Cesium globe (`GlobeExploreV2`), sharing the same
 * viewer-lifecycle hook as Shell V1's `GlobeView` (`useGlobeViewer`) without any of V1's own
 * chrome (Timeline, HoverTooltip) — those are separate, not-yet-scheduled task-list items.
 */
export function AppV2() {
  const [workspace, setWorkspace] = useState<WorkspaceId>('explore');

  return (
    <div className="sl-v2 sl-shell" dir="ltr" lang="en">
      <TopBarV2 />
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
    </div>
  );
}
