import type { TleRecord } from '../core/catalog/tleapi';
import type { OmmRecord } from '../core/tle/omm';

/** Element sets the worker should know about, keyed by NORAD id (replaces the previous set). */
export interface LoadMessage {
  type: 'load';
  records: OmmRecord[];
  tles: TleRecord[];
}

/** Propagate every loaded satellite (or `ids` when given) to `timeMs` (Unix ms). */
export interface PropagateMessage {
  type: 'propagate';
  requestId: number;
  timeMs: number;
  ids?: Int32Array;
}

export type WorkerRequest = LoadMessage | PropagateMessage;

export interface LoadedMessage {
  type: 'loaded';
  count: number;
  /** NORAD ids that failed SGP4 initialisation. */
  rejected: number[];
}

export interface PositionsMessage {
  type: 'positions';
  requestId: number;
  timeMs: number;
  ids: Int32Array;
  /** Earth-fixed x, y, z in metres, three per id. NaN when propagation failed. */
  xyz: Float64Array;
}

export type WorkerResponse = LoadedMessage | PositionsMessage;
