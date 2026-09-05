import { Cartesian3, ClockRange, Color, JulianDate, Terrain, Viewer } from 'cesium';
import { createImageryLayer, resolveImagerySource, type ImageryResolved, type ImagerySource } from './imagery';

export interface CreateViewerOptions {
  imagery: ImagerySource;
  /** Cesium Ion access token; enables the 'ion' imagery source and world terrain. */
  ionToken?: string;
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
  const imagery = await resolveImagerySource(options.imagery, options.ionToken);
  const baseLayer = await createImageryLayer(imagery, options.ionToken);

  const viewer = new Viewer(container, {
    baseLayer,
    terrain: imagery === 'ion' ? Terrain.fromWorldTerrain() : undefined,
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
  setSimulationTime(viewer, options.initialTime ? JulianDate.fromDate(options.initialTime) : JulianDate.now());

  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(HOME_LON, HOME_LAT, HOME_HEIGHT_M),
  });

  return { viewer, imagery };
}

/** Fly back to the whole-planet view. */
export function flyHome(viewer: Viewer, duration = 1.5): void {
  viewer.trackedEntity = undefined;
  viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(HOME_LON, HOME_LAT, HOME_HEIGHT_M), duration });
}

/** Timeline window shown around the current time: one hour back, three hours ahead. */
const TIMELINE_BEFORE_S = 3600;
const TIMELINE_AFTER_S = 3 * 3600;

/** Move the simulation clock and re-centre the timeline widget on it. */
export function setSimulationTime(viewer: Viewer, time: JulianDate): void {
  const { clock } = viewer;
  clock.currentTime = JulianDate.clone(time, clock.currentTime);
  const start = JulianDate.addSeconds(time, -TIMELINE_BEFORE_S, new JulianDate());
  const stop = JulianDate.addSeconds(time, TIMELINE_AFTER_S, new JulianDate());
  clock.startTime = start;
  clock.stopTime = stop;
  viewer.timeline?.zoomTo(start, stop);
}

/** Reset the simulation clock to wall-clock time at 1x. */
export function jumpToNow(viewer: Viewer): void {
  setSimulationTime(viewer, JulianDate.now());
  viewer.clock.multiplier = 1;
  viewer.clock.shouldAnimate = true;
}
