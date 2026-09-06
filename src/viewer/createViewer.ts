import {
  Cartesian3,
  ClockRange,
  Color,
  JulianDate,
  ScreenSpaceEventType,
  Terrain,
  Viewer,
  type ImageryLayer,
  type ImageryProvider,
} from 'cesium';
import {
  ESRI_PROBE_TILE,
  createEsriLayer,
  createImageryLayer,
  probeImage,
  resolveImagerySource,
  type ImageryResolved,
  type ImagerySource,
} from './imagery';

/** Camera pose that can be captured from one viewer and restored on another. */
export interface CameraView {
  position: Cartesian3;
  direction: Cartesian3;
  up: Cartesian3;
}

/** A problem with the globe's data sources, shown as a warning (the app keeps running). */
export interface ViewerProblem {
  /** Short label for a badge. */
  label: string;
  detail: string;
}

export interface CreateViewerOptions {
  imagery: ImagerySource;
  /** Cesium Ion access token; enables the 'ion' imagery source and world terrain. */
  ionToken?: string;
  /** Simulation time to start at; defaults to now. */
  initialTime?: Date;
  /** Clock and camera state carried over from a viewer that was just torn down. */
  restore?: { multiplier: number; animating: boolean; view: CameraView };
  /** Called at most once per distinct problem (imagery or terrain failing to load). */
  onProblem?: (problem: ViewerProblem) => void;
  /** 'auto' starts with offline tiles and reports here once the online probe has decided. */
  onImageryResolved?: (imagery: ImageryResolved) => void;
}

export interface CreatedViewer {
  viewer: Viewer;
  imagery: ImageryResolved;
  /** True when `imagery` is provisional (offline) while the online probe is still running. */
  imageryPending: boolean;
}

/** Initial camera: the whole planet with Israel near the centre of the disc. */
const HOME_LON = 35.0;
const HOME_LAT = 31.5;
const HOME_HEIGHT_M = 22_000_000;

/** This many tile failures within TILE_ERROR_WINDOW_MS means the imagery source is broken, not one flaky tile. */
const TILE_ERROR_THRESHOLD = 10;
const TILE_ERROR_WINDOW_MS = 30_000;

export async function createViewer(
  container: HTMLElement,
  options: CreateViewerOptions,
): Promise<CreatedViewer> {
  // 'auto' would wait up to 6 s for a network probe before anything is drawn. Start with the
  // bundled tiles instead and add the online layer when the probe succeeds.
  const probing = options.imagery === 'auto' || (options.imagery === 'ion' && !options.ionToken);
  const imagery = probing ? 'offline' : await resolveImagerySource(options.imagery, options.ionToken);
  const baseLayer = await createImageryLayer(imagery, options.ionToken);
  const terrain = imagery === 'ion' ? Terrain.fromWorldTerrain() : undefined;

  const viewer = new Viewer(container, {
    baseLayer,
    terrain,
    // Time controls are our own (TopBar + Timeline); no Cesium widgets.
    animation: false,
    timeline: false,
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
    // Desktop displays run 120-165 Hz; the scene has nothing to show at that rate.
    targetFrameRate: 60,
  });

  // Cesium's own click handlers select/track whatever entity is under the pointer, fighting the
  // camera-mode store (a double-click would silently start following an entity). Ours replace them.
  viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
  viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

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
  clock.multiplier = options.restore?.multiplier ?? 1;
  clock.shouldAnimate = options.restore?.animating ?? true;
  setSimulationTime(viewer, options.initialTime ? JulianDate.fromDate(options.initialTime) : JulianDate.now());

  if (options.restore) {
    const { position, direction, up } = options.restore.view;
    viewer.camera.setView({ destination: position, orientation: { direction, up } });
  } else {
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(HOME_LON, HOME_LAT, HOME_HEIGHT_M),
    });
  }

  if (options.onProblem) watchLoadProblems(baseLayer, terrain, options.onProblem);

  if (probing) {
    void probeImage(ESRI_PROBE_TILE).then((online) => {
      if (viewer.isDestroyed()) return;
      if (online) {
        // The offline layer stays underneath: tiles that fail online still show something.
        const esri = createEsriLayer();
        viewer.imageryLayers.add(esri);
        if (options.onProblem) watchLoadProblems(esri, undefined, options.onProblem);
      }
      options.onImageryResolved?.(online ? 'esri' : 'offline');
    });
  }

  return { viewer, imagery, imageryPending: probing };
}

