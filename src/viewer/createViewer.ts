import { Cartesian3, ClockRange, Color, JulianDate, Viewer } from 'cesium';
import { createImageryLayer, resolveImagerySource, type ImageryResolved, type ImagerySource } from './imagery';

export interface CreateViewerOptions {
  imagery: ImagerySource;
  /** Simulation time to start at; defaults to now. */
  initialTime?: Date;
}

export interface CreatedViewer {
  viewer: Viewer;
  imagery: ImageryResolved;
}

/** Initial camera: the whole planet with Israel near the centre of the disc. */
const HOME_LON = 35.0;
const HOME_LAT = 31.5;
const HOME_HEIGHT_M = 22_000_000;

export async function createViewer(
  container: HTMLElement,
  options: CreateViewerOptions,
): Promise<CreatedViewer> {
  const imagery = await resolveImagerySource(options.imagery);
  const baseLayer = await createImageryLayer(imagery);

  const viewer = new Viewer(container, {
    baseLayer,
    // Built-in time controls for now (see docs/DESIGN.md §4.1); everything else is our own UI.
    animation: true,
    timeline: true,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    vrButton: false,
    shouldAnimate: true,
  });

  const { scene, clock } = viewer;
  const { globe } = scene;
  globe.enableLighting = true; // day/night terminator follows the simulation clock
  globe.showGroundAtmosphere = true;
  // Cesium blends day/night shading in only when the camera is far from the surface
  // (by default it is fully "lit" below ~10,000 km so maps stay readable at night).
  // Distances of 0 and 1 metre make the blend factor 1 at any altitude: the terminator
  // is always drawn, which is what a view from space should show.
  globe.lightingFadeOutDistance = 0;
  globe.lightingFadeInDistance = 1;
  scene.globe.baseColor = Color.BLACK;
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
  if (scene.sun) scene.sun.show = true;
  if (scene.moon) scene.moon.show = true;

  clock.clockRange = ClockRange.UNBOUNDED;
  clock.multiplier = 1;
  clock.currentTime = options.initialTime
    ? JulianDate.fromDate(options.initialTime)
    : JulianDate.now();

  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(HOME_LON, HOME_LAT, HOME_HEIGHT_M),
  });

  return { viewer, imagery };
}

/** Reset the simulation clock to wall-clock time at 1x. */
export function jumpToNow(viewer: Viewer): void {
  viewer.clock.currentTime = JulianDate.now();
  viewer.clock.multiplier = 1;
  viewer.clock.shouldAnimate = true;
}
