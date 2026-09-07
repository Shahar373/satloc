import { useRef } from 'react';
import { useViewerStore } from '../state/viewer';
import { useGlobeViewer } from './useGlobeViewer';

export interface GlobeCanvasProps {
  /** Defaults to 'globe', the class V1's stylesheet targets for sizing/background. */
  className?: string;
}

/**
 * The Cesium canvas alone — creation/teardown lifecycle only, no overlay chrome (no Timeline, no
 * HoverTooltip, no hint/error UI). `GlobeView` (Shell V1) renders those itself around its own
 * copy of this container; this component is for a shell that wants the globe without V1's chrome,
 * e.g. Shell V2's Explore workspace (`GlobeExploreV2`), which supplies its own status UI.
 */
export function GlobeCanvas({ className }: GlobeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useGlobeViewer(containerRef);
  const ready = useViewerStore((s) => s.ready);

  return (
    <div
      ref={containerRef}
      className={className ?? 'globe'}
      data-testid="globe"
      data-ready={ready ? 'true' : 'false'}
    />
  );
}
