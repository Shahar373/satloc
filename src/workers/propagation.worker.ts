/// <reference lib="webworker" />
import type { SatRec } from 'satellite.js';
import { gmstAt, propagateTeme, temeToEcf } from '../core/propagation/sgp4';
import { ommToElementSet, tleToElementSet } from '../core/tle/omm';
import type { PositionsMessage, WorkerRequest } from './protocol';

const satrecs = new Map<number, SatRec>();
let allIds = new Int32Array(0);

function handleLoad(records: Parameters<typeof ommToElementSet>[0][], tles: { noradId: number; name: string; line1: string; line2: string }[]) {
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
  allIds = Int32Array.from(satrecs.keys());
  self.postMessage({ type: 'loaded', count: satrecs.size, rejected });
}

function handlePropagate(requestId: number, timeMs: number, ids: Int32Array | undefined) {
  const date = new Date(timeMs);
  const gmst = gmstAt(date);
  const target = ids ?? allIds;
  const xyz = new Float64Array(target.length * 3);
  for (let i = 0; i < target.length; i++) {
    const satrec = satrecs.get(target[i]!);
    let x = Number.NaN;
    let y = Number.NaN;
    let z = Number.NaN;
    if (satrec) {
      try {
        const ecf = temeToEcf(propagateTeme(satrec, date).position, gmst);
        x = ecf.x * 1000;
        y = ecf.y * 1000;
        z = ecf.z * 1000;
      } catch {
        // leave NaN
      }
    }
    xyz[i * 3] = x;
    xyz[i * 3 + 1] = y;
    xyz[i * 3 + 2] = z;
  }
  const idsOut = ids ?? Int32Array.from(target);
  const message: PositionsMessage = { type: 'positions', requestId, timeMs, ids: idsOut, xyz };
  self.postMessage(message, [xyz.buffer, idsOut.buffer]);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'load') handleLoad(msg.records, msg.tles);
  else if (msg.type === 'propagate') handlePropagate(msg.requestId, msg.timeMs, msg.ids);
};
