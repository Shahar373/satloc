import { useEffect, useRef } from 'react';
import { useCatalog } from '../state/catalog';
import { useSelection } from '../state/selection';
import { useViewerStore } from '../state/viewer';
import { SatelliteLayer } from './satellites';

/** Keeps a SatelliteLayer alive for the current viewer and mirrors store state into it. */
export function SatelliteLayerBridge() {
  const viewer = useViewerStore((s) => s.viewer);
  const sets = useCatalog((s) => s.sets);
  const selectedId = useSelection((s) => s.selectedId);
  const showOrbit = useSelection((s) => s.showOrbit);
  const showGroundTrack = useSelection((s) => s.showGroundTrack);
  const tracking = useSelection((s) => s.tracking);
  const layerRef = useRef<SatelliteLayer | null>(null);

  useEffect(() => {
    if (!viewer) return;
    const layer = new SatelliteLayer(viewer, (id) => useSelection.getState().select(id));
    layerRef.current = layer;
    return () => {
      layerRef.current = null;
      layer.destroy();
    };
  }, [viewer]);

  useEffect(() => {
    layerRef.current?.setSatellites(sets);
  }, [viewer, sets]);

  useEffect(() => {
    layerRef.current?.setSelection({ selectedId, showOrbit, showGroundTrack, tracking });
  }, [viewer, sets, selectedId, showOrbit, showGroundTrack, tracking]);

  return null;
}
