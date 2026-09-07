import { describe, expect, it } from 'vitest';
import type { EventEnvelope } from '../../contracts/envelope';
import { canonicalDomainHash, canonicalDomainProjection } from './canonicalDomain';

function record(overrides: Partial<EventEnvelope>): EventEnvelope {
  return {
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    globalSequence: 1,
    recordedAt: '2026-01-01T00:00:00.000Z',
    simTime: '2026-01-01T00:00:00.000Z',
    stream: 'domain',
    event: { type: 'TaskStarted@1', taskId: 'task-1' },
    ...overrides,
  };
}

describe('canonicalDomainProjection', () => {
  it('keeps only the domain stream, renumbered 1..n within that stream alone', () => {
    const records: EventEnvelope[] = [
      record({
        globalSequence: 1,
        stream: 'run-control',
        event: { type: 'SimulationStarted@1', scenarioId: 's', seed: 'x' },
      }),
      record({ globalSequence: 2, event: { type: 'TaskStarted@1', taskId: 'task-1' } }),
      record({
        globalSequence: 3,
        stream: 'operator',
        event: { type: 'CommandSubmitted@1', commandId: 'c', taskId: 'task-1' },
      }),
      record({ globalSequence: 4, event: { type: 'TaskCompleted@1', taskId: 'task-1', outcome: 'success' } }),
    ];
    const projection = canonicalDomainProjection(records);
    expect(projection).toEqual([
      { sequence: 1, simTime: '2026-01-01T00:00:00.000Z', event: { type: 'TaskStarted@1', taskId: 'task-1' } },
      {
        sequence: 2,
        simTime: '2026-01-01T00:00:00.000Z',
        event: { type: 'TaskCompleted@1', taskId: 'task-1', outcome: 'success' },
      },
    ]);
  });

  it('drops recordId/recordedAt and renumbers sequence, so two runs with different ids/wall-clock times project identically', () => {
    const runA = [record({ recordId: 'A', recordedAt: '2026-01-01T00:00:00.000Z', globalSequence: 5 })];
    const runB = [record({ recordId: 'B', recordedAt: '2099-12-31T23:59:59.999Z', globalSequence: 999 })];
    expect(canonicalDomainProjection(runA)).toEqual(canonicalDomainProjection(runB));
  });
});

describe('canonicalDomainHash', () => {
  it('is identical for two structurally-equivalent runs that differ only in id/wall-clock metadata', () => {
    const runA = [record({ recordId: 'A', recordedAt: '2026-01-01T00:00:00.000Z' })];
    const runB = [record({ recordId: 'B', recordedAt: '2099-12-31T23:59:59.999Z' })];
    expect(canonicalDomainHash(runA)).toBe(canonicalDomainHash(runB));
  });

  it('changes when the actual domain content differs', () => {
    const runA = [record({ event: { type: 'TaskStarted@1', taskId: 'task-1' } })];
    const runB = [record({ event: { type: 'TaskStarted@1', taskId: 'task-2' } })];
    expect(canonicalDomainHash(runA)).not.toBe(canonicalDomainHash(runB));
  });

  it('is an 8-character lowercase hex string', () => {
    expect(canonicalDomainHash([record({})])).toMatch(/^[0-9a-f]{8}$/);
  });
});
