import { describe, expect, it } from 'vitest';
import { ASTERIA_1_PROFILE, ASTERIA_1_SCENARIO, ASTERIA_1_TLE, generateUlid } from '../../contracts';
import { domainRecords } from '../../contracts/envelope';
import type { DomainEvent, RunControlEvent } from '../../contracts/events';
import { EventLog } from '../log/EventLog';
import { buildRealDemoTimeline } from '../scenario/realDemoTimeline';
import { ScenarioRunner } from '../scenario/ScenarioRunner';
import { tleToElementSet } from '../tle/omm';
import { computeOperatorObservables } from './OperatorObservables';

const NOW = new Date('2026-09-07T00:00:00.000Z');
const EPOCH = new Date(ASTERIA_1_SCENARIO.startTime);
const at = (offsetS: number) => new Date(EPOCH.getTime() + offsetS * 1000);

// ASTERIA_1_PROFILE.downlink.acquisitionS is 20 (src/contracts/asteria1.ts).
function logWithContact(acquiredAtS: number, lostAtS: number | null) {
  const log = new EventLog(() => NOW);
  const started: RunControlEvent = { type: 'SimulationStarted@1', scenarioId: ASTERIA_1_SCENARIO.id, seed: 'seed' };
  log.append({ stream: 'run-control', event: started, simTime: EPOCH });
  const acquired: DomainEvent = { type: 'ContactAcquired@1', stationId: 'gs-home', contactId: 'contact-1' };
  log.append({ stream: 'domain', event: acquired, simTime: at(acquiredAtS) });
  if (lostAtS != null) {
    const lost: DomainEvent = { type: 'ContactLost@1', stationId: 'gs-home', contactId: 'contact-1' };
    log.append({ stream: 'domain', event: lost, simTime: at(lostAtS) });
  }
  return domainRecords(log.records);
}

describe('computeOperatorObservables', () => {
  it('returns no confirmed contacts before any ContactAcquired@1 has fired', () => {
    const log = new EventLog(() => NOW);
    const observables = computeOperatorObservables(domainRecords(log.records), ASTERIA_1_PROFILE, at(1000));
    expect(observables.confirmedContactIds).toEqual([]);
  });

  it('does not confirm a contact until acquisitionS seconds after ContactAcquired@1', () => {
    const records = logWithContact(100, null);
    const observables = computeOperatorObservables(records, ASTERIA_1_PROFILE, at(119));
    expect(observables.confirmedContactIds).toEqual([]);
  });

  it('confirms the contact exactly acquisitionS seconds after ContactAcquired@1 (inclusive)', () => {
    const records = logWithContact(100, null);
    const observables = computeOperatorObservables(records, ASTERIA_1_PROFILE, at(120));
    expect(observables.confirmedContactIds).toEqual(['contact-1']);
  });

  it('stops confirming the instant ContactLost@1 fires, even mid-acquisition-window for a later cycle', () => {
    const records = logWithContact(100, 150);
    expect(computeOperatorObservables(records, ASTERIA_1_PROFILE, at(200)).confirmedContactIds).toEqual([]);
  });

  it('correctly reflects a second acquire/lose cycle for the same contact id, not a stale first one', () => {
    const log = new EventLog(() => NOW);
    const acquired: DomainEvent = { type: 'ContactAcquired@1', stationId: 'gs-home', contactId: 'contact-1' };
    const lost: DomainEvent = { type: 'ContactLost@1', stationId: 'gs-home', contactId: 'contact-1' };
    log.append({ stream: 'domain', event: acquired, simTime: at(100) });
    log.append({ stream: 'domain', event: lost, simTime: at(150) });
    log.append({ stream: 'domain', event: acquired, simTime: at(500) });
    const records = domainRecords(log.records);

    // Between the first loss and the second acquisition, nothing is confirmed.
    expect(computeOperatorObservables(records, ASTERIA_1_PROFILE, at(300)).confirmedContactIds).toEqual([]);
    // Within the second acquisition's own lock-on window, still not confirmed.
    expect(computeOperatorObservables(records, ASTERIA_1_PROFILE, at(510)).confirmedContactIds).toEqual([]);
    // Once the second acquisition's lock-on window has passed, it is.
    expect(computeOperatorObservables(records, ASTERIA_1_PROFILE, at(520)).confirmedContactIds).toEqual(['contact-1']);
  });

  it('real-integration: lags TruthState.activeContactIds by exactly the real acquisitionS window on a real ScenarioRunner run', () => {
    const { satrec } = tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name);
    const timeline = buildRealDemoTimeline(satrec, EPOCH);
    const contactAcquired = timeline.find((entry) => entry.event.type === 'ContactAcquired@1');
    if (!contactAcquired) throw new Error('expected buildRealDemoTimeline to schedule a ContactAcquired@1 event');
    const acquiredAt = contactAcquired.simTime;

    const runner = new ScenarioRunner(ASTERIA_1_SCENARIO, generateUlid());
    for (const { simTime, event } of timeline) runner.schedule(simTime, event);

    // Advance only to just after acquisition (not through the whole run, which would also fire
    // ContactLost@1 and make activeContactIds empty again) — proves Truth State knows about the
    // contact immediately, before checking that Operator Observables doesn't confirm it yet.
    const justAfterAcquisition = new Date(acquiredAt.getTime() + 1000);
    runner.advance(justAfterAcquisition.getTime() - runner.clock.simTime.getTime());
    expect(runner.truth.activeContactIds).toContain('contact-1');
    expect(
      computeOperatorObservables(domainRecords(runner.log.records), ASTERIA_1_PROFILE, justAfterAcquisition)
        .confirmedContactIds,
    ).toEqual([]);

    // Advancing to the end of the real acquisition window (still well before the real
    // ContactLost@1, per buildRealDemoTimeline's own contract) confirms it.
    const afterAcquisitionWindow = new Date(acquiredAt.getTime() + ASTERIA_1_PROFILE.downlink.acquisitionS * 1000);
    runner.advance(afterAcquisitionWindow.getTime() - runner.clock.simTime.getTime());
    expect(
      computeOperatorObservables(domainRecords(runner.log.records), ASTERIA_1_PROFILE, afterAcquisitionWindow)
        .confirmedContactIds,
    ).toEqual(['contact-1']);
  });
});
