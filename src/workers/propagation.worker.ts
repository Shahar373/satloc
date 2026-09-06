/// <reference lib="webworker" />
import { gstime, jday, sgp4, type SatRec } from 'satellite.js';
import { ommToElementSet, tleToElementSet } from '../core/tle/omm';
import type { LoadedMessage, PositionsMessage, WorkerRequest } from './protocol';

const MINUTES_PER_DAY = 1440;
/** Geocentric distances outside this band are SGP4 garbage (decayed or malformed objects), km. */
const MIN_RADIUS_KM = 6_300;
const MAX_RADIUS_KM = 1_000_000;

const satrecs = new Map<number, SatRec>();
let ids: Int32Array = new Int32Array(0);
/** satrecs in `ids` order (null where unknown), refreshed on load and setIds. */
let ordered: (SatRec | null)[] = [];

function reorder() {
  ordered = Array.from(ids, (id) => satrecs.get(id) ?? null);
}

function handleLoad(
  requestId: number,
  records: Parameters<typeof ommToElementSet>[0][],
  tles: { noradId: number; name: string; line1: string; line2: string }[],
) {
  satrecs.clear();
  const rejected: number[] = [];
  for (const record of records) {
    try {
      const set = ommToElementSet(record);
      satrecs.set(set.noradId, set.satrec);
    } catch {
      rejected.push(record.NORAD_CAT_ID);
    }
  }
  for (const tle of tles) {
    if (satrecs.has(tle.noradId)) continue;
    try {
      satrecs.set(tle.noradId, tleToElementSet(tle.line1, tle.line2, tle.name).satrec);
    } catch {
      rejected.push(tle.noradId);
    }
  }
  reorder();
  const message: LoadedMessage = { type: 'loaded', requestId, count: satrecs.size, rejected };
  self.postMessage(message);
}

function handleSetIds(next: Int32Array) {
  ids = next;
  reorder();
}

/**
 * The hot loop: one Julian day and one GMST per request, sgp4() called directly (propagate()
 * would re-derive the Julian day per satellite), TEME→ECEF rotation written straight into the
 * output buffer, which is the caller's recycled buffer when it still fits.
 */
function handlePropagate(requestId: number, timeMs: number, version: number, recycle: Float64Array | undefined) {
  const date = new Date(timeMs);
  const jd = jday(date);
  const gmst = gstime(date);
  const c = Math.cos(gmst);
  const s = Math.sin(gmst);
  const n = ordered.length;
  const xyz = recycle && recycle.length === n * 3 ? recycle : new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const satrec = ordered[i];
    let x = Number.NaN;
    let y = Number.NaN;
    let z = Number.NaN;
    if (satrec) {
      const tsince = (jd - satrec.jdsatepoch) * MINUTES_PER_DAY;
      const result = sgp4(satrec, tsince);
      const p = result?.position;
      if (p) {
        const r2 = p.x * p.x + p.y * p.y + p.z * p.z;
        if (r2 >= MIN_RADIUS_KM * MIN_RADIUS_KM && r2 <= MAX_RADIUS_KM * MAX_RADIUS_KM) {
          x = (p.x * c + p.y * s) * 1000;
          y = (-p.x * s + p.y * c) * 1000;
          z = p.z * 1000;
        }
      }
    }
    xyz[i * 3] = x;
    xyz[i * 3 + 1] = y;
    xyz[i * 3 + 2] = z;
  }
  const message: PositionsMessage = { type: 'positions', requestId, timeMs, version, count: n, xyz };
  self.postMessage(message, [xyz.buffer]);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'load') handleLoad(msg.requestId, msg.records, msg.tles);
  else if (msg.type === 'setIds') handleSetIds(msg.ids);
  else if (msg.type === 'propagate') handlePropagate(msg.requestId, msg.timeMs, msg.version, msg.recycle);
};
