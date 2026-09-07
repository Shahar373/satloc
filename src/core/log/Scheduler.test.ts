import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../contracts/events';
import { EventLog } from './EventLog';
import { Scheduler } from './Scheduler';

const EPOCH = new Date('2026-09-01T12:00:00.000Z');
const NOW = new Date('2026-09-07T00:00:00.000Z');
const at = (offsetS: number) => new Date(EPOCH.getTime() + offsetS * 1000);

const taskStarted = (taskId: string): DomainEvent => ({ type: 'TaskStarted@1', taskId });

/** Narrows a DomainEvent to its taskId without an unsafe cast — every event this test schedules is a TaskStarted@1. */
function taskIdOf(event: DomainEvent): string {
  if (event.type !== 'TaskStarted@1') throw new Error(`expected TaskStarted@1, got ${event.type}`);
  return event.taskId;
}

describe('Scheduler', () => {
  it("fires nothing before an event's scheduled time", () => {
    const log = new EventLog(() => NOW);
    const scheduler = new Scheduler(log, EPOCH);
    scheduler.schedule(at(60), taskStarted('task-1'));

    const fired = scheduler.advanceTo(at(30));
    expect(fired).toHaveLength(0);
    expect(log.records).toHaveLength(0);
    expect(scheduler.pendingCount).toBe(1);
  });

  it('fires an event once its scheduled time is reached, appending it to the log', () => {
    const log = new EventLog(() => NOW);
    const scheduler = new Scheduler(log, EPOCH);
    scheduler.schedule(at(60), taskStarted('task-1'));

    const fired = scheduler.advanceTo(at(60));
    expect(fired).toHaveLength(1);
    expect(fired[0]!.event).toEqual(taskStarted('task-1'));
    expect(fired[0]!.simTime).toBe(at(60).toISOString());
    expect(log.records).toHaveLength(1);
    expect(scheduler.pendingCount).toBe(0);
  });

  it('does not re-fire an event on a later advanceTo() call', () => {
    const log = new EventLog(() => NOW);
    const scheduler = new Scheduler(log, EPOCH);
    scheduler.schedule(at(60), taskStarted('task-1'));

    scheduler.advanceTo(at(60));
    const secondFired = scheduler.advanceTo(at(120));
    expect(secondFired).toHaveLength(0);
    expect(log.records).toHaveLength(1);
  });

  it('fires multiple due events in (simTime, schedule order), not schedule order alone', () => {
    const log = new EventLog(() => NOW);
    const scheduler = new Scheduler(log, EPOCH);
    scheduler.schedule(at(60), taskStarted('scheduled-second-fires-second'));
    scheduler.schedule(at(30), taskStarted('scheduled-first-fires-first'));

    const fired = scheduler.advanceTo(at(60));
    expect(fired.map((f) => taskIdOf(f.event))).toEqual([
      'scheduled-first-fires-first',
      'scheduled-second-fires-second',
    ]);
  });

  it('breaks a tie at the same simTime by schedule order', () => {
    const log = new EventLog(() => NOW);
    const scheduler = new Scheduler(log, EPOCH);
    scheduler.schedule(at(60), taskStarted('first'));
    scheduler.schedule(at(60), taskStarted('second'));

    const fired = scheduler.advanceTo(at(60));
    expect(fired.map((f) => taskIdOf(f.event))).toEqual(['first', 'second']);
  });

  it('a call with an earlier simTime than the last is a no-op, not a rewind', () => {
    const log = new EventLog(() => NOW);
    const scheduler = new Scheduler(log, EPOCH);
    scheduler.schedule(at(60), taskStarted('task-1'));
    scheduler.advanceTo(at(90));

    const rewound = scheduler.advanceTo(at(45));
    expect(rewound).toHaveLength(0);
    expect(scheduler.pendingCount).toBe(0); // the already-fired event was not requeued
  });

  it('passes causedBy through to the appended envelope', () => {
    const log = new EventLog(() => NOW);
    const scheduler = new Scheduler(log, EPOCH);
    // A real prior record, so causedBy can legitimately point backward at it.
    const priorRecord = log.append({
      stream: 'operator',
      event: { type: 'CommandSubmitted@1', commandId: 'cmd-1', taskId: 'task-1' },
      simTime: EPOCH,
    });
    const causedBy = { recordId: priorRecord.recordId, globalSequence: priorRecord.globalSequence };
    scheduler.schedule(at(60), taskStarted('task-1'), causedBy);

    const fired = scheduler.advanceTo(at(60));
    expect(fired[0]!.globalSequence).toBeGreaterThan(priorRecord.globalSequence);
    expect(fired[0]!.causedBy).toEqual(causedBy);
  });
});
