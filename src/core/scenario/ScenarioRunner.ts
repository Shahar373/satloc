import { domainRecords, type CausedBy, type EventEnvelope } from '../../contracts/envelope';
import type { DomainEvent } from '../../contracts/events';
import { checkScenarioConsistency, type ScenarioDefinition } from '../../contracts/scenario';
import { SimulationClock } from '../clock/SimulationClock';
import { EventLog } from '../log/EventLog';
import { Scheduler } from '../log/Scheduler';
import { foldTruthState, type TruthState } from '../truth/TruthState';

export class InvalidScenarioError extends Error {
  constructor(scenarioId: string, violations: string[]) {
    super(`Cannot start scenario "${scenarioId}": ${violations.join('; ')}`);
    this.name = 'InvalidScenarioError';
  }
}

/**
 * Wires SimulationClock + EventLog + Scheduler + TruthState together against one
 * `ScenarioDefinition` — the first thing in this codebase to actually run the full Phase C
 * pipeline end to end, rather than exercising each piece in isolation. Still headless: no Cesium
 * viewer, no UI. `ClockAdapter` (src/viewer/ClockAdapter.ts) is the future bridge for when a
 * viewer *is* attached; this class does not know about one.
 *
 * Refuses to start an inconsistent scenario (`checkScenarioConsistency`) rather than beginning a
 * run on top of a broken definition and failing confusingly later.
 */
export class ScenarioRunner {
  readonly clock: SimulationClock;
  readonly log: EventLog;
  private readonly scheduler: Scheduler;

  constructor(scenario: ScenarioDefinition, seed: string, now: () => Date = () => new Date()) {
    const violations = checkScenarioConsistency(scenario);
    if (violations.length > 0) throw new InvalidScenarioError(scenario.id, violations);

    const start = new Date(scenario.startTime);
    this.clock = new SimulationClock(start);
    this.log = new EventLog(now);
    this.scheduler = new Scheduler(this.log, start);
    this.log.append({
      stream: 'run-control',
      event: { type: 'SimulationStarted@1', scenarioId: scenario.id, seed },
      simTime: start,
    });
  }

  /** Queues a DomainEvent to fire once the clock reaches `simTime` (see Scheduler.schedule). */
  schedule(simTime: Date, event: DomainEvent, causedBy?: CausedBy): void {
    this.scheduler.schedule(simTime, event, causedBy);
  }

  /**
   * Advances the clock by `realElapsedMs` (scaled by its multiplier, same as
   * `SimulationClock.advance`) and fires whatever domain events are now due, appending them to
   * the log. Returns the envelopes just appended.
   */
  advance(realElapsedMs: number): EventEnvelope<DomainEvent>[] {
    this.clock.advance(realElapsedMs);
    return this.scheduler.advanceTo(this.clock.simTime);
  }

  /** Current ground truth, folded fresh from the log's domain stream every call — always consistent with `log.records`. */
  get truth(): TruthState {
    return foldTruthState(domainRecords(this.log.records).map((record) => record.event));
  }
}
