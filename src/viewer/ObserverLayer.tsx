import { useCallback, useEffect } from 'react';
import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  LabelStyle,
  VerticalOrigin,
} from 'cesium';
import { useObserver } from '../state/observer';
import { usePicking } from '../state/picking';
import { useViewerStore } from '../state/viewer';
import { useGlobePick } from './useGlobePick';

const PIN_COLOR = Color.fromCssColorString('#ff5c7a');

/** Marker for the observer location, plus "pick on globe" handling. */
export function ObserverLayer() {
  const viewer = useViewerStore((s) => s.viewer);
  const name = useObserver((s) => s.name);
  const latitudeDeg = useObserver((s) => s.latitudeDeg);
  const longitudeDeg = useObserver((s) => s.longitudeDeg);
  const heightM = useObserver((s) => s.heightM);
  const picking = usePicking((s) => s.mode) === 'observer';

  useEffect(() => {
    if (!viewer) return;
    const entity = viewer.entities.add({
      id: 'satloc-observer',
      position: Cartesian3.fromDegrees(longitudeDeg, latitudeDeg, heightM),
      point: { pixelSize: 8, color: PIN_COLOR, outlineColor: Color.BLACK, outlineWidth: 1 },
      label: {
        text: name,
        font: '12px system-ui, sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.TOP,
        pixelOffset: new Cartesian2(0, 8),
      },
    });
    return () => {
      if (!viewer.isDestroyed()) viewer.entities.remove(entity);
    };
  }, [viewer]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const entity = viewer.entities.getById('satloc-observer');
    if (!entity) return;
    entity.position = new ConstantPositionProperty(Cartesian3.fromDegrees(longitudeDeg, latitudeDeg, heightM));
    if (entity.label) entity.label.text = new ConstantProperty(name);
  }, [viewer, name, latitudeDeg, longitudeDeg, heightM]);

  const onPick = useCallback((lat: number, lon: number) => {
    // The panel prints the coordinates on its own line; the name stays a short label.
    useObserver.getState().setLocation({ name: 'Picked location', latitudeDeg: lat, longitudeDeg: lon, heightM: 0 });
    usePicking.getState().setMode(null);
  }, []);
  useGlobePick(viewer, picking, onPick);

  return null;
}
