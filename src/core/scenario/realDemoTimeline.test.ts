import { describe, expect, it } from 'vitest';
import { ASTERIA_1_PROFILE, ASTERIA_1_SCENARIO, ASTERIA_1_TARGETS, ASTERIA_1_TLE, generateUlid } from '../../contracts';
import { domainRecords } from '../../contracts/envelope';
import { tleToElementSet } from '../tle/omm';
import { findImagingOpportunities } from '../imaging/opportunities';
import type { TargetPoint } from '../imaging/geometry';
import { checkContactTiming } from '../validation/contactTiming';
import { checkImagingWindow } from '../validation/imagingWindow';
import { checkRollLimit } from '../validation/rollLimit';
import { checkStorageBudget } from '../validation/storageBudget';
import { initialTruthState } from '../truth/TruthState';
import { ScenarioRunner } from './ScenarioRunner';
import { buildRealDemoTimeline } from './realDemoTimeline';

const deg2rad = (d: number) => (d * Math.PI) / 180;
const start = new Date(ASTERIA_1_SCENARIO.startTime);

function satrec() {
  return tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name).satrec;
}

describe('buildRealDemoTimeline', () => {
  it('produces a causally sensible, deterministic schedule from real geometry', () => {
    const timeline = buildRealDemoTimeline(satrec(), start);
    expect(timeline).toHaveLength(8);

    const [
      captureStart,
      productStored,
      captureDone,
      contactAcquired,
      downlinkStart,
      downlinkDone,
      downlinkTaskDone,
      contactLost,
    ] = timeline;

    // Capture: started -> product stored (mid-pass) -> completed, in order.
    expect(captureStart.simTime.getTime()).toBeLessThanOrEqual(productStored.simTime.getTime());
    expect(productStored.simTime.getTime()).toBeLessThanOrEqual(captureDone.simTime.getTime());
    expect(captureStart.event.type).toBe('TaskStarted@1');
    expect(productStored.event.type).toBe('DataProductStored@1');
    expect(captureDone.event.type).toBe('TaskCompleted@1');

    // Downlink can't start before the image is captured.
    expect(contactAcquired.simTime.getTime()).toBeGreaterThanOrEqual(captureDone.simTime.getTime());
    // Contact is acquired at or before the downlink command starts, and completes at or before loss.
    expect(contactAcquired.simTime.getTime()).toBeLessThanOrEqual(downlinkStart.simTime.getTime());
    expect(downlinkDone.simTime.getTime()).toBeLessThanOrEqual(contactLost.simTime.getTime());
    expect(downlinkTaskDone.event.type).toBe('TaskCompleted@1');
    expect(contactLost.event.type).toBe('ContactLost@1');

    // Deterministic: the fixed TLE + fixed scenario startTime always finds the same opportunity.
    expect(captureStart.simTime.toISOString()).toBe('2026-09-09T10:55:53.125Z');
  });

  it('throws when the search window is too narrow to find a daylight opportunity', () => {
    expect(() => buildRealDemoTimeline(satrec(), start, { imagingSearchDays: 1 })).toThrow(
      /no daylight imaging opportunity/,
    );
  });

  it('real-integration: the produced schedule runs cleanly through a real ScenarioRunner with zero HardBlock findings from all four Validator rules', () => {
    const rec = satrec();
    const timeline = buildRealDemoTimeline(rec, start);

    const runner = new ScenarioRunner(ASTERIA_1_SCENARIO, generateUlid());
    for (const { simTime, event } of timeline) runner.schedule(simTime, event);
    const lastTime = timeline[timeline.length - 1].simTime;
    runner.advance(lastTime.getTime() - runner.clock.simTime.getTime() + 1000);

    // Truth State reflects a fully completed, clean run.
    expect(runner.truth.taskStatus['capture-1']).toBe('completed');
    expect(runner.truth.taskStatus['downlink-1']).toBe('completed');
    expect(runner.truth.downlinkedDataProductIds).toContain('product-1');
    expect(runner.truth.activeContactIds).toEqual([]);

    // Re-derive the same candidates the schedule was built from and confirm every Validator rule
    // that applies to this run finds nothing wrong — a genuine end-to-end HardBlock-free proof,
    // not just an assumption that "real" geometry must be fine.
    const [asteria1Target] = ASTERIA_1_TARGETS;
    if (!asteria1Target) throw new Error('expected the asteria1 fixture to define an imaging target');
    const target: TargetPoint = {
      latitude: deg2rad(asteria1Target.latitudeDeg),
      longitude: deg2rad(asteria1Target.longitudeDeg),
      heightKm: 0,
    };
    const opportunities = findImagingOpportunities(rec, target, start, 7);
    const opportunity = opportunities.find((o) => o.daylight);
    if (!opportunity) throw new Error('expected a daylight opportunity to exist (buildRealDemoTimeline found one)');

    expect(
      checkRollLimit(ASTERIA_1_PROFILE, {
        taskId: 'capture-1',
        targetId: 'target-1',
        offNadirAngleRad: deg2rad(opportunity.offNadirDeg),
      }),
    ).toBeNull();

    expect(
      checkImagingWindow(opportunities, { taskId: 'capture-1', targetId: 'target-1', simTime: opportunity.time }),
    ).toBeNull();

    expect(
      checkStorageBudget(ASTERIA_1_PROFILE, initialTruthState(), {
        id: 'product-1',
        taskId: 'capture-1',
        mode: 'PAN',
        sizeGB: ASTERIA_1_PROFILE.storage.productGB.PAN,
      }),
    ).toBeNull();

    const records = domainRecords(runner.log.records);
    const downlinkCommandTime = timeline[4].simTime; // TaskStarted@1 for downlink-1
    expect(
      checkContactTiming(records, {
        commandId: 'cmd-1',
        taskId: 'downlink-1',
        contactId: 'contact-1',
        simTime: downlinkCommandTime,
      }),
    ).toBeNull();
  });
});
