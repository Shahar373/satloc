import {
  ArcType,
  CallbackPositionProperty,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  DistanceDisplayCondition,
  Entity,
  JulianDate,
  LabelStyle,
  Matrix3,
  Quaternion,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  type Viewer,
} from 'cesium';
import type { EciVec3 } from 'satellite.js';
import { presetSatellite } from '../core/catalog/presets';
import { EARTH_MEAN_RADIUS_M, footprintCentralAngle } from '../core/geometry/footprint';
import { circlePoints, stripEdges, type LatLon } from '../core/geometry/geodesy';
import { centralAngle, reachCentralAngle, targetEcfKm, vec } from '../core/imaging/geometry';
import {
  gmstAt,
  orbitalPeriodMinutes,
  propagateTeme,
  sampleGroundTrack,
  sampleOrbitTeme,
  temeToEcf,
  temeToGroundPoint,
  temeVelocityToEcf,
} from '../core/propagation/sgp4';
import type { ElementSet } from '../core/tle/omm';
import type { CameraMode } from '../state/selection';

const MARKER_COLOR = Color.fromCssColorString('#5cc8ff');
const SELECTED_COLOR = Color.fromCssColorString('#ffcf5a');
const ORBIT_COLOR = Color.fromCssColorString('#5cc8ff').withAlpha(0.85);
const TRACK_FUTURE_COLOR = Color.fromCssColorString('#ffcf5a').withAlpha(0.9);
const TRACK_PAST_COLOR = Color.fromCssColorString('#ffcf5a').withAlpha(0.35);
const FOOTPRINT_COLOR = Color.fromCssColorString('#5cc8ff').withAlpha(0.6);
const SWATH_COLOR = Color.fromCssColorString('#ff8a5c').withAlpha(0.9);
const REACH_COLOR = Color.fromCssColorString('#7CFC9A').withAlpha(0.55);
const LOS_COLOR = Color.fromCssColorString('#7CFC9A').withAlpha(0.9);
const LOS_OUT_OF_REACH_COLOR = Color.fromCssColorString('#ff5c7a').withAlpha(0.5);
const ORBIT_SAMPLES = 180;
const FOOTPRINT_SEGMENTS = 96;
/** Closer than this the 3D model is drawn, farther the point marker. */
const MODEL_RANGE_M = 3_000_000;
const MODEL_URL = new URL('./models/eros-c3.glb', document.baseURI).href;
const TRACK_STEP_S = 20;
const TRACK_HEIGHT_M = 2_000;
/** Recompute the ground track when the clock moved this far from the cached origin (sim seconds). */
const TRACK_STALE_S = 60;
/** ...but never more often than this in wall-clock time (at 1000x the sim threshold passes every few frames). */
const TRACK_MIN_REBUILD_MS = 500;
/** Reuse the footprint ring while the clock is within this of the cached instant (sim ms): the ring moves ~7 km/s. */
const FOOTPRINT_STALE_MS = 1000;

export interface SelectionView {
  selectedId: number | null;
  showOrbit: boolean;
  showGroundTrack: boolean;
  showFootprint: boolean;
  showSwath: boolean;
  showReach: boolean;
  cameraMode: CameraMode;
  /** Imaging target (degrees) for reach, line of sight and the imaging camera. */
  target: { latitudeDeg: number; longitudeDeg: number } | null;
  /** Roll limit used for the reach corridor, degrees. */
  maxOffNadirDeg: number;
}

interface Tracked {
  set: ElementSet;
  entity: Entity;
}

/** Ground track and its derived strips, sampled once and reused for TRACK_STALE_S of simulation time. */
interface TrackCache {
  id: number;
  fromMs: number;
  /** performance.now() when built. */
  builtAt: number;
  past: Cartesian3[];
  future: Cartesian3[];
  swathLeft: Cartesian3[];
  swathRight: Cartesian3[];
  reachLeft: Cartesian3[];
  reachRight: Cartesian3[];
  maxOffNadirDeg: number;
}

function kmToCartesian(v: EciVec3<number>, out?: Cartesian3): Cartesian3 {
  return Cartesian3.fromElements(v.x * 1000, v.y * 1000, v.z * 1000, out);
}

