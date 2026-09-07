import { beforeEach, describe, expect, it } from 'vitest';
import { SESSION_SCHEMA_VERSION, type EventEnvelope, type SessionFile } from '../../contracts/envelope';
import type { DomainEvent } from '../../contracts/events';
import { getKeyValueStore } from '../../platform/kv';
import { SessionLoadError, SessionStore } from './SessionStore';

function record(globalSequence: number, simTime: string): EventEnvelope<DomainEvent> {
  return {
    recordId: `rec-${globalSequence}`,
    globalSequence,
    recordedAt: '2026-09-07T00:00:00.000Z',
    simTime,
    stream: 'domain',
    event: { type: 'TaskStarted@1', taskId: 'task-1' },
  };
}

function session(overrides: Partial<SessionFile> = {}): SessionFile {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId: 'session-1',
    scenarioId: 'scenario-01',
    scenarioHash: 'abc123',
    seed: 'seed',
    createdAt: '2026-09-07T00:00:00.000Z',
    records: [record(1, '2026-09-01T12:00:00.000Z')],
    ...overrides,
  };
}

describe('SessionStore', () => {
  beforeEach(async () => {
    await getKeyValueStore('session-store-test').clear();
  });

  it('returns null for a session that was never saved', async () => {
    const store = new SessionStore(getKeyValueStore('session-store-test'));
    await expect(store.load('nonexistent')).resolves.toBeNull();
  });

  it('round-trips a saved session unchanged', async () => {
    const store = new SessionStore(getKeyValueStore('session-store-test'));
    const original = session();
    await store.save(original);

    await expect(store.load('session-1')).resolves.toEqual(original);
  });

  it('list() reports saved session ids, delete() removes them', async () => {
    const store = new SessionStore(getKeyValueStore('session-store-test'));
    await store.save(session({ sessionId: 'session-a' }));
    await store.save(session({ sessionId: 'session-b' }));

    expect((await store.list()).sort()).toEqual(['session-a', 'session-b']);

    await store.delete('session-a');
    expect(await store.list()).toEqual(['session-b']);
  });

  it('rejects a stored value that is not a recognisable SessionFile', async () => {
    const kv = getKeyValueStore('session-store-test');
    await kv.set('bad', { not: 'a session' });
    const store = new SessionStore(kv);

    await expect(store.load('bad')).rejects.toThrow(SessionLoadError);
  });

  it('rejects a session whose records violate validateSessionRecords', async () => {
    const kv = getKeyValueStore('session-store-test');
    const invalid = session({
      records: [record(1, '2026-09-01T12:00:10.000Z'), record(2, '2026-09-01T12:00:05.000Z')], // domain simTime decreases
    });
    await kv.set('invalid', invalid);
    const store = new SessionStore(kv);

    await expect(store.load('invalid')).rejects.toThrow(/before the previous domain record/);
  });

  it('rejects a schemaVersion with no registered migration', async () => {
    const kv = getKeyValueStore('session-store-test');
    // A deliberately invalid fixture (SessionFile.schemaVersion is pinned to the literal current
    // version, so this can only be constructed by widening the type, not through session()'s
    // normal typed overrides).
    const tooOld: unknown = { ...session(), schemaVersion: 0 };
    await kv.set('too-old', tooOld);
    const store = new SessionStore(kv);

    await expect(store.load('too-old')).rejects.toThrow(/no migration to 1 is registered/);
  });
});
