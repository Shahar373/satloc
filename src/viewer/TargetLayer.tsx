import { useCallback, useEffect } from 'react';
import { Cartesian2, Cartesian3, Color, Entity, LabelStyle, VerticalOrigin } from 'cesium';
import { usePicking } from '../state/picking';
import { useTargets } from '../state/targets';
import { useViewerStore } from '../state/viewer';
import { useGlobePick } from './useGlobePick';

const TARGET_COLOR = Color.fromCssColorString('#7CFC9A');
const SELECTED_COLOR = Color.fromCssColorString('#ffcf5a');

/** Pins for imaging targets and the "pick target on globe" mode. */
export function TargetLayer() {
  const viewer = useViewerStore((s) => s.viewer);
  const targets = useTargets((s) => s.targets);
  const selectedTargetId = useTargets((s) => s.selectedTargetId);
  const picking = usePicking((s) => s.mode) === 'target';

  useEffect(() => {
    if (!viewer) return;
    const entities: Entity[] = targets.map((t) =>
      viewer.entities.add({
        id: `satloc-target-${t.id}`,
        position: Cartesian3.fromDegrees(t.longitudeDeg, t.latitudeDeg, 0),
        point: {
          pixelSize: t.id === selectedTargetId ? 10 : 7,
          color: t.id === selectedTargetId ? SELECTED_COLOR : TARGET_COLOR,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
        },
        label: {
          text: t.name,
          font: '12px system-ui, sans-serif',
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.TOP,
          pixelOffset: new Cartesian2(0, 8),
        },
      }),
    );
    return () => {
      if (viewer.isDestroyed()) return;
      for (const e of entities) viewer.entities.remove(e);
    };
  }, [viewer, targets, selectedTargetId]);

  const onPick = useCallback((lat: number, lon: number) => {
    const { targets: existing, addTarget } = useTargets.getState();
    addTarget({ name: `Target ${existing.length + 1}`, latitudeDeg: lat, longitudeDeg: lon });
    usePicking.getState().setMode(null);
  }, []);
  useGlobePick(viewer, picking, onPick);

  return null;
}
