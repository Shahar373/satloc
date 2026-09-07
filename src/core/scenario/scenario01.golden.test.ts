import { describe, expect, it } from 'vitest';
import { ASTERIA_1_SCENARIO, ASTERIA_1_TLE, generateUlid } from '../../contracts';
import { canonicalDomainHash, canonicalDomainProjection } from '../replay/canonicalDomain';
import { tleToElementSet } from '../tle/omm';
import { buildRealDemoTimeline } from './realDemoTimeline';
import { ScenarioRunner } from './ScenarioRunner';

// Comfortably longer than the real timeline's last event (see realDemoTimeline.ts) — advanced in
// one bulk call (multiplier defaults to 1, so this is simulated ms) to replay the whole run.
const ADVANCE_MS = 5 * 24 * 60 * 60 * 1000;

function runScenario01ToCompletion(seed: string): ScenarioRunner {
  const { satrec } = tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name);
  const runner = new ScenarioRunner(ASTERIA_1_SCENARIO, seed);
  const timeline = buildRealDemoTimeline(satrec, new Date(ASTERIA_1_SCENARIO.startTime));
  for (const { simTime, event } of timeline) runner.schedule(simTime, event);
  runner.advance(ADVANCE_MS);
  return runner;
}

/**
 * A deterministic, end-to-end replay of Scenario 01's real demo timeline (the same real orbital
 * geometry `TrainV2`/`DebriefV2` run) — every event is recomputed from the real Asteria-1 TLE and
 * scheduled/applied through the real `ScenarioRunner`/`TruthState` pipeline, then reduced to a
 * `canonicalDomainHash` (`src/core/replay/canonicalDomain.ts`) so a run can be compared byte-for-
 * byte against another run or against a locked-in value, per docs/design/operator-simulation.md's
 * "EventLog determinism" note (plan §6: canonical hash of the domain projection).
 */
describe('Scenario 01 golden replay (semantic determinism)', () => {
  it('is deterministic: two independent runs (different seeds/ULIDs/wall-clock times) produce a byte-identical canonical domain projection', () => {
    const runA = runScenario01ToCompletion(generateUlid());
    const runB = runScenario01ToCompletion(generateUlid());

    expect(canonicalDomainProjection(runA.log.records)).toEqual(canonicalDomainProjection(runB.log.records));
    expect(canonicalDomainHash(runA.log.records)).toBe(canonicalDomainHash(runB.log.records));
  });

  it('golden regression: locks in the current canonical hash for Scenario 01s real demo timeline', () => {
    // Golden Regression per CONTRIBUTING.md's "Testing orbital, RF, and simulation logic": no
    // independent oracle for "the right event log" exists, so this proves stability of the whole
    // Scenario 01 pipeline (SGP4 geometry + scheduling + Truth reducer together) — a failure here
    // means something in that pipeline actually changed, intentionally or not, not that a bug was
    // freshly introduced by this test.
    const runner = runScenario01ToCompletion(generateUlid());
    expect(canonicalDomainHash(runner.log.records)).toBe('97daf2e9');
  });
});
