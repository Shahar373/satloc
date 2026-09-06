import { useCallback, useEffect, useRef } from 'react';
import { Cartesian2, Cartesian3, Color, ConstantPositionProperty, ConstantProperty, Entity, LabelStyle, VerticalOrigin, type Viewer } from 'cesium';
import { usePicking } from '../state/picking';
import { nextTargetName, useTargets, type ImagingTarget } from '../state/targets';
import { useViewerStore } from '../state/viewer';
import { useGlobePick } from './useGlobePick';

const TARGET_COLOR = Color.fromCssColorString('#7CFC9A');
const SELECTED_COLOR = Color.fromCssColorString('#ffcf5a');

function addPin(viewer: Viewer, t: ImagingTarget, selected: boolean): Entity {
  return viewer.entities.add({
    id: `satloc-target-${t.id}`,
    position: Cartesian3.fromDegrees(t.longitudeDeg, t.latitudeDeg, 0),
    point: {
      pixelSize: selected ? 10 : 7,
      color: selected ? SELECTED_COLOR : TARGET_COLOR,
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
  });
}

/** Pins for imaging targets and the "pick target on globe" mode. Pins are diffed by id, not rebuilt. */
export function TargetLayer() {
  const viewer = useViewerStore((s) => s.viewer);
  const targets = useTargets((s) => s.targets);
  const selectedTargetId = useTargets((s) => s.selectedTargetId);
  const picking = usePicking((s) => s.mode) === 'target';
  const pins = useRef(new Map<string, { entity: Entity; target: ImagingTarget; selected: boolean }>());

  useEffect(() => {
    if (!viewer) return;
    const map = pins.current;
    const wanted = new Set(targets.map((t) => t.id));
    for (const [id, pin] of map) {
      if (wanted.has(id)) continue;
      viewer.entities.remove(pin.entity);
      map.delete(id);
    }
    for (const t of targets) {
      const selected = t.id === selectedTargetId;
      const pin = map.get(t.id);
      if (!pin) {
        map.set(t.id, { entity: addPin(viewer, t, selected), target: t, selected });
        continue;
      }
      if (pin.target.latitudeDeg !== t.latitudeDeg || pin.target.longitudeDeg !== t.longitudeDeg) {
        pin.entity.position = new ConstantPositionProperty(Cartesian3.fromDegrees(t.longitudeDeg, t.latitudeDeg, 0));
      }
      if (pin.target.name !== t.name && pin.entity.label) pin.entity.label.text = new ConstantProperty(t.name);
      if (pin.selected !== selected && pin.entity.point) {
        pin.entity.point.pixelSize = new ConstantProperty(selected ? 10 : 7);
        pin.entity.point.color = new ConstantProperty(selected ? SELECTED_COLOR : TARGET_COLOR);
      }
      pin.target = t;
      pin.selected = selected;
    }
  }, [viewer, targets, selectedTargetId]);

  useEffect(() => {
    if (!viewer) return;
    const map = pins.current;
    return () => {
      if (!viewer.isDestroyed()) for (const pin of map.values()) viewer.entities.remove(pin.entity);
      map.clear();
    };
  }, [viewer]);

  const onPick = useCallback((lat: number, lon: number) => {
    const { targets: existing, addTarget } = useTargets.getState();
    addTarget({ name: nextTargetName(existing), latitudeDeg: lat, longitudeDeg: lon });
    usePicking.getState().setMode(null);
  }, []);
  useGlobePick(viewer, picking, onPick);

  return null;
}
