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
  private generation = 0;
  private lastTimeMs = Number.NaN;
  private readonly scratch = new Cartesian3();

  constructor(
    private readonly viewer: Viewer,
    private readonly onPick: (noradId: number) => void,
    private readonly onHover: (info: HoverInfo | null) => void,
    private readonly clicksSuspended: () => boolean = () => false,
  ) {
    this.points = viewer.scene.primitives.add(new PointPrimitiveCollection()) as PointPrimitiveCollection;
    this.removePreRender = viewer.scene.preRender.addEventListener(() => this.tick());

    this.handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    this.handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      if (this.clicksSuspended()) return;
      const id = this.pickId(event.position);
      if (id !== null) this.onPick(id);
    }, ScreenSpaceEventType.LEFT_CLICK);
    this.handler.setInputAction((event: ScreenSpaceEventHandler.MotionEvent) => {
      const id = this.pickId(event.endPosition);
      this.onHover(
        id === null ? null : { noradId: id, name: this.names.get(id) ?? String(id), x: event.endPosition.x, y: event.endPosition.y },
      );
    }, ScreenSpaceEventType.MOUSE_MOVE);
  }

  /** Replace the displayed catalogue. Satellites in `exclude` are drawn elsewhere (tier 1). */
  async setRecords(records: OmmRecord[], tles: TleRecord[], exclude: Set<number>, maxPoints: number): Promise<void> {
    const generation = ++this.generation;
    const keptRecords = records.filter((r) => !exclude.has(r.NORAD_CAT_ID)).slice(0, maxPoints);
    const keptTles = tles.filter((t) => !exclude.has(t.noradId)).slice(0, Math.max(0, maxPoints - keptRecords.length));

    const { rejected } = await this.client.load(keptRecords, keptTles);
    if (generation !== this.generation || this.viewer.isDestroyed()) return;

    const rejectedSet = new Set(rejected);
    this.points.removeAll();
    this.byId.clear();
    this.names.clear();
    const ids: number[] = [];
    const add = (id: number, name: string) => {
      if (rejectedSet.has(id) || this.byId.has(id)) return;
      const point = this.points.add({ id, position: Cartesian3.ZERO, pixelSize: POINT_SIZE, color: POINT_COLOR, show: false });
      this.byId.set(id, point);
      this.names.set(id, name);
      ids.push(id);
    };
    for (const r of keptRecords) add(r.NORAD_CAT_ID, r.OBJECT_NAME.trim());
    for (const t of keptTles) add(t.noradId, t.name);
    this.ids = Int32Array.from(ids);
    this.lastTimeMs = Number.NaN;
  }

  get count(): number {
    return this.ids.length;
  }

  destroy(): void {
    this.removePreRender();
    this.handler.destroy();
    this.client.terminate();
    if (!this.viewer.isDestroyed()) this.viewer.scene.primitives.remove(this.points);
  }

  private pickId(position: Cartesian2): number | null {
    const picked: unknown = this.viewer.scene.pick(position);
    const primitive = (picked as { primitive?: unknown; id?: unknown } | undefined);
    if (primitive && primitive.primitive instanceof PointPrimitive && typeof primitive.id === 'number') {
      return primitive.id;
    }
    return null;
  }

  private tick(): void {
    if (this.ids.length === 0 || this.client.busy) return;
    const timeMs = JulianDate.toDate(this.viewer.clock.currentTime).getTime();
    if (timeMs === this.lastTimeMs) return;
    const request = this.client.propagate(timeMs, Int32Array.from(this.ids));
    if (!request) return;
    const generation = this.generation;
    void request.then((msg) => {
      if (generation !== this.generation || this.viewer.isDestroyed()) return;
      this.lastTimeMs = msg.timeMs;
      for (let i = 0; i < msg.ids.length; i++) {
        const point = this.byId.get(msg.ids[i]!);
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
      this.viewer.scene.requestRender();
    });
  }
}
