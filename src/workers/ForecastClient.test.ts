import { describe, expect, it, vi } from 'vitest';
import { ForecastClient, SupersededError, type WorkerLike } from './ForecastClient';
import type { ForecastRequest, ForecastResponse } from './forecastProtocol';

/** A fake WorkerLike whose "computation" is driven manually by the test via `reply()`/`fail()`, instead of a real worker thread. */
function fakeWorker() {
  const sent: ForecastRequest[] = [];
  const worker: WorkerLike = {
    postMessage: (message) => sent.push(message as ForecastRequest),
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    terminate: vi.fn(),
  };
  return {
    worker,
    sent,
    reply(response: ForecastResponse) {
      worker.onmessage?.({ data: response } as MessageEvent<ForecastResponse>);
    },
    error(message: string) {
      worker.onerror?.({ message } as ErrorEvent);
    },
  };
}

const OBSERVER = { latitude: 0.5, longitude: 0.6, heightKm: 0 };
const ELEMENT = { source: 'tle' as const, tle: { noradId: 1, name: 'X', line1: 'l1', line2: 'l2' } };
const START = new Date('2026-09-01T00:00:00.000Z');

describe('ForecastClient', () => {
  it('sends a passes request and resolves with the reply', async () => {
    const { worker, sent, reply } = fakeWorker();
    const client = new ForecastClient(worker);

    const promise = client.passes('sat-1', ELEMENT, OBSERVER, START, 24);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'passes', requestId: 1, observer: OBSERVER, startMs: START.getTime() });

    reply({ type: 'passes', requestId: 1, passes: [] });
    await expect(promise).resolves.toEqual([]);
  });

  it('caches by logical key: a second identical request never reaches the worker', async () => {
    const { worker, sent, reply } = fakeWorker();
    const client = new ForecastClient(worker);

    const first = client.passes('sat-1', ELEMENT, OBSERVER, START, 24);
    reply({ type: 'passes', requestId: 1, passes: [] });
    await first;

    const second = client.passes('sat-1', ELEMENT, OBSERVER, START, 24);
    expect(sent).toHaveLength(1); // no new postMessage
    await expect(second).resolves.toEqual([]);
  });

  it("a different logical key (different hours) is not served from the other key's cache", async () => {
    const { worker, sent, reply } = fakeWorker();
    const client = new ForecastClient(worker);

    const first = client.passes('sat-1', ELEMENT, OBSERVER, START, 24);
    reply({ type: 'passes', requestId: 1, passes: [] });
    await first;

    const differentHours = client.passes('sat-1', ELEMENT, OBSERVER, START, 48);
    expect(sent).toHaveLength(2);
    reply({ type: 'passes', requestId: 2, passes: [] });
    await expect(differentHours).resolves.toEqual([]);
  });

  it('a new request for the same key rejects the superseded one with SupersededError', async () => {
    const { worker, sent, reply } = fakeWorker();
    const client = new ForecastClient(worker);

    const stale = client.passes('sat-1', ELEMENT, OBSERVER, START, 24);
    const fresh = client.passes('sat-1', ELEMENT, OBSERVER, START, 24);
    expect(sent).toHaveLength(2);

    await expect(stale).rejects.toBeInstanceOf(SupersededError);

    // The stale reply arriving late is discarded, not resolved onto anything.
    reply({ type: 'passes', requestId: 1, passes: [{ aos: START } as never] });
    reply({ type: 'passes', requestId: 2, passes: [] });
    await expect(fresh).resolves.toEqual([]);
  });

  it('a worker error response rejects only that request', async () => {
    const { worker, reply } = fakeWorker();
    const client = new ForecastClient(worker);

    const promise = client.passes('sat-1', ELEMENT, OBSERVER, START, 24);
    reply({ type: 'error', requestId: 1, message: 'SGP4 initialisation failed' });
    await expect(promise).rejects.toThrow('SGP4 initialisation failed');
  });

  it('a worker-level failure rejects every pending request and future calls', async () => {
    const { worker, error } = fakeWorker();
    const client = new ForecastClient(worker);

    const promise = client.passes('sat-1', ELEMENT, OBSERVER, START, 24);
    error('crashed');
    await expect(promise).rejects.toThrow('The forecast worker failed: crashed');
    expect(client.failure).not.toBeNull();

    await expect(client.passes('sat-1', ELEMENT, OBSERVER, START, 24)).rejects.toThrow();
  });

  it("invalidate() drops only the named satellite's cache entries", async () => {
    const { worker, sent, reply } = fakeWorker();
    const client = new ForecastClient(worker);

    const firstSat1 = client.passes('sat-1', ELEMENT, OBSERVER, START, 24);
    reply({ type: 'passes', requestId: 1, passes: [] });
    await firstSat1;
    const firstSat2 = client.passes('sat-2', ELEMENT, OBSERVER, START, 24);
    reply({ type: 'passes', requestId: 2, passes: [] });
    await firstSat2;
    expect(sent).toHaveLength(2);

    client.invalidate('sat-1');

    const refetched = client.passes('sat-1', ELEMENT, OBSERVER, START, 24); // re-fetched
    expect(sent).toHaveLength(3);
    reply({ type: 'passes', requestId: 3, passes: [] });
    await refetched;
    await client.passes('sat-2', ELEMENT, OBSERVER, START, 24); // still cached
    expect(sent).toHaveLength(3);
  });

  it('clearCache() drops every cached result', async () => {
    const { worker, sent, reply } = fakeWorker();
    const client = new ForecastClient(worker);

    const first = client.passes('sat-1', ELEMENT, OBSERVER, START, 24);
    reply({ type: 'passes', requestId: 1, passes: [] });
    await first;
    client.clearCache();

    const second = client.passes('sat-1', ELEMENT, OBSERVER, START, 24);
    reply({ type: 'passes', requestId: 2, passes: [] });
    await second;
    expect(sent).toHaveLength(2);
  });
});
