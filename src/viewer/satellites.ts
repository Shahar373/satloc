import {
  ArcType,
  CallbackPositionProperty,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
  Entity,
  JulianDate,
  LabelStyle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  type Viewer,
} from 'cesium';
import type { EciVec3 } from 'satellite.js';
import { presetSatellite } from '../core/catalog/presets';
import { EARTH_MEAN_RADIUS_M, footprintCentralAngle } from '../core/geometry/footprint';
import { circlePoints, stripEdges, type LatLon } from '../core/geometry/geodesy';
import {
  gmstAt,
  orbitalPeriodMinutes,
  propagateTeme,
  sampleGroundTrack,
  sampleOrbitTeme,
  temeToEcf,
  temeToGroundPoint,
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
const ORBIT_SAMPLES = 180;
const FOOTPRINT_SEGMENTS = 96;
const TRACK_STEP_S = 20;
const TRACK_HEIGHT_M = 2_000;
/** Recompute the ground track when the clock moved this far from the cached origin (sim seconds). */
const TRACK_STALE_S = 60;

export interface SelectionView {
  selectedId: number | null;
  showOrbit: boolean;
  showGroundTrack: boolean;
  showFootprint: boolean;
  showSwath: boolean;
  cameraMode: CameraMode;
}

interface Tracked {
  set: ElementSet;
  entity: Entity;
}

function kmToCartesian(v: EciVec3<number>, out?: Cartesian3): Cartesian3 {
  return Cartesian3.fromElements(v.x * 1000, v.y * 1000, v.z * 1000, out);
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
  private readonly removePreRender: () => void;
  private selection: SelectionView = {
    selectedId: null,
    showOrbit: true,
    showGroundTrack: true,
    showFootprint: true,
    showSwath: true,
    cameraMode: 'free',
  };

  private orbitCache: { id: number; sampledAtMs: number; periodMs: number; teme: EciVec3<number>[] } | null = null;
  private trackCache: {
    id: number;
    fromMs: number;
    past: Cartesian3[];
    future: Cartesian3[];
    swathLeft: Cartesian3[];
    swathRight: Cartesian3[];
  } | null = null;
  private footprintCache: { id: number; atMs: number; ring: Cartesian3[] } | null = null;

  constructor(
    private readonly viewer: Viewer,
    private readonly onPick: (noradId: number) => void,
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
        positions: new CallbackProperty((time) => this.trackPositions(time ?? viewer.clock.currentTime, 'future'), false),
        width: 2,
        material: TRACK_FUTURE_COLOR,
      },
    });
    this.trackPastEntity = viewer.entities.add({
      id: 'satloc-track-past',
      show: false,
      polyline: {
        positions: new CallbackProperty((time) => this.trackPositions(time ?? viewer.clock.currentTime, 'past'), false),
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
        positions: new CallbackProperty((time) => this.swathPositions(time ?? viewer.clock.currentTime, 'left'), false),
        width: 1,
        material: SWATH_COLOR,
      },
    });
    this.swathRightEntity = viewer.entities.add({
      id: 'satloc-swath-right',
      show: false,
      polyline: {
        positions: new CallbackProperty((time) => this.swathPositions(time ?? viewer.clock.currentTime, 'right'), false),
        width: 1,
        material: SWATH_COLOR,
      },
    });

    this.removePreRender = viewer.scene.preRender.addEventListener(() => this.updateNadirCamera());

    this.handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    this.handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
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
      tracked.entity = this.viewer.entities.add({
        id: `satloc-sat-${set.noradId}`,
        name: set.name,
        position: new CallbackPositionProperty(
          (time, result) => fixedPositionAt(tracked.set, time ?? this.viewer.clock.currentTime, result),
          false,
        ),
        point: {
          pixelSize: 9,
          color: MARKER_COLOR,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
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
        viewFrom: new Cartesian3(0, -2_500_000, 2_000_000),
      });
      this.tracked.set(set.noradId, tracked);
    }
    this.orbitCache = null;
    this.trackCache = null;
    this.footprintCache = null;
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
    const { selectedId, showOrbit, showGroundTrack, showFootprint, showSwath, cameraMode } = this.selection;
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
        this.orbitCache = { id: selected.set.noradId, sampledAtMs: nowMs, periodMs, teme };
      } catch {
        this.orbitCache = null;
        return [];
      }
    }
    const gmst = gmstAt(new Date(nowMs));
    return this.orbitCache!.teme.map((p) => kmToCartesian(temeToEcf(p, gmst)));
  }

  private trackPositions(time: JulianDate, part: 'past' | 'future'): Cartesian3[] {
    const selected = this.selection.selectedId === null ? undefined : this.tracked.get(this.selection.selectedId);
    if (!selected) return [];
    const nowMs = JulianDate.toDate(time).getTime();
    const cache = this.trackCache;
    if (!cache || cache.id !== selected.set.noradId || Math.abs(nowMs - cache.fromMs) > TRACK_STALE_S * 1000) {
      try {
        const period = orbitalPeriodMinutes(selected.set.satrec);
        const samples = sampleGroundTrack(selected.set.satrec, new Date(nowMs), period / 2, period, TRACK_STEP_S);
        const toCartesian = (p: LatLon) => Cartesian3.fromRadians(p.longitude, p.latitude, TRACK_HEIGHT_M);
        const future = samples.filter((s) => s.time.getTime() >= nowMs).map((s) => s.point);
        const swathKm = presetSatellite(selected.set.noradId)?.sat.swathKm;
        const edges = swathKm ? stripEdges(future, (swathKm * 1000) / EARTH_MEAN_RADIUS_M) : { left: [], right: [] };
        this.trackCache = {
          id: selected.set.noradId,
          fromMs: nowMs,
          past: samples.filter((s) => s.time.getTime() <= nowMs).map((s) => toCartesian(s.point)),
          future: future.map(toCartesian),
          swathLeft: edges.left.map(toCartesian),
          swathRight: edges.right.map(toCartesian),
        };
      } catch {
        this.trackCache = null;
        return [];
      }
    }
    return part === 'past' ? this.trackCache!.past : this.trackCache!.future;
  }

  private swathPositions(time: JulianDate, side: 'left' | 'right'): Cartesian3[] {
    this.trackPositions(time, 'future'); // ensures the cache (and its swath edges) is current
    if (!this.trackCache) return [];
    return side === 'left' ? this.trackCache.swathLeft : this.trackCache.swathRight;
  }

  /** Horizon circle around the sub-satellite point, recomputed each simulated instant. */
  private footprintPositions(time: JulianDate): Cartesian3[] {
    const selected = this.selectedTracked();
    if (!selected) return [];
    const date = JulianDate.toDate(time);
    const nowMs = date.getTime();
    if (this.footprintCache && this.footprintCache.id === selected.set.noradId && this.footprintCache.atMs === nowMs) {
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

  /** In nadir mode the camera sits on the satellite and looks straight down, north up. */
  private updateNadirCamera(): void {
    if (this.selection.cameraMode !== 'nadir') return;
    const selected = this.selectedTracked();
    if (!selected) return;
    const position = fixedPositionAt(selected.set, this.viewer.clock.currentTime);
    if (!position) return;
    this.viewer.camera.setView({
      destination: position,
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    });
  }
}
