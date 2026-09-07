import { describe, expect, it } from 'vitest';
import { ASTERIA_1_SCENARIO } from '../../contracts/asteria1';
import { domainRecords, runControlRecords } from '../../contracts/envelope';
import type { ScenarioDefinition } from '../../contracts/scenario';
import { InvalidScenarioError, ScenarioRunner } from './ScenarioRunner';

const NOW = new Date('2026-09-07T00:00:00.000Z');

describe('ScenarioRunner', () => {
  it('refuses to start an inconsistent scenario rather than beginning a broken run', () => {
    const broken: ScenarioDefinition = { ...ASTERIA_1_SCENARIO, groundStations: [] };
    expect(() => new ScenarioRunner(broken, 'seed-1')).toThrow(InvalidScenarioError);
  });

  it('logs a SimulationStarted@1 run-control record at construction, at the scenario start time', () => {
    const runner = new ScenarioRunner(ASTERIA_1_SCENARIO, 'seed-1', () => NOW);
    const runControl = runControlRecords(runner.log.records);
    expect(runControl).toHaveLength(1);
    expect(runControl[0]!.event).toEqual({
      type: 'SimulationStarted@1',
      scenarioId: ASTERIA_1_SCENARIO.id,
      seed: 'seed-1',
    });
    expect(runControl[0]!.simTime).toBe(ASTERIA_1_SCENARIO.startTime);
  });

  it('the clock starts at the scenario start time', () => {
    const runner = new ScenarioRunner(ASTERIA_1_SCENARIO, 'seed-1', () => NOW);
    expect(runner.clock.simTime.toISOString()).toBe(ASTERIA_1_SCENARIO.startTime);
  });

  it('truth starts empty (only a run-control record exists, no domain events yet)', () => {
    const runner = new ScenarioRunner(ASTERIA_1_SCENARIO, 'seed-1', () => NOW);
    expect(runner.truth.taskStatus).toEqual({});
    expect(runner.truth.storageUsedGB).toBe(0);
  });

  it('schedule() + advance() fires a domain event once the clock reaches it, and truth reflects it', () => {
    const runner = new ScenarioRunner(ASTERIA_1_SCENARIO, 'seed-1', () => NOW);
    const start = new Date(ASTERIA_1_SCENARIO.startTime);
    runner.schedule(new Date(start.getTime() + 60_000), { type: 'TaskStarted@1', taskId: 'task-1' });

    const firedTooEarly = runner.advance(30_000); // 30s: not due yet
    expect(firedTooEarly).toHaveLength(0);
    expect(runner.truth.taskStatus['task-1']).toBeUndefined();

    const fired = runner.advance(30_000); // another 30s: now at 60s, due
    expect(fired).toHaveLength(1);
    expect(fired[0]!.event).toEqual({ type: 'TaskStarted@1', taskId: 'task-1' });
    expect(runner.truth.taskStatus['task-1']).toBe('active');
  });

  it('advance() moves the clock by realElapsedMs * multiplier, not always 1:1', () => {
    const runner = new ScenarioRunner(ASTERIA_1_SCENARIO, 'seed-1', () => NOW);
    runner.clock.setMultiplier(60); // 60x acceleration
    runner.advance(1000); // 1 real second -> 60 sim seconds
    const start = new Date(ASTERIA_1_SCENARIO.startTime);
    expect(runner.clock.simTime.getTime()).toBe(start.getTime() + 60_000);
  });

  it('the log accumulates real, valid records — domainRecords/runControlRecords stay in sync with what actually ran', () => {
    const runner = new ScenarioRunner(ASTERIA_1_SCENARIO, 'seed-1', () => NOW);
    const start = new Date(ASTERIA_1_SCENARIO.startTime);
    runner.schedule(new Date(start.getTime() + 10_000), { type: 'TaskStarted@1', taskId: 'task-1' });
    runner.schedule(new Date(start.getTime() + 20_000), {
      type: 'TaskCompleted@1',
      taskId: 'task-1',
      outcome: 'success',
    });
    runner.advance(25_000);

    expect(domainRecords(runner.log.records)).toHaveLength(2);
    expect(runner.log.records).toHaveLength(3); // 1 run-control + 2 domain
    expect(runner.truth.taskStatus['task-1']).toBe('completed');
  });
});
