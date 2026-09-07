import { describe, expect, it } from 'vitest';
import { ASTERIA_1_PROFILE, ASTERIA_1_SCENARIO, ASTERIA_1_TLE, generateUlid } from '../../contracts';
import { tleToElementSet } from '../tle/omm';
import { buildRealDemoTimeline } from '../scenario/realDemoTimeline';
import { ScenarioRunner } from '../scenario/ScenarioRunner';
import { buildDebriefTimeline } from './debriefTimeline';

describe('buildDebriefTimeline', () => {
  // Runs the same real geometry-driven Scenario 01 schedule TrainV2 runs live (buildRealDemoTimeline
  // against the real Asteria-1 TLE/target/station), advanced to completion in one bulk call, so
  // this is verified against real orbital timing rather than fabricated event times.
  function runRealDemoToCompletion() {
    const { satrec } = tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name);
    const runner = new ScenarioRunner(ASTERIA_1_SCENARIO, generateUlid());
    const timeline = buildRealDemoTimeline(satrec, new Date(ASTERIA_1_SCENARIO.startTime));
    for (const { simTime, event } of timeline) runner.schedule(simTime, event);
    runner.advance(5 * 24 * 60 * 60 * 1000);
    return runner;
  }

  it('produces one row per real domain event, in order', () => {
    const runner = runRealDemoToCompletion();
    const rows = buildDebriefTimeline(runner.log.records, ASTERIA_1_PROFILE);

    expect(rows.map((row) => row.event.type)).toEqual([
      'TaskStarted@1',
      'DataProductStored@1',
      'TaskCompleted@1',
      'ContactAcquired@1',
      'TaskStarted@1',
      'DownlinkCompleted@1',
      'TaskCompleted@1',
      'ContactLost@1',
    ]);
    // Rows are non-decreasing in simTime — the same invariant validateSessionRecords enforces on
    // the domain stream itself (see contracts/envelope.ts), reflected here in the derived rows.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].simTime.getTime()).toBeGreaterThanOrEqual(rows[i - 1].simTime.getTime());
    }
  });

  it('shows the real Truth State / Operator Observables lag at ContactAcquired, resolved by DownlinkCompleted', () => {
    const runner = runRealDemoToCompletion();
    const rows = buildDebriefTimeline(runner.log.records, ASTERIA_1_PROFILE);

    const acquiredRow = rows.find((row) => row.event.type === 'ContactAcquired@1');
    expect(acquiredRow?.truth.activeContactIds).toEqual(['contact-1']);
    // The real acquisitionS-second lock-on delay means the contact isn't confirmed yet at the
    // exact instant it's acquired — this is the divergence the Debrief UI's "Lag" pill flags.
    expect(acquiredRow?.observables.confirmedContactIds).toEqual([]);

    const downlinkRow = rows.find((row) => row.event.type === 'DownlinkCompleted@1');
    expect(downlinkRow?.truth.activeContactIds).toEqual(['contact-1']);
    expect(downlinkRow?.observables.confirmedContactIds).toEqual(['contact-1']);

    const lastRow = rows.at(-1);
    expect(lastRow?.event.type).toBe('ContactLost@1');
    expect(lastRow?.truth.activeContactIds).toEqual([]);
    expect(lastRow?.observables.confirmedContactIds).toEqual([]);
  });

  it('folds storage across the real capture/downlink cycle', () => {
    const runner = runRealDemoToCompletion();
    const rows = buildDebriefTimeline(runner.log.records, ASTERIA_1_PROFILE);

    const storedRow = rows.find((row) => row.event.type === 'DataProductStored@1');
    expect(storedRow?.truth.storageUsedGB).toBe(1.2);

    const lastRow = rows.at(-1);
    expect(lastRow?.truth.storageUsedGB).toBe(0);
  });

  it('returns no rows for a record set with no domain events', () => {
    expect(buildDebriefTimeline([], ASTERIA_1_PROFILE)).toEqual([]);
  });
});
