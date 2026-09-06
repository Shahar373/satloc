import { useEffect } from 'react';
import { Cartesian2, Cartesian3, Cartographic, Math as CesiumMath, ScreenSpaceEventHandler, ScreenSpaceEventType, type Viewer } from 'cesium';

/** Point on the globe under a screen position: terrain surface when there is terrain, else the ellipsoid. */
export function pickGlobe(viewer: Viewer, position: Cartesian2): Cartesian3 | undefined {
  const { scene, camera } = viewer;
  const ray = camera.getPickRay(position);
  const onTerrain = ray ? scene.globe.pick(ray, scene) : undefined;
  return onTerrain ?? camera.pickEllipsoid(position, scene.globe.ellipsoid);
}

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
      const cartesian = pickGlobe(viewer, event.position);
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