/**
 * Body orientation for a nadir-pointing imaging satellite: model +Z = away from Earth,
 * model -Y = direction of flight, model X = across-track (solar wings). Returns undefined if
 * the state cannot be computed.
 */
export function bodyOrientationAt(set: ElementSet, time: JulianDate, out?: Quaternion): Quaternion | undefined {
  const date = JulianDate.toDate(time);
  try {
    const state = propagateTeme(set.satrec, date);
    const gmst = gmstAt(date);
    const r = temeToEcf(state.position, gmst);
    const v = temeVelocityToEcf(state, gmst);
    const up = Cartesian3.normalize(new Cartesian3(r.x, r.y, r.z), new Cartesian3());
    const vel = Cartesian3.normalize(new Cartesian3(v.x, v.y, v.z), new Cartesian3());
    const across = Cartesian3.normalize(Cartesian3.cross(up, vel, new Cartesian3()), new Cartesian3());
    const back = Cartesian3.negate(vel, new Cartesian3());
    const m = new Matrix3(
      across.x, back.x, up.x,
      across.y, back.y, up.y,
      across.z, back.z, up.z,
    );
    return Quaternion.fromRotationMatrix(m, out);
  } catch {
    return undefined;
  }
}

/** Earth-fixed position of a satellite at a simulation instant, or undefined if SGP4 fails. */
export function fixedPositionAt(set: ElementSet, time: JulianDate, out?: Cartesian3): Cartesian3 | undefined {
  const date = JulianDate.toDate(time);
  try {
    const state = propagateTeme(set.satrec, date);
    return kmToCartesian(temeToEcf(state.position, gmstAt(date)), out);
  } catch {
    return undefined;
  }
}

/**
 * Renders "tier 1" satellites as Cesium entities: a marker + label per satellite, and for the
 * selected one an inertial orbit loop and a ground track. Positions are computed on demand from
 * the viewer clock, so time control (pause, speed, scrubbing) works with no extra plumbing.
 */
export class SatelliteLayer {
  private readonly tracked = new Map<number, Tracked>();
  private readonly handler: ScreenSpaceEventHandler;
  private readonly orbitEntity: Entity;
  private readonly trackFutureEntity: Entity;
  private readonly trackPastEntity: Entity;
  private readonly footprintEntity: Entity;
  private readonly swathLeftEntity: Entity;
  private readonly swathRightEntity: Entity;
  private readonly reachLeftEntity: Entity;
  private readonly reachRightEntity: Entity;
  private readonly losEntity: Entity;
  private readonly removePreRender: () => void;
  private selection: SelectionView = {
    selectedId: null,
    showOrbit: true,
    showGroundTrack: true,
    showFootprint: true,
    showSwath: true,
    showReach: true,
    cameraMode: 'free',
    target: null,
    maxOffNadirDeg: 45,
  };

  private orbitCache: {
    id: number;
    sampledAtMs: number;
    periodMs: number;
    teme: EciVec3<number>[];
    /** Rotated into the Earth-fixed frame in place every frame; the same array is returned each time. */
    fixed: Cartesian3[];
  } | null = null;
  private trackCache: TrackCache | null = null;
  /** The cache object whose arrays the six track/swath/reach polylines currently hold. */
  private trackSynced: TrackCache | null = null;
  private footprintCache: { id: number; atMs: number; ring: Cartesian3[] } | null = null;

