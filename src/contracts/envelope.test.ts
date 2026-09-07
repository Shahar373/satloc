import { describe, expect, it } from 'vitest';
import {
  domainRecords,
  operatorRecords,
  runControlRecords,
  validateSessionRecords,
  type EventEnvelope,
} from './envelope';
import type { DomainEvent, OperatorAction, RunControlEvent } from './events';

function envelope(
  overrides: Partial<EventEnvelope> & Pick<EventEnvelope, 'globalSequence' | 'stream' | 'event'>,
): EventEnvelope {
  return {
    recordId: `rec-${overrides.globalSequence}`,
    recordedAt: '2026-09-07T12:00:00.000Z',
    simTime: '2026-09-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('validateSessionRecords', () => {
  it('accepts an empty log', () => {
    expect(validateSessionRecords([])).toEqual([]);
  });

  it('accepts a well-formed causal chain: OperatorAction -> DomainEvent', () => {
    const submitted: OperatorAction = { type: 'CommandSubmitted@1', commandId: 'cmd-1', taskId: 'task-1' };
    const accepted: DomainEvent = { type: 'CommandAccepted@1', commandId: 'cmd-1', taskId: 'task-1' };
    const records: EventEnvelope[] = [
      envelope({ globalSequence: 1, stream: 'operator', event: submitted }),
      envelope({
        globalSequence: 2,
        stream: 'domain',
        event: accepted,
        causedBy: { recordId: 'rec-1', globalSequence: 1 },
      }),
    ];
    expect(validateSessionRecords(records)).toEqual([]);
  });

  it('rejects a gap in globalSequence', () => {
    const started: RunControlEvent = { type: 'SimulationStarted@1', scenarioId: 's1', seed: 'seed' };
    const records: EventEnvelope[] = [
      envelope({ globalSequence: 1, stream: 'run-control', event: started }),
      envelope({ globalSequence: 3, stream: 'run-control', event: started }),
    ];
    const violations = validateSessionRecords(records);
    expect(violations.some((v) => v.includes('globalSequence 3, expected 2'))).toBe(true);
  });

  it('rejects causedBy pointing forward', () => {
    const started: RunControlEvent = { type: 'SimulationStarted@1', scenarioId: 's1', seed: 'seed' };
    const records: EventEnvelope[] = [
      envelope({
        globalSequence: 1,
        stream: 'run-control',
        event: started,
        causedBy: { recordId: 'rec-2', globalSequence: 2 },
      }),
      envelope({ globalSequence: 2, stream: 'run-control', event: started }),
    ];
    const violations = validateSessionRecords(records);
    expect(violations.some((v) => v.includes('must be less than'))).toBe(true);
  });

  it('rejects causedBy pointing at a nonexistent record', () => {
    const started: RunControlEvent = { type: 'SimulationStarted@1', scenarioId: 's1', seed: 'seed' };
    const records: EventEnvelope[] = [
      envelope({ globalSequence: 1, stream: 'run-control', event: started }),
      envelope({
        globalSequence: 2,
        stream: 'run-control',
        event: started,
        causedBy: { recordId: 'rec-999', globalSequence: 1 },
      }),
    ];
    const violations = validateSessionRecords(records);
    expect(violations.some((v) => v.includes('does not exist'))).toBe(true);
  });

  it('rejects simTime decreasing between consecutive domain records', () => {
    const taskStarted: DomainEvent = { type: 'TaskStarted@1', taskId: 'task-1' };
    const records: EventEnvelope[] = [
      envelope({ globalSequence: 1, stream: 'domain', event: taskStarted, simTime: '2026-09-01T12:00:10.000Z' }),
      envelope({ globalSequence: 2, stream: 'domain', event: taskStarted, simTime: '2026-09-01T12:00:05.000Z' }),
    ];
    const violations = validateSessionRecords(records);
    expect(violations.some((v) => v.includes('before the previous domain record'))).toBe(true);
  });

  it('allows simTime to go backward on run-control/operator records (a seek), just not domain records', () => {
    const seeked: RunControlEvent = { type: 'SimulationSeeked@1', toSimTime: '2026-09-01T11:00:00.000Z' };
    const taskStarted: DomainEvent = { type: 'TaskStarted@1', taskId: 'task-1' };
    const records: EventEnvelope[] = [
      envelope({ globalSequence: 1, stream: 'domain', event: taskStarted, simTime: '2026-09-01T12:00:00.000Z' }),
      envelope({ globalSequence: 2, stream: 'run-control', event: seeked, simTime: '2026-09-01T11:00:00.000Z' }),
      envelope({ globalSequence: 3, stream: 'domain', event: taskStarted, simTime: '2026-09-01T11:00:00.000Z' }),
    ];
    // The 3rd record's simTime (11:00) is before the 1st domain record's (12:00) — that's still a
    // violation, since domain simTime must never decrease; only non-domain streams may go backward.
    expect(validateSessionRecords(records).length).toBeGreaterThan(0);
  });
});

describe('stream projections', () => {
  it('filter records by stream without mutating or reordering them', () => {
    const submitted: OperatorAction = { type: 'CommandSubmitted@1', commandId: 'cmd-1', taskId: 'task-1' };
    const accepted: DomainEvent = { type: 'CommandAccepted@1', commandId: 'cmd-1', taskId: 'task-1' };
    const started: RunControlEvent = { type: 'SimulationStarted@1', scenarioId: 's1', seed: 'seed' };
    const records: EventEnvelope[] = [
      envelope({ globalSequence: 1, stream: 'run-control', event: started }),
      envelope({ globalSequence: 2, stream: 'operator', event: submitted }),
      envelope({ globalSequence: 3, stream: 'domain', event: accepted }),
    ];
    expect(domainRecords(records).map((r) => r.globalSequence)).toEqual([3]);
    expect(operatorRecords(records).map((r) => r.globalSequence)).toEqual([2]);
    expect(runControlRecords(records).map((r) => r.globalSequence)).toEqual([1]);
  });
});
