import type { TargetPoint } from '../core/imaging/geometry';
import type { ImagingOpportunity, ImagingOptions } from '../core/imaging/opportunities';
import type { Observer, Pass, PredictOptions } from '../core/passes/predict';
import type {
  ElementSetInput,
  ForecastRequest,
  ForecastResponse,
  ImagingForecastRequest,
  ImagingForecastResult,
  PassesForecastRequest,
  PassesForecastResult,
} from './forecastProtocol';

/** Omit distributed manually over the request union — plain `Omit<ForecastRequest, 'requestId'>` would collapse to only the fields shared by every variant. */
type ForecastRequestBody = Omit<PassesForecastRequest, 'requestId'> | Omit<ImagingForecastRequest, 'requestId'>;

interface Deferred<T> {
  resolve(value: T): void;
  reject(error: Error): void;
}

/** Thrown to a caller whose request was superseded by a newer one for the same logical key before the worker replied. */
export class SupersededError extends Error {
  readonly superseded = true;
  constructor(key: string) {
    super(`Forecast request for "${key}" was superseded by a newer request`);
    this.name = 'SupersededError';
  }
}

function stableKey(parts: unknown): string {
  return JSON.stringify(parts, (_key, value: unknown) => {
    if (value instanceof Date) return value.getTime();
    return value;
  });
}

/** The slice of the real `Worker` API this client needs — narrow enough to fake in a unit test without a DOM/worker environment. */
export interface WorkerLike {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<ForecastResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  terminate(): void;
}

function createDefaultWorker(): WorkerLike {
  return new Worker(new URL('./forecast.worker.ts', import.meta.url), { type: 'module' });
}

/**
 * Main-thread handle on the forecast worker (pass prediction, imaging opportunities — both
 * potentially expensive multi-day scans, see src/core/passes/predict.ts and
 * src/core/imaging/opportunities.ts). Any number of requests may be in flight at once, each
 * identified by a `requestId`; a **cache key** further identifies a request's logical identity
 * (satellite + inputs), independent of `requestId`.
 *
 * The cache key is built from the caller-supplied `satelliteKey` string, not from `element`
 * (the actual OMM/TLE data) — so a fresher element set under the same `satelliteKey` is *not*
 * detected automatically. Callers that refresh a satellite's elements (e.g. a periodic catalog
 * refresh) must call `invalidate(satelliteKey)` themselves afterwards, or a stale forecast can be
 * served indefinitely.
 *
 * "Cancellation" here means client-side supersession, not a true mid-computation abort: the
 * worker is a single JS thread with no yield points inside predictPasses/findImagingOpportunities,
 * so an older request already being computed cannot actually be interrupted. Issuing a new
 * request for the same cache key instead rejects the older request's promise with
 * `SupersededError` and discards its eventual reply — nothing in the app is left waiting on a
 * stale answer, even though the worker still spends the CPU time on it.
 */
export class ForecastClient {
  private readonly worker: WorkerLike;
  private nextRequestId = 1;
  private readonly pending = new Map<number, Deferred<ForecastResponse> & { key: string; satelliteKey: string }>();
  /** The one outstanding requestId per cache key, if any — a fresh request for the same key supersedes it. */
  private readonly outstandingByKey = new Map<string, number>();
  private readonly cache = new Map<string, PassesForecastResult | ImagingForecastResult>();
  /** Cache keys grouped by satelliteKey, so invalidate() doesn't need to string-match into stableKey()'s output. */
  private readonly cacheKeysBySatellite = new Map<string, Set<string>>();
  private _failure: Error | null = null;

  /** `worker` is injectable for tests (a fake implementing `WorkerLike`); production callers omit it and get a real Worker. */
  constructor(worker: WorkerLike = createDefaultWorker()) {
    this.worker = worker;
    this.worker.onmessage = (event: MessageEvent<ForecastResponse>) => {
      const msg = event.data;
      const entry = this.pending.get(msg.requestId);
      if (!entry) return; // superseded or from before a failure: discard silently
      this.pending.delete(msg.requestId);
      if (this.outstandingByKey.get(entry.key) === msg.requestId) this.outstandingByKey.delete(entry.key);
      if (msg.type === 'error') {
        entry.reject(new Error(msg.message));
        return;
      }
      this.cache.set(entry.key, msg);
      let keysForSatellite = this.cacheKeysBySatellite.get(entry.satelliteKey);
      if (!keysForSatellite) {
        keysForSatellite = new Set();
        this.cacheKeysBySatellite.set(entry.satelliteKey, keysForSatellite);
      }
      keysForSatellite.add(entry.key);
      entry.resolve(msg);
    };
    this.worker.onerror = (event: ErrorEvent) => {
      const detail =
        typeof event.message === 'string' && event.message ? event.message : 'it stopped without a message';
      this.fail(new Error(`The forecast worker failed: ${detail}`));
    };
    this.worker.onmessageerror = () => this.fail(new Error('The forecast worker sent an unreadable message'));
  }

  /** Set once the worker is unusable; every later call rejects immediately. */
  get failure(): Error | null {
    return this._failure;
  }

  passes(
    satelliteKey: string,
    element: ElementSetInput,
    observer: Observer,
    start: Date,
    hours?: number,
    options?: PredictOptions,
  ): Promise<Pass[]> {
    const key = stableKey(['passes', satelliteKey, observer, start, hours, options]);
    return this.request(key, satelliteKey, {
      type: 'passes',
      element,
      observer,
      startMs: start.getTime(),
      hours,
      options,
    }).then((result) => (result as PassesForecastResult).passes);
  }

  imaging(
    satelliteKey: string,
    element: ElementSetInput,
    target: TargetPoint,
    start: Date,
    days?: number,
    options?: ImagingOptions,
  ): Promise<ImagingOpportunity[]> {
    const key = stableKey(['imaging', satelliteKey, target, start, days, options]);
    return this.request(key, satelliteKey, {
      type: 'imaging',
      element,
      target,
      startMs: start.getTime(),
      days,
      options,
    }).then((result) => (result as ImagingForecastResult).opportunities);
  }

  /** Drops every cached result for a satellite whose element set changed (a fresh TLE/OMM invalidates prior forecasts). */
  invalidate(satelliteKey: string): void {
    const keys = this.cacheKeysBySatellite.get(satelliteKey);
    if (!keys) return;
    for (const key of keys) this.cache.delete(key);
    this.cacheKeysBySatellite.delete(satelliteKey);
  }

  clearCache(): void {
    this.cache.clear();
    this.cacheKeysBySatellite.clear();
  }

  terminate(): void {
    this.worker.terminate();
    this.fail(new Error('The forecast worker was stopped'));
  }

  private request(key: string, satelliteKey: string, body: ForecastRequestBody): Promise<ForecastResponse> {
    if (this._failure) return Promise.reject(this._failure);
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);

    const supersededId = this.outstandingByKey.get(key);
    if (supersededId !== undefined) {
      const supersededEntry = this.pending.get(supersededId);
      supersededEntry?.reject(new SupersededError(key));
      this.pending.delete(supersededId);
    }

    const requestId = this.nextRequestId++;
    this.outstandingByKey.set(key, requestId);
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { key, satelliteKey, resolve, reject });
      const message: ForecastRequest = { ...body, requestId };
      this.worker.postMessage(message);
    });
  }

  private fail(error: Error): void {
    if (this._failure) return;
    this._failure = error;
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
    this.outstandingByKey.clear();
  }
}
