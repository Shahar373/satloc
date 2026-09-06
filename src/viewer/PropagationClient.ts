import type { TleRecord } from '../core/catalog/tleapi';
import type { OmmRecord } from '../core/tle/omm';
import type { PositionsMessage, WorkerRequest, WorkerResponse } from '../workers/protocol';

interface Deferred<T> {
  resolve(value: T): void;
  reject(error: Error): void;
}

export interface LoadResult {
  count: number;
  rejected: number[];
}

/**
 * Main-thread handle on the propagation worker: any number of loads (each resolves with its own
 * reply) and one outstanding propagate request at a time. A crashed worker rejects everything
 * pending and reports itself through `failure`, so callers stop asking instead of hanging.
 */
export class PropagationClient {
  private readonly worker: Worker;
  private nextRequestId = 1;
  private pending: ({ id: number } & Deferred<PositionsMessage>) | null = null;
  private readonly loads = new Map<number, Deferred<LoadResult>>();
  private _failure: Error | null = null;

  constructor() {
    this.worker = new Worker(new URL('../workers/propagation.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.type === 'loaded') {
        const load = this.loads.get(msg.requestId);
        if (!load) return;
        this.loads.delete(msg.requestId);
        load.resolve({ count: msg.count, rejected: msg.rejected });
      } else if (msg.type === 'positions' && this.pending && msg.requestId === this.pending.id) {
        const { resolve } = this.pending;
        this.pending = null;
        resolve(msg);
      }
    };
    this.worker.onerror = (event: ErrorEvent) => {
      // Fired for uncaught exceptions inside the worker and when the worker script fails to load.
      const detail = typeof event.message === 'string' && event.message ? event.message : 'it stopped without a message';
      this.fail(new Error(`The satellite worker failed: ${detail}`));
    };
    this.worker.onmessageerror = () => this.fail(new Error('The satellite worker sent an unreadable message'));
  }

  /** Set once the worker is unusable; every later call rejects immediately. */
  get failure(): Error | null {
    return this._failure;
  }

  load(records: OmmRecord[], tles: TleRecord[]): Promise<LoadResult> {
    if (this._failure) return Promise.reject(this._failure);
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.loads.set(requestId, { resolve, reject });
      this.post({ type: 'load', requestId, records, tles });
    });
  }

  /** Resolves with positions for `timeMs`; returns null if a request is already in flight. */
  propagate(timeMs: number, ids?: Int32Array): Promise<PositionsMessage> | null {
    if (this._failure) return Promise.reject(this._failure);
    if (this.pending) return null;
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pending = { id, resolve, reject };
      this.post({ type: 'propagate', requestId: id, timeMs, ids });
    });
  }

  get busy(): boolean {
    return this.pending !== null;
  }

  terminate(): void {
    this.worker.terminate();
    this.fail(new Error('The satellite worker was stopped'));
  }

  private fail(error: Error): void {
    if (this._failure) return;
    this._failure = error;
    const pending = this.pending;
    this.pending = null;
    pending?.reject(error);
    for (const load of this.loads.values()) load.reject(error);
    this.loads.clear();
  }

  private post(message: WorkerRequest): void {
    this.worker.postMessage(message);
  }
}