/** Current camera pose, safe to keep after the viewer is destroyed. */
export function captureView(viewer: Viewer): CameraView {
  const { camera } = viewer;
  return {
    position: Cartesian3.clone(camera.positionWC),
    direction: Cartesian3.clone(camera.directionWC),
    up: Cartesian3.clone(camera.upWC),
  };
}

function describeError(error: unknown, depth = 0): string {
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; error?: unknown; statusCode?: unknown };
    if (typeof e.statusCode === 'number') return `HTTP ${e.statusCode}`;
    if (e.error && depth < 3) return describeError(e.error, depth + 1);
    if (typeof e.message === 'string' && e.message.trim()) return e.message.trim().split('\n')[0]!.slice(0, 160);
  }
  return String(error).slice(0, 160);
}

/**
 * Cesium swallows imagery and terrain failures (a bad Ion token, an unreachable tile server),
 * leaving a black globe with nothing in the UI. Surface them once each.
 */
function watchLoadProblems(
  baseLayer: ImageryLayer,
  terrain: Terrain | undefined,
  report: (problem: ViewerProblem) => void,
): void {
  const reported = new Set<string>();
  const once = (problem: ViewerProblem) => {
    if (reported.has(problem.label)) return;
    reported.add(problem.label);
    report(problem);
  };

  // Failure to create the provider at all (Ion asset lookup with a bad token, offline tileset missing).
  baseLayer.errorEvent.addEventListener((error: unknown) => {
    once({ label: 'Imagery unavailable', detail: `The imagery source could not be loaded: ${describeError(error)}` });
  });

  const failures: number[] = [];
  const watchProvider = (provider: ImageryProvider) => {
    provider.errorEvent.addEventListener((error: unknown) => {
      const now = Date.now();
      failures.push(now);
      while (failures.length > 0 && now - failures[0]! > TILE_ERROR_WINDOW_MS) failures.shift();
      if (failures.length >= TILE_ERROR_THRESHOLD) {
        once({
          label: 'Imagery failing',
          detail: `Map tiles keep failing to load (${describeError(error)}). Check the network, or pick another imagery source in Settings.`,
        });
      }
    });
  };
  if (baseLayer.ready) watchProvider(baseLayer.imageryProvider);
  else baseLayer.readyEvent.addEventListener(watchProvider);

  terrain?.errorEvent.addEventListener((error: unknown) => {
    once({ label: 'Terrain unavailable', detail: `World terrain could not be loaded, showing a smooth globe: ${describeError(error)}` });
  });
}

/** Fly back to the whole-planet view. */
export function flyHome(viewer: Viewer, duration = 1.5): void {
  viewer.trackedEntity = undefined;
  viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(HOME_LON, HOME_LAT, HOME_HEIGHT_M), duration });
}

/** Fly to a point on the ground, seen from `heightM` above it. Releases any tracked entity. */
export function flyToLocation(viewer: Viewer, longitudeDeg: number, latitudeDeg: number, heightM = 3_500_000, duration = 1.5): void {
  viewer.trackedEntity = undefined;
  viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(longitudeDeg, latitudeDeg, heightM), duration });
}

/**
 * Jump the clock to an event and run forward at a speed suitable for watching it: a preset
 * between 1x and 60x is kept, anything else (backwards, 300x, 1000x) becomes 10x.
 */
export function jumpToInstant(viewer: Viewer, time: Date): void {
  setSimulationTime(viewer, JulianDate.fromDate(time));
  const multiplier = viewer.clock.multiplier;
  if (!(multiplier >= 1 && multiplier <= 60)) viewer.clock.multiplier = 10;
  viewer.clock.shouldAnimate = true;
}

/** Reset the simulation clock to wall-clock time at 1x. */
export function jumpToNow(viewer: Viewer): void {
  setSimulationTime(viewer, JulianDate.now());
  viewer.clock.multiplier = 1;
  viewer.clock.shouldAnimate = true;
}

/** Set the simulation clock (the timeline follows it on its own). */
export function setSimulationTime(viewer: Viewer, time: JulianDate): void {
  viewer.clock.currentTime = JulianDate.clone(time);
}
