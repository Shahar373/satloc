import {
  Cartesian2,
  Cartesian3,
  Color,
  JulianDate,
  PointPrimitive,
  PointPrimitiveCollection,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Viewer,
} from 'cesium';
import type { TleRecord } from '../core/catalog/tleapi';
import type { OmmRecord } from '../core/tle/omm';
import { PropagationClient } from './PropagationClient';

const POINT_COLOR = Color.fromCssColorString('#9fb4d0');
const POINT_SIZE = 4;

export interface HoverInfo {
  noradId: number;
  name: string;
  x: number;
  y: number;
}

/** How much of the requested catalogue actually made it onto the globe. */
export interface CatalogStats {
  /** Points loaded into the worker (after the points limit and SGP4 rejections). */
  shown: number;
  /** Element sets the displayed groups provided. */
  total: number;
  rejected: number;
}

export interface CatalogLayerCallbacks {
  onPick(noradId: number): void;
  onHover(info: HoverInfo | null): void;
  /** When it returns true, clicks are left to other handlers (e.g. observer picking). */
  clicksSuspended?(): boolean;
  onStats?(stats: CatalogStats): void;
  /** The worker died or a load failed; the layer stays empty until it is recreated. */
  onError?(message: string): void;
}

function sameElements<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * "Tier 2": thousands of catalogue satellites as a PointPrimitiveCollection, positions computed
 * in a web worker once per frame (one request in flight at a time).
 */
export class CatalogLayer {
  private readonly points: PointPrimitiveCollection;
  private readonly client = new PropagationClient();
  private readonly handler: ScreenSpaceEventHandler;
  private readonly removePreRender: () => void;
  private readonly byId = new Map<number, PointPrimitive>();
  private readonly names = new Map<number, string>();
  private ids = new Int32Array(0);
  /** Bumped whenever `ids` changes; the worker echoes it so stale answers are recognised. */
  private idsVersion = 0;
  private excluded = new Set<number>();
  private generation = 0;
  private lastTimeMs = Number.NaN;
  private hoveredId: number | null = null;
  /** Latest pointer position awaiting a pick (picked at most once per rendered frame). */
  private hoverPending: Cartesian2 | null = null;
  private pointerDown = false;
  private lastRequested: { records: OmmRecord[]; tles: TleRecord[]; maxPoints: number } | null = null;
  private failed = false;
  private destroyed = false;
  private readonly scratch = new Cartesian3();
  private readonly clearHover = () => {
    this.hoverPending = null;
    this.setHovered(null);
  };
  private readonly onPointerDown = () => {
    this.pointerDown = true;
    this.hoverPending = null;
  };
  private readonly onPointerUp = () => {
    this.pointerDown = false;
  };

