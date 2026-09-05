import { useEffect, useMemo, useRef } from 'react';
import type { TleRecord } from '../core/catalog/tleapi';
import type { ElementSet, OmmRecord } from '../core/tle/omm';
import { favoriteToSet, useCatalog } from '../state/catalog';
import { useHover } from '../state/hover';
import { usePicking } from '../state/picking';
import { useSelection } from '../state/selection';
import { useTargets } from '../state/targets';
import { useSettings } from '../state/settings';
import { useViewerStore } from '../state/viewer';
import { CatalogLayer } from './catalogLayer';
import { SatelliteLayer } from './satellites';

/**
 * Keeps the satellite layers alive for the current viewer and mirrors store state into them.
 * Tier 1 (entities with labels, orbit, footprint): ISI satellites, favourites, and whatever is
 * selected. Tier 2 (points from the worker): every displayed catalogue group, minus tier 1.
 */
export function SatelliteLayerBridge() {
  const viewer = useViewerStore((s) => s.viewer);
  const isiSets = useCatalog((s) => s.sets);
  const groups = useCatalog((s) => s.groups);
  const favorites = useSettings((s) => s.favorites);
  const displayedGroups = useSettings((s) => s.displayedGroups);
  const maxCatalogPoints = useSettings((s) => s.maxCatalogPoints);
  const selectedId = useSelection((s) => s.selectedId);
  const showOrbit = useSelection((s) => s.showOrbit);
  const showGroundTrack = useSelection((s) => s.showGroundTrack);
  const showFootprint = useSelection((s) => s.showFootprint);
  const showSwath = useSelection((s) => s.showSwath);
  const showReach = useSelection((s) => s.showReach);
  const cameraMode = useSelection((s) => s.cameraMode);
  const targets = useTargets((s) => s.targets);
  const selectedTargetId = useTargets((s) => s.selectedTargetId);
  const maxOffNadirDeg = useTargets((s) => s.maxOffNadirDeg);
  const target = useMemo(() => {
    const t = targets.find((x) => x.id === selectedTargetId);
    return t ? { latitudeDeg: t.latitudeDeg, longitudeDeg: t.longitudeDeg } : null;
  }, [targets, selectedTargetId]);
  const layerRef = useRef<SatelliteLayer | null>(null);
  const catalogRef = useRef<CatalogLayer | null>(null);

  const tier1 = useMemo<ElementSet[]>(() => {
    const out: ElementSet[] = [...isiSets];
    const seen = new Set(out.map((s) => s.noradId));
    for (const f of favorites) {
      if (seen.has(f.noradId)) continue;
      const set = favoriteToSet(f);
      if (set) {
        out.push(set);
        seen.add(set.noradId);
      }
    }
    if (selectedId !== null && !seen.has(selectedId)) {
      const set = useCatalog.getState().findSet(selectedId);
      if (set) out.push(set);
    }
    return out;
  }, [isiSets, favorites, selectedId, groups]);

  const tier2 = useMemo(() => {
    const records: OmmRecord[] = [];
    const tles: TleRecord[] = [];
    const seen = new Set<number>();
    for (const groupId of displayedGroups) {
      const group = groups[groupId];
      if (!group || group.status !== 'ready') continue;
      for (const r of group.records) {
        if (!seen.has(r.NORAD_CAT_ID)) {
          seen.add(r.NORAD_CAT_ID);
          records.push(r);
        }
      }
    }
    return { records, tles };
  }, [groups, displayedGroups]);

  useEffect(() => {
    if (!viewer) return;
    const suspended = () => usePicking.getState().mode !== null;
    const select = (id: number) => useSelection.getState().select(id);
    const layer = new SatelliteLayer(viewer, select, suspended);
    const catalog = new CatalogLayer(viewer, select, (info) => useHover.getState().setHover(info), suspended);
    layerRef.current = layer;
    catalogRef.current = catalog;
    return () => {
      layerRef.current = null;
      catalogRef.current = null;
      layer.destroy();
      catalog.destroy();
      useHover.getState().setHover(null);
    };
  }, [viewer]);

  useEffect(() => {
    layerRef.current?.setSatellites(tier1);
  }, [viewer, tier1]);

  useEffect(() => {
    void catalogRef.current?.setRecords(tier2.records, tier2.tles, maxCatalogPoints);
  }, [viewer, tier2, maxCatalogPoints]);

  useEffect(() => {
    catalogRef.current?.setExcluded(new Set(tier1.map((s) => s.noradId)));
  }, [viewer, tier1]);

  useEffect(() => {
    layerRef.current?.setSelection({
      selectedId,
      showOrbit,
      showGroundTrack,
      showFootprint,
      showSwath,
      showReach,
      cameraMode,
      target,
      maxOffNadirDeg,
    });
  }, [viewer, tier1, selectedId, showOrbit, showGroundTrack, showFootprint, showSwath, showReach, cameraMode, target, maxOffNadirDeg]);

  return null;
}
