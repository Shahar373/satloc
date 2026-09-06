import type { TleRecord } from '../core/catalog/tleapi';
import type { OmmRecord } from '../core/tle/omm';

/** Element sets the worker should know about, keyed by NORAD id (replaces the previous set). */
export interface LoadMessage {
  type: 'load';
  /** Echoed in the reply so overlapping loads resolve their own promise. */
  requestId: number;
  records: OmmRecord[];
  tles: TleRecord[];
}

/**
 * The ids to propagate from now on, in this order (sent once when exclusions change, not per
 * frame). `version` is echoed with every positions reply so a stale reply can be recognised.
 */
export interface SetIdsMessage {
  type: 'setIds';
  version: number;
  ids: Int32Array;
}

/** Propagate the current id list to `timeMs` (Unix ms). `recycle` is a buffer to reuse for the answer. */
export interface PropagateMessage {
  type: 'propagate';
  requestId: number;
  timeMs: number;
  version: number;
  recycle?: Float64Array;
}

export type WorkerRequest = LoadMessage | SetIdsMessage | PropagateMessage;

export interface LoadedMessage {
  type: 'loaded';
  requestId: number;
  count: number;
  /** NORAD ids that failed SGP4 initialisation. */
  rejected: number[];
}

export interface PositionsMessage {
  type: 'positions';
  requestId: number;
  timeMs: number;
  /** The id-list version these positions belong to (same order as that list). */
  version: number;
  count: number;
  /** Earth-fixed x, y, z in metres, three per id. NaN when propagation failed. */
  xyz: Float64Array;
}

export type WorkerResponse = LoadedMessage | PositionsMessage;
