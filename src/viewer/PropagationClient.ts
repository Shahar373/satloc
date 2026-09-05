import type { TleRecord } from '../core/catalog/tleapi';
import type { OmmRecord } from '../core/tle/omm';
import type { PositionsMessage, WorkerRequest, WorkerResponse } from '../workers/protocol';

/** Main-thread handle on the propagation worker: one outstanding request at a time. */
export class PropagationClient {
  private readonly worker: Worker;
  private nextRequestId = 1;
  private pending: { id: number; resolve: (m: PositionsMessage) => void } | null = null;
  private onLoaded: ((count: number, rejected: number[]) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL('../workers/propagation.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.type === 'loaded') {
        this.onLoaded?.(msg.count, msg.rejected);
      } else if (msg.type === 'positions' && this.pending && msg.requestId === this.pending.id) {
        const { resolve } = this.pending;
        this.pending = null;
        resolve(msg);
      }
    };
  }

  load(records: OmmRecord[], tles: TleRecord[]): Promise<{ count: number; rejected: number[] }> {
    return new Promise((resolve) => {
      this.onLoaded = (count, rejected) => resolve({ count, rejected });
      this.post({ type: 'load', records, tles });
    });
  }

  /** Resolves with positions for `timeMs`; returns null if a request is already in flight. */
  propagate(timeMs: number, ids?: Int32Array): Promise<PositionsMessage> | null {
    if (this.pending) return null;
    const id = this.nextRequestId++;
    return new Promise((resolve) => {
      this.pending = { id, resolve };
      this.post({ type: 'propagate', requestId: id, timeMs, ids });
    });
  }

  get busy(): boolean {
    return this.pending !== null;
  }

  terminate(): void {
    this.worker.terminate();
    this.pending = null;
  }

  private post(message: WorkerRequest): void {
    this.worker.postMessage(message);
  }
}
