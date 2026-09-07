import { describe, expect, it } from 'vitest';
import { ASTERIA_1_SCENARIO, generateUlid } from '../../contracts';
import { domainRecords } from '../../contracts/envelope';
import type { DomainEvent, RunControlEvent } from '../../contracts/events';
import { EventLog } from '../log/EventLog';
import { ScenarioRunner } from '../scenario/ScenarioRunner';
import { checkContactTiming } from './contactTiming';

const NOW = new Date('2026-09-07T00:00:00.000Z');
const EPOCH = new Date(ASTERIA_1_SCENARIO.startTime);
const at = (offsetS: number) => new Date(EPOCH.getTime() + offsetS * 1000);

function logWithContactWindow(acquiredAtS: number, lostAtS: number | null) {
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

const candidate = (simTimeS: number) => ({
  commandId: 'cmd-1',
  taskId: 'downlink-1',
  contactId: 'contact-1',
  simTime: at(simTimeS),
});

describe('checkContactTiming', () => {
  it('returns null when the command falls inside the acquired-but-not-lost window', () => {
    const records = logWithContactWindow(60, 150);
    expect(checkContactTiming(records, candidate(100))).toBeNull();
  });

  it('returns null exactly at acquisition (inclusive boundary)', () => {
    const records = logWithContactWindow(60, 150);
    expect(checkContactTiming(records, candidate(60))).toBeNull();
  });

  it('returns CMD_BEFORE_AOS when the command precedes acquisition', () => {
    const records = logWithContactWindow(60, 150);
    const finding = checkContactTiming(records, candidate(30));
    expect(finding).toMatchObject({ code: 'CMD_BEFORE_AOS', severity: 'HardBlock', waivable: false });
    expect(finding!.affectedEntities).toEqual([
      { kind: 'command', id: 'cmd-1' },
      { kind: 'task', id: 'downlink-1' },
      { kind: 'contact', id: 'contact-1' },
    ]);
  });

  it('returns CMD_BEFORE_AOS when the contact was never acquired at all', () => {
    const log = new EventLog(() => NOW);
    const finding = checkContactTiming(domainRecords(log.records), candidate(100));
    expect(finding?.code).toBe('CMD_BEFORE_AOS');
    expect(finding!.why).toContain('no recorded ContactAcquired@1');
  });

  it('returns CMD_AFTER_LOS exactly at loss (inclusive — loss itself already ends the window)', () => {
    const records = logWithContactWindow(60, 150);
    const finding = checkContactTiming(records, candidate(150));
    expect(finding?.code).toBe('CMD_AFTER_LOS');
  });

  it('returns CMD_AFTER_LOS when the command follows loss of signal', () => {
    const records = logWithContactWindow(60, 150);
    const finding = checkContactTiming(records, candidate(200));
    expect(finding).toMatchObject({ code: 'CMD_AFTER_LOS', severity: 'HardBlock', waivable: false });
  });

  it('returns null when the contact has no ContactLost yet (still ongoing)', () => {
    const records = logWithContactWindow(60, null);
    expect(checkContactTiming(records, candidate(1000))).toBeNull();
  });

  it('real-integration: evaluates a real ScenarioRunner log run through the Asteria-1 demo timeline shape', () => {
    const runner = new ScenarioRunner(ASTERIA_1_SCENARIO, generateUlid(), () => NOW);
    runner.schedule(at(60), { type: 'ContactAcquired@1', stationId: 'gs-home', contactId: 'contact-1' });
    runner.schedule(at(150), { type: 'ContactLost@1', stationId: 'gs-home', contactId: 'contact-1' });
    runner.advance(200_000); // 200s of scenario time at the default 1x multiplier scaled by ms

    const records = domainRecords(runner.log.records);
    expect(checkContactTiming(records, candidate(30))?.code).toBe('CMD_BEFORE_AOS');
    expect(checkContactTiming(records, candidate(100))).toBeNull();
    expect(checkContactTiming(records, candidate(200))?.code).toBe('CMD_AFTER_LOS');
  });
});
