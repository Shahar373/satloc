import { describe, expect, it } from 'vitest';
import type { DomainEvent, OperatorAction, RunControlEvent } from '../../contracts/events';
import { EventLog } from './EventLog';

const EPOCH = new Date('2026-09-01T12:00:00.000Z');
const NOW = new Date('2026-09-07T00:00:00.000Z');

describe('EventLog', () => {
  it('assigns contiguous globalSequence and a fresh recordId per append', () => {
    const log = new EventLog(() => NOW);
    const started: RunControlEvent = { type: 'SimulationStarted@1', scenarioId: 's1', seed: 'seed' };
    const a = log.append({ stream: 'run-control', event: started, simTime: EPOCH });
    const b = log.append({ stream: 'run-control', event: started, simTime: EPOCH });

    expect(a.globalSequence).toBe(1);
    expect(b.globalSequence).toBe(2);
    expect(a.recordId).not.toBe(b.recordId);
    expect(log.records).toHaveLength(2);
  });

  it('stamps recordedAt from the injected clock and simTime from the caller', () => {
    const log = new EventLog(() => NOW);
    const started: RunControlEvent = { type: 'SimulationStarted@1', scenarioId: 's1', seed: 'seed' };
    const record = log.append({ stream: 'run-control', event: started, simTime: EPOCH });

    expect(record.recordedAt).toBe(NOW.toISOString());
    expect(record.simTime).toBe(EPOCH.toISOString());
  });

  it('accepts a well-formed causedBy chain', () => {
    const log = new EventLog(() => NOW);
    const submitted: OperatorAction = { type: 'CommandSubmitted@1', commandId: 'cmd-1', taskId: 'task-1' };
    const accepted: DomainEvent = { type: 'CommandAccepted@1', commandId: 'cmd-1', taskId: 'task-1' };
    const op = log.append({ stream: 'operator', event: submitted, simTime: EPOCH });
    const domain = log.append({
      stream: 'domain',
      event: accepted,
      simTime: EPOCH,
      causedBy: { recordId: op.recordId, globalSequence: op.globalSequence },
    });

    expect(domain.causedBy).toEqual({ recordId: op.recordId, globalSequence: op.globalSequence });
  });

  it('rejects (and does not append) a causedBy pointing at a nonexistent record', () => {
    const log = new EventLog(() => NOW);
    const accepted: DomainEvent = { type: 'CommandAccepted@1', commandId: 'cmd-1', taskId: 'task-1' };
    expect(() =>
      log.append({
        stream: 'domain',
        event: accepted,
        simTime: EPOCH,
        causedBy: { recordId: 'nonexistent', globalSequence: 1 },
      }),
    ).toThrow(/does not exist/);
    expect(log.records).toHaveLength(0);
  });

  it('rejects (and does not append) a domain record whose simTime precedes the previous domain record', () => {
    const log = new EventLog(() => NOW);
    const taskStarted: DomainEvent = { type: 'TaskStarted@1', taskId: 'task-1' };
    log.append({ stream: 'domain', event: taskStarted, simTime: EPOCH });
    expect(() =>
      log.append({ stream: 'domain', event: taskStarted, simTime: new Date(EPOCH.getTime() - 1000) }),
    ).toThrow(/before the previous domain record/);
    expect(log.records).toHaveLength(1); // the rejected append left no trace
  });

  it('allows a non-domain record to move simTime backward (a seek)', () => {
    const log = new EventLog(() => NOW);
    const taskStarted: DomainEvent = { type: 'TaskStarted@1', taskId: 'task-1' };
    const seeked: RunControlEvent = { type: 'SimulationSeeked@1', toSimTime: EPOCH.toISOString() };
    log.append({ stream: 'domain', event: taskStarted, simTime: EPOCH });
    expect(() =>
      log.append({ stream: 'run-control', event: seeked, simTime: new Date(EPOCH.getTime() - 3_600_000) }),
    ).not.toThrow();
    expect(log.records).toHaveLength(2);
  });

  it('records is read-only from the outside (a live view, not a mutable handle)', () => {
    const log = new EventLog(() => NOW);
    const started: RunControlEvent = { type: 'SimulationStarted@1', scenarioId: 's1', seed: 'seed' };
    log.append({ stream: 'run-control', event: started, simTime: EPOCH });
    const snapshot = log.records;
    log.append({ stream: 'run-control', event: started, simTime: EPOCH });
    // `snapshot` is the same underlying array reference, so it reflects the new length —
    // the guarantee is the *type* (readonly), not an immutable copy per call.
    expect(snapshot).toHaveLength(2);
  });
});