  constructor(
    private readonly viewer: Viewer,
    private readonly callbacks: CatalogLayerCallbacks,
  ) {
    this.points = viewer.scene.primitives.add(new PointPrimitiveCollection()) as PointPrimitiveCollection;
    this.removePreRender = viewer.scene.preRender.addEventListener(() => this.tick());

    const canvas = viewer.scene.canvas;
    this.handler = new ScreenSpaceEventHandler(canvas);
    this.handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      if (this.callbacks.clicksSuspended?.()) return;
      const id = this.pickId(event.position);
      if (id !== null) this.callbacks.onPick(id);
    }, ScreenSpaceEventType.LEFT_CLICK);
    this.handler.setInputAction((event: ScreenSpaceEventHandler.MotionEvent) => {
      // scene.pick() is a GPU read-back; do it once per frame (in tick), never per pointer event.
      if (this.pointerDown) return;
      this.hoverPending = Cartesian2.clone(event.endPosition, this.hoverPending ?? new Cartesian2());
    }, ScreenSpaceEventType.MOUSE_MOVE);
    // Cesium reports no motion once the pointer has left the canvas, so the tooltip would stick.
    canvas.addEventListener('pointerleave', this.clearHover);
    canvas.addEventListener('pointercancel', this.clearHover);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  /**
   * Replace the displayed catalogue. The worker is reloaded only when the element sets actually
   * changed (compared by identity), so unrelated group state changes leave the points untouched.
   * Exclusions are applied separately.
   */
  async setRecords(records: OmmRecord[], tles: TleRecord[], maxPoints: number): Promise<void> {
    const last = this.lastRequested;
    if (last && last.maxPoints === maxPoints && sameElements(last.records, records) && sameElements(last.tles, tles)) return;
    this.lastRequested = { records, tles, maxPoints };

    const generation = ++this.generation;
    const keptRecords = records.slice(0, maxPoints);
    const keptTles = tles.slice(0, Math.max(0, maxPoints - keptRecords.length));

    let loaded: { rejected: number[] };
    try {
      loaded = await this.client.load(keptRecords, keptTles);
    } catch (err) {
      if (generation !== this.generation || this.viewer.isDestroyed()) return;
      this.lastRequested = null;
      this.reportFailure(err);
      return;
    }
    if (generation !== this.generation || this.viewer.isDestroyed()) return;

    const rejectedSet = new Set(loaded.rejected);
    const wanted = new Map<number, string>();
    for (const r of keptRecords) if (!rejectedSet.has(r.NORAD_CAT_ID) && !wanted.has(r.NORAD_CAT_ID)) wanted.set(r.NORAD_CAT_ID, r.OBJECT_NAME.trim());
    for (const t of keptTles) if (!rejectedSet.has(t.noradId) && !wanted.has(t.noradId)) wanted.set(t.noradId, t.name);

    // Diff instead of rebuilding: points that stay keep their last position until the next tick,
    // so a reload never blanks the whole catalogue for a frame.
    for (const [id, point] of this.byId) {
      if (wanted.has(id)) continue;
      this.points.remove(point);
      this.byId.delete(id);
      this.names.delete(id);
    }
    for (const [id, name] of wanted) {
      this.names.set(id, name);
      if (this.byId.has(id)) continue;
      const point = this.points.add({ id, position: Cartesian3.ZERO, pixelSize: POINT_SIZE, color: POINT_COLOR, show: false });
      this.byId.set(id, point);
    }
    this.applyExclusions();
    this.callbacks.onStats?.({
      shown: wanted.size,
      total: records.length + tles.length,
      rejected: loaded.rejected.length,
    });
  }

  /** Satellites drawn elsewhere (tier 1 entities) are hidden here and skipped by the worker. */
  setExcluded(exclude: Set<number>): void {
    this.excluded = exclude;
    this.applyExclusions();
  }

  private applyExclusions(): void {
    const ids: number[] = [];
    for (const [id, point] of this.byId) {
      if (this.excluded.has(id)) {
        point.show = false;
      } else {
        ids.push(id);
      }
    }
    this.ids = Int32Array.from(ids);
    this.idsVersion += 1;
    this.client.setIds(this.idsVersion, this.ids);
    this.lastTimeMs = Number.NaN;
    if (this.hoveredId !== null && !this.byId.get(this.hoveredId)?.show) this.setHovered(null);
  }

  get count(): number {
    return this.ids.length;
  }

  destroy(): void {
    this.destroyed = true;
    this.removePreRender();
    this.handler.destroy();
    this.client.terminate();
    window.removeEventListener('pointerup', this.onPointerUp);
    // The viewer is usually torn down first; its canvas listeners die with it, the primitives too.
    if (this.viewer.isDestroyed()) return;
    const canvas = this.viewer.scene.canvas;
    canvas.removeEventListener('pointerleave', this.clearHover);
    canvas.removeEventListener('pointercancel', this.clearHover);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.viewer.scene.primitives.remove(this.points);
  }

  private setHovered(id: number | null, at?: Cartesian2): void {
    if (id === null && this.hoveredId === null) return;
    this.hoveredId = id;
    if (id === null) {
      this.callbacks.onHover(null);
      return;
    }
    const x = at?.x ?? 0;
    const y = at?.y ?? 0;
    this.callbacks.onHover({ noradId: id, name: this.names.get(id) ?? String(id), x, y });
  }

  private reportFailure(err: unknown): void {
    // Our own terminate() rejects pending work; that is not a worker failure to show.
    if (this.failed || this.destroyed) return;
    this.failed = true;
    const message = err instanceof Error ? err.message : String(err);
    console.error('Catalogue layer failed', err);
    this.callbacks.onError?.(message);
  }

  private pickId(position: Cartesian2): number | null {
    const picked: unknown = this.viewer.scene.pick(position);
    const primitive = (picked as { primitive?: unknown; id?: unknown } | undefined);
    if (primitive && primitive.primitive instanceof PointPrimitive && typeof primitive.id === 'number') {
      const point = this.byId.get(primitive.id);
      if (point && point.show) return primitive.id;
    }
    return null;
  }

  private tick(): void {
    if (this.hoverPending) {
      const at = this.hoverPending;
      this.hoverPending = null;
      this.setHovered(this.pickId(at), at);
    }
    if (this.failed || this.ids.length === 0 || this.client.busy) return;
    const timeMs = JulianDate.toDate(this.viewer.clock.currentTime).getTime();
    if (timeMs === this.lastTimeMs) return;
    const version = this.idsVersion;
    const requested = this.ids;
    const request = this.client.propagate(timeMs, version);
    if (!request) return;
    const generation = this.generation;
    request.then(
      (msg) => {
        if (generation !== this.generation || this.viewer.isDestroyed()) return;
        // Exclusions may have changed while the request was in flight; a stale answer must not
        // re-show a point that is now drawn as a tier-1 entity, nor mark the new id set as current.
        if (msg.version !== version || msg.count !== requested.length) {
          this.client.recycle(msg.xyz);
          return;
        }
        if (requested === this.ids) this.lastTimeMs = msg.timeMs;
        for (let i = 0; i < requested.length; i++) {
          const id = requested[i]!;
          if (this.excluded.has(id)) continue;
          const point = this.byId.get(id);
          if (!point) continue;
          const x = msg.xyz[i * 3]!;
          if (Number.isNaN(x)) {
            point.show = false;
            continue;
          }
          this.scratch.x = x;
          this.scratch.y = msg.xyz[i * 3 + 1]!;
          this.scratch.z = msg.xyz[i * 3 + 2]!;
          point.position = this.scratch;
          point.show = true;
        }
        this.client.recycle(msg.xyz);
        if (this.hoveredId !== null && !this.byId.get(this.hoveredId)?.show) this.setHovered(null);
        this.viewer.scene.requestRender();
      },
      (err: unknown) => {
        if (generation !== this.generation || this.viewer.isDestroyed()) return;
        this.reportFailure(err);
      },
    );
  }
}
