import { useRef } from 'react';
import { useViewerStore } from '../state/viewer';
import { ObserverLayer } from './ObserverLayer';
import { SatelliteLayerBridge } from './SatelliteLayerBridge';
import { TargetLayer } from './TargetLayer';
import { useGlobeViewer } from './useGlobeViewer';

export interface GlobeCanvasProps {
  /** Defaults to 'globe', the stylesheet class used for sizing/background. */
  className?: string;
}

/**
 * The real globe: Cesium canvas lifecycle plus the three layers that actually draw satellites,
 * the observer marker, and imaging targets onto it (`SatelliteLayerBridge`/`ObserverLayer`/
 * `TargetLayer` — all pure Cesium-entity managers that render no DOM of their own, driven by the
 * same `useViewerStore`/`useCatalog`/`useSelection`/etc. stores regardless of which shell mounts
 * this). No overlay chrome (no hint/error UI, no Timeline/HoverTooltip) — that's the caller's job,
 * e.g. Shell V2's Explore workspace (`GlobeExploreV2`), which supplies its own status UI.
 */
export function GlobeCanvas({ className }: GlobeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useGlobeViewer(containerRef);
  const ready = useViewerStore((s) => s.ready);

  return (
    <>
      <div
        ref={containerRef}
        className={className ?? 'globe'}
        data-testid="globe"
        data-ready={ready ? 'true' : 'false'}
      />
      <SatelliteLayerBridge />
      <ObserverLayer />
      <TargetLayer />
    </>
  );
}