  constructor(
    private readonly viewer: Viewer,
    private readonly onPick: (noradId: number) => void,
    /** When it returns true, clicks are left to other handlers (e.g. observer picking). */
    private readonly clicksSuspended: () => boolean = () => false,
  ) {
    this.orbitEntity = viewer.entities.add({
      id: 'satloc-orbit',
      show: false,
      polyline: {
        positions: new CallbackProperty((time) => this.orbitPositions(time ?? viewer.clock.currentTime), false),
        width: 1.5,
        material: ORBIT_COLOR,
        arcType: ArcType.NONE,
      },
    });
    this.trackFutureEntity = viewer.entities.add({
      id: 'satloc-track-future',
      show: false,
      polyline: {
        positions: [],
        width: 2,
        material: TRACK_FUTURE_COLOR,
      },
    });
    this.trackPastEntity = viewer.entities.add({
      id: 'satloc-track-past',
      show: false,
      polyline: {
        positions: [],
        width: 2,
        material: TRACK_PAST_COLOR,
      },
    });

    this.footprintEntity = viewer.entities.add({
      id: 'satloc-footprint',
      show: false,
      polyline: {
        positions: new CallbackProperty((time) => this.footprintPositions(time ?? viewer.clock.currentTime), false),
        width: 1.5,
        material: FOOTPRINT_COLOR,
      },
    });
    this.swathLeftEntity = viewer.entities.add({
      id: 'satloc-swath-left',
      show: false,
      polyline: {
        positions: [],
        width: 1,
        material: SWATH_COLOR,
      },
    });
    this.swathRightEntity = viewer.entities.add({
      id: 'satloc-swath-right',
      show: false,
      polyline: {
        positions: [],
        width: 1,
        material: SWATH_COLOR,
      },
    });

    this.reachLeftEntity = viewer.entities.add({
      id: 'satloc-reach-left',
      show: false,
      polyline: {
        positions: [],
        width: 1,
        material: REACH_COLOR,
      },
    });
    this.reachRightEntity = viewer.entities.add({
      id: 'satloc-reach-right',
      show: false,
      polyline: {
        positions: [],
        width: 1,
        material: REACH_COLOR,
      },
    });
    this.losEntity = viewer.entities.add({
      id: 'satloc-los',
      show: false,
      polyline: {
        positions: new CallbackProperty((time) => this.lineOfSight(time ?? viewer.clock.currentTime), false),
        width: 2,
        material: new ColorMaterialProperty(
          new CallbackProperty(() => (this.targetInReach ? LOS_COLOR : LOS_OUT_OF_REACH_COLOR), false),
        ),
        arcType: ArcType.NONE,
      },
    });

    this.removePreRender = viewer.scene.preRender.addEventListener(() => {
      this.syncTrack();
      this.updateCamera();
    });

    this.handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    this.handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      if (this.clicksSuspended()) return;
      const picked: unknown = viewer.scene.pick(event.position);
      const entity = (picked as { id?: unknown } | undefined)?.id;
      if (entity instanceof Entity) {
        for (const [noradId, t] of this.tracked) {
          if (t.entity === entity) {
            this.onPick(noradId);
            return;
          }
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
  }

  /** Replace the displayed satellites (diffing by NORAD id). */
  setSatellites(sets: ElementSet[]): void {
    const selectedBefore = this.selectedTracked()?.set;
    const wanted = new Map(sets.map((s) => [s.noradId, s]));
    for (const [id, t] of this.tracked) {
      if (!wanted.has(id)) {
        this.viewer.entities.remove(t.entity);
        this.tracked.delete(id);
      }
    }
    for (const set of sets) {
      const existing = this.tracked.get(set.noradId);
      if (existing) {
        existing.set = set; // refreshed elements: the position callback reads `t.set`
        continue;
      }
      const tracked: Tracked = { set, entity: undefined as unknown as Entity };
      const hasModel = presetSatellite(set.noradId) !== undefined;
      tracked.entity = this.viewer.entities.add({
        id: `satloc-sat-${set.noradId}`,
        name: set.name,
        position: new CallbackPositionProperty(
          (time, result) => fixedPositionAt(tracked.set, time ?? this.viewer.clock.currentTime, result),
          false,
        ),
        orientation: hasModel
          ? new CallbackProperty((time, result) => bodyOrientationAt(tracked.set, time ?? this.viewer.clock.currentTime, result as Quaternion | undefined), false)
          : undefined,
        model: hasModel
          ? {
              uri: MODEL_URL,
              minimumPixelSize: 48,
              maximumScale: 60_000,
              distanceDisplayCondition: new DistanceDisplayCondition(0, MODEL_RANGE_M),
            }
          : undefined,
        point: {
          pixelSize: 9,
          color: MARKER_COLOR,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          distanceDisplayCondition: hasModel ? new DistanceDisplayCondition(MODEL_RANGE_M, Number.POSITIVE_INFINITY) : undefined,
        },
        label: {
          text: set.name,
          font: '13px system-ui, sans-serif',
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -12),
        },
        // Within MODEL_RANGE_M so "track" mode shows the 3D model, not the far-range dot.
        viewFrom: new Cartesian3(0, -1_800_000, 1_400_000),
      });
      this.tracked.set(set.noradId, tracked);
    }
    // Unrelated group updates arrive here too; only refreshed elements of the selected satellite
    // invalidate the (expensive) orbit, track and footprint samples.
    if (this.selectedTracked()?.set !== selectedBefore) {
      this.orbitCache = null;
      this.trackCache = null;
      this.footprintCache = null;
    }
    this.applySelection();
  }

  setSelection(selection: SelectionView): void {
    this.selection = selection;
    this.applySelection();
  }

  destroy(): void {
    this.handler.destroy();
    this.removePreRender();
    if (this.viewer.isDestroyed()) return;
    if (this.viewer.trackedEntity && this.isOurs(this.viewer.trackedEntity)) this.viewer.trackedEntity = undefined;
    for (const t of this.tracked.values()) this.viewer.entities.remove(t.entity);
    for (const e of [
      this.orbitEntity,
      this.trackFutureEntity,
      this.trackPastEntity,
      this.footprintEntity,
      this.swathLeftEntity,
      this.swathRightEntity,
      this.reachLeftEntity,
      this.reachRightEntity,
      this.losEntity,
    ]) {
      this.viewer.entities.remove(e);
    }
    this.tracked.clear();
  }

  private selectedTracked(): Tracked | undefined {
    return this.selection.selectedId === null ? undefined : this.tracked.get(this.selection.selectedId);
  }

  private isOurs(entity: Entity): boolean {
    for (const t of this.tracked.values()) if (t.entity === entity) return true;
    return false;
  }

  private applySelection(): void {
    const { selectedId, showOrbit, showGroundTrack, showFootprint, showSwath, showReach, cameraMode, target } = this.selection;
    const selected = selectedId === null ? undefined : this.tracked.get(selectedId);
    const hasSwath = selected ? presetSatellite(selected.set.noradId)?.sat.swathKm !== undefined : false;

    for (const [id, t] of this.tracked) {
      const isSelected = id === selectedId;
      t.entity.point!.color = new ConstantProperty(isSelected ? SELECTED_COLOR : MARKER_COLOR);
      t.entity.point!.pixelSize = new ConstantProperty(isSelected ? 12 : 9);
    }

    this.orbitEntity.show = Boolean(selected && showOrbit);
    this.trackFutureEntity.show = Boolean(selected && showGroundTrack);
    this.trackPastEntity.show = Boolean(selected && showGroundTrack);
    this.footprintEntity.show = Boolean(selected && showFootprint);
    this.swathLeftEntity.show = Boolean(selected && showSwath && hasSwath);
    this.swathRightEntity.show = Boolean(selected && showSwath && hasSwath);
    this.reachLeftEntity.show = Boolean(selected && showReach && target);
    this.reachRightEntity.show = Boolean(selected && showReach && target);
    this.losEntity.show = Boolean(selected && showReach && target);
    if (this.trackCache && this.trackCache.maxOffNadirDeg !== this.selection.maxOffNadirDeg) this.trackCache = null;

    const cameraOnSatellite = cameraMode === 'nadir' || cameraMode === 'imaging';
    for (const [id, t] of this.tracked) {
      if (t.entity.model) t.entity.model.show = new ConstantProperty(!(cameraOnSatellite && id === selectedId));
    }

    const wantTracked = selected && cameraMode === 'track' ? selected.entity : undefined;
    const current = this.viewer.trackedEntity;
    if (wantTracked !== current && (wantTracked || (current && this.isOurs(current)))) {
      this.viewer.trackedEntity = wantTracked;
    }
  }

  /** One inertial orbit, rotated into the Earth-fixed frame of `time` (so it stays put while the Earth turns). */
  private orbitPositions(time: JulianDate): Cartesian3[] {
    const selected = this.selection.selectedId === null ? undefined : this.tracked.get(this.selection.selectedId);
    if (!selected) return [];
    const nowMs = JulianDate.toDate(time).getTime();
    const cache = this.orbitCache;
    if (!cache || cache.id !== selected.set.noradId || Math.abs(nowMs - cache.sampledAtMs) > cache.periodMs / 2) {
      try {
        const periodMs = orbitalPeriodMinutes(selected.set.satrec) * 60_000;
        const teme = sampleOrbitTeme(selected.set.satrec, new Date(nowMs), ORBIT_SAMPLES);
        // Perturbations leave a small gap after one revolution; close the loop visually.
        teme[teme.length - 1] = teme[0]!;
        this.orbitCache = { id: selected.set.noradId, sampledAtMs: nowMs, periodMs, teme, fixed: teme.map(() => new Cartesian3()) };
      } catch {
        this.orbitCache = null;
        return [];
      }
    }
    // TEME -> Earth-fixed is a rotation about Z by GMST; do it in place, no per-frame allocations.
    const gmst = gmstAt(new Date(nowMs));
    const c = Math.cos(gmst);
    const sn = Math.sin(gmst);
    const { teme, fixed } = this.orbitCache!;
    for (let i = 0; i < teme.length; i++) {
      const p = teme[i]!;
      Cartesian3.fromElements((p.x * c + p.y * sn) * 1000, (-p.x * sn + p.y * c) * 1000, p.z * 1000, fixed[i]);
    }
    return fixed;
  }

  /**
   * Ground track (half an orbit back, one ahead) plus the swath and reach strips, recomputed
   * when the selection changes or the clock drifts TRACK_STALE_S from the cached origin.
   */
  private ensureTrackCache(time: JulianDate): TrackCache | null {
    const { showGroundTrack, showSwath, showReach } = this.selection;
    const selected = this.selectedTracked();
    if (!selected || !(showGroundTrack || showSwath || showReach)) {
      this.trackCache = null;
      return null;
    }
    const nowMs = JulianDate.toDate(time).getTime();
    const cache = this.trackCache;
    if (
      cache &&
      cache.id === selected.set.noradId &&
      (Math.abs(nowMs - cache.fromMs) <= TRACK_STALE_S * 1000 || performance.now() - cache.builtAt < TRACK_MIN_REBUILD_MS)
    ) {
      return cache;
    }
    try {
      const period = orbitalPeriodMinutes(selected.set.satrec);
      // The sampling grid is anchored on `nowMs`, so both halves share the point under the satellite.
      const samples = sampleGroundTrack(selected.set.satrec, new Date(nowMs), period / 2, period, TRACK_STEP_S);
      const toCartesian = (p: LatLon) => Cartesian3.fromRadians(p.longitude, p.latitude, TRACK_HEIGHT_M);
      const futureSamples = samples.filter((s) => s.time.getTime() >= nowMs);
      const future = futureSamples.map((s) => s.point);
      const swathKm = presetSatellite(selected.set.noradId)?.sat.swathKm;
      const edges = swathKm ? stripEdges(future, (swathKm * 1000) / EARTH_MEAN_RADIUS_M) : { left: [], right: [] };
      const meanHeightM = (futureSamples.reduce((acc, s) => acc + s.point.heightKm, 0) / Math.max(1, futureSamples.length)) * 1000;
      const reach = stripEdges(future, 2 * reachCentralAngle(meanHeightM, (this.selection.maxOffNadirDeg * Math.PI) / 180));
      this.trackCache = {
        id: selected.set.noradId,
        fromMs: nowMs,
        builtAt: performance.now(),
        past: samples.filter((s) => s.time.getTime() <= nowMs).map((s) => toCartesian(s.point)),
        future: future.map(toCartesian),
        swathLeft: edges.left.map(toCartesian),
        swathRight: edges.right.map(toCartesian),
        reachLeft: reach.left.map(toCartesian),
        reachRight: reach.right.map(toCartesian),
        maxOffNadirDeg: this.selection.maxOffNadirDeg,
      };
    } catch {
      this.trackCache = null;
    }
    return this.trackCache;
  }

  /**
   * Push the cached arrays into the six static polylines, but only when the cache object changed:
   * static positions let Cesium build the geometry once instead of every frame.
   */
  private syncTrack(): void {
    const cache = this.ensureTrackCache(this.viewer.clock.currentTime);
    if (cache === this.trackSynced) return;
    this.trackSynced = cache;
    const assign = (entity: Entity, positions: Cartesian3[]) => {
      entity.polyline!.positions = new ConstantProperty(positions);
    };
    assign(this.trackPastEntity, cache?.past ?? []);
    assign(this.trackFutureEntity, cache?.future ?? []);
    assign(this.swathLeftEntity, cache?.swathLeft ?? []);
    assign(this.swathRightEntity, cache?.swathRight ?? []);
    assign(this.reachLeftEntity, cache?.reachLeft ?? []);
    assign(this.reachRightEntity, cache?.reachRight ?? []);
  }

  private targetInReach = false;

  /** Straight line from the satellite to the imaging target; colour says whether it is within the roll limit. */
  private lineOfSight(time: JulianDate): Cartesian3[] {
    const selected = this.selectedTracked();
    const target = this.selection.target;
    if (!selected || !target) return [];
    const date = JulianDate.toDate(time);
    try {
      const state = propagateTeme(selected.set.satrec, date);
      const satEcf = temeToEcf(state.position, gmstAt(date));
      const tgtEcf = targetEcfKm({ latitude: (target.latitudeDeg * Math.PI) / 180, longitude: (target.longitudeDeg * Math.PI) / 180, heightKm: 0 });
      const altitudeM = (vec.norm(satEcf) - EARTH_MEAN_RADIUS_M / 1000) * 1000;
      const lambda = centralAngle(satEcf, tgtEcf);
      this.targetInReach = lambda <= reachCentralAngle(altitudeM, (this.selection.maxOffNadirDeg * Math.PI) / 180);
      // Hide the line when the target is beyond the horizon (it would pass through the Earth).
      if (lambda > Math.acos((EARTH_MEAN_RADIUS_M / 1000) / vec.norm(satEcf))) return [];
      return [kmToCartesian(satEcf), kmToCartesian(tgtEcf)];
    } catch {
      return [];
    }
  }

  /** Horizon circle around the sub-satellite point, recomputed each simulated instant. */
  private footprintPositions(time: JulianDate): Cartesian3[] {
    const selected = this.selectedTracked();
    if (!selected) return [];
    const date = JulianDate.toDate(time);
    const nowMs = date.getTime();
    if (this.footprintCache && this.footprintCache.id === selected.set.noradId && Math.abs(this.footprintCache.atMs - nowMs) < FOOTPRINT_STALE_MS) {
      return this.footprintCache.ring;
    }
    try {
      const state = propagateTeme(selected.set.satrec, date);
      const ground = temeToGroundPoint(state.position, gmstAt(date));
      const angle = footprintCentralAngle(ground.heightKm * 1000);
      const ring = circlePoints(ground, angle, FOOTPRINT_SEGMENTS).map((p) =>
        Cartesian3.fromRadians(p.longitude, p.latitude, TRACK_HEIGHT_M),
      );
      this.footprintCache = { id: selected.set.noradId, atMs: nowMs, ring };
      return ring;
    } catch {
      return [];
    }
  }

  /** Nadir mode: camera on the satellite looking straight down. Imaging mode: looking at the target. */
  private updateCamera(): void {
    const mode = this.selection.cameraMode;
    if (mode !== 'nadir' && mode !== 'imaging') return;
    const selected = this.selectedTracked();
    if (!selected) return;
    const position = fixedPositionAt(selected.set, this.viewer.clock.currentTime);
    if (!position) return;
    const target = this.selection.target;
    if (mode === 'nadir' || !target) {
      this.viewer.camera.setView({ destination: position, orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } });
      return;
    }
    const targetPos = Cartesian3.fromDegrees(target.longitudeDeg, target.latitudeDeg, 0);
    const direction = Cartesian3.normalize(Cartesian3.subtract(targetPos, position, new Cartesian3()), new Cartesian3());
    // "Up" for the view: away from the Earth centre, made orthogonal to the viewing direction.
    const outward = Cartesian3.normalize(position, new Cartesian3());
    const up = Cartesian3.subtract(
      outward,
      Cartesian3.multiplyByScalar(direction, Cartesian3.dot(outward, direction), new Cartesian3()),
      new Cartesian3(),
    );
    if (Cartesian3.magnitude(up) < 1e-6) return;
    this.viewer.camera.setView({ destination: position, orientation: { direction, up: Cartesian3.normalize(up, up) } });
  }
}
