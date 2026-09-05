import { useEffect } from 'react';
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  LabelStyle,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
} from 'cesium';
import { useObserver } from '../state/observer';
import { useViewerStore } from '../state/viewer';

const PIN_COLOR = Color.fromCssColorString('#ff5c7a');

/** Marker for the observer location, plus "pick on globe" handling. */
export function ObserverLayer() {
  const viewer = useViewerStore((s) => s.viewer);
  const name = useObserver((s) => s.name);
  const latitudeDeg = useObserver((s) => s.latitudeDeg);
  const longitudeDeg = useObserver((s) => s.longitudeDeg);
  const heightM = useObserver((s) => s.heightM);
  const picking = useObserver((s) => s.picking);

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

  useEffect(() => {
    if (!viewer || !picking) return;
    const canvas = viewer.scene.canvas;
    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = 'crosshair';
    const handler = new ScreenSpaceEventHandler(canvas);
    handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      const cartesian = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid);
      if (!cartesian) return;
      const carto = Cartographic.fromCartesian(cartesian);
      const lat = CesiumMath.toDegrees(carto.latitude);
      const lon = CesiumMath.toDegrees(carto.longitude);
      useObserver.getState().setLocation({
        name: `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`,
        latitudeDeg: lat,
        longitudeDeg: lon,
        heightM: 0,
      });
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => {
      handler.destroy();
      canvas.style.cursor = previousCursor;
    };
  }, [viewer, picking]);

  return null;
}
