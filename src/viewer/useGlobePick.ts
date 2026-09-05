import { useEffect } from 'react';
import { Cartographic, Math as CesiumMath, ScreenSpaceEventHandler, ScreenSpaceEventType, type Viewer } from 'cesium';

/** While `active`, the next click on the globe reports its geodetic position (degrees). */
export function useGlobePick(
  viewer: Viewer | null,
  active: boolean,
  onPick: (latitudeDeg: number, longitudeDeg: number) => void,
): void {
  useEffect(() => {
    if (!viewer || !active) return;
    const canvas = viewer.scene.canvas;
    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = 'crosshair';
    const handler = new ScreenSpaceEventHandler(canvas);
    handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      const cartesian = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid);
      if (!cartesian) return;
      const carto = Cartographic.fromCartesian(cartesian);
      onPick(CesiumMath.toDegrees(carto.latitude), CesiumMath.toDegrees(carto.longitude));
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => {
      handler.destroy();
      canvas.style.cursor = previousCursor;
    };
  }, [viewer, active, onPick]);
}
