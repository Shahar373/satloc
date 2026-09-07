import { describe, expect, it } from 'vitest';
import { ASTERIA_1_GROUND_STATIONS, ASTERIA_1_SCENARIO, ASTERIA_1_TLE } from '../../contracts/asteria1';
import { findImagingOpportunities, type ImagingOpportunity } from '../imaging/opportunities';
import type { TargetPoint } from '../imaging/geometry';
import { tleToElementSet } from '../tle/omm';
import { checkImagingWindow } from './imagingWindow';

const deg2rad = (d: number) => (d * Math.PI) / 180;

const opportunity = (startS: number, endS: number): ImagingOpportunity => ({
  time: new Date(startS * 1000),
  start: new Date(startS * 1000),
  end: new Date(endS * 1000),
  offNadirDeg: 0,
  sunElevationDeg: 45,
  satelliteSunlit: true,
  direction: 'ascending',
  side: 'right',
  daylight: true,
  continuesAfterEnd: false,
});

const candidate = (simTimeS: number) => ({
  taskId: 'task-1',
  targetId: 'target-1',
  simTime: new Date(simTimeS * 1000),
});

describe('checkImagingWindow', () => {
  it('returns null when simTime falls inside an opportunity window', () => {
    const opportunities = [opportunity(100, 200)];
    expect(checkImagingWindow(opportunities, candidate(150))).toBeNull();
  });

  it('returns null exactly at the window start (inclusive boundary)', () => {
    const opportunities = [opportunity(100, 200)];
    expect(checkImagingWindow(opportunities, candidate(100))).toBeNull();
  });

  it('returns null exactly at the window end (inclusive boundary)', () => {
    const opportunities = [opportunity(100, 200)];
    expect(checkImagingWindow(opportunities, candidate(200))).toBeNull();
  });

  it('returns an IMG_OUTSIDE_WINDOW HardBlock finding when simTime falls outside every window', () => {
    const opportunities = [opportunity(100, 200), opportunity(400, 500)];
    const finding = checkImagingWindow(opportunities, candidate(300));
    expect(finding).toMatchObject({
      code: 'IMG_OUTSIDE_WINDOW',
      severity: 'HardBlock',
      waivable: false,
      provenance: 'calculated',
      source: 'rules/imaging-window@1',
    });
    expect(finding!.affectedEntities).toEqual([
      { kind: 'task', id: 'task-1' },
      { kind: 'target', id: 'target-1' },
    ]);
  });

  it('the why field names the nearest actual opportunity, not just a generic message', () => {
    const opportunities = [opportunity(100, 200), opportunity(400, 500)];
    const finding = checkImagingWindow(opportunities, candidate(380));
    expect(finding!.why).toContain(new Date(400_000).toISOString());
    expect(finding!.why).toContain(new Date(500_000).toISOString());
  });

  it('returns a HardBlock with a distinct why message when there are no opportunities at all', () => {
    const finding = checkImagingWindow([], candidate(100));
    expect(finding?.code).toBe('IMG_OUTSIDE_WINDOW');
    expect(finding!.why).toContain('No forecast imaging opportunities exist');
  });

  it('real-geometry integration: evaluates real access windows from findImagingOpportunities against the Asteria-1 TLE, not fabricated windows', () => {
    const { satrec } = tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name);
    const gsHome = ASTERIA_1_GROUND_STATIONS.find((station) => station.id === 'gs-home');
    if (!gsHome) throw new Error('expected the asteria1 fixture to define gs-home');
    const target: TargetPoint = {
      latitude: deg2rad(gsHome.latitudeDeg),
      longitude: deg2rad(gsHome.longitudeDeg),
      heightKm: 0,
    };
    const start = new Date(ASTERIA_1_SCENARIO.startTime);
    const opportunities = findImagingOpportunities(satrec, target, start, 7);
    expect(opportunities.length).toBeGreaterThan(0);

    // The closest-approach instant of a real opportunity always falls inside its own window.
    const first = opportunities[0];
    expect(checkImagingWindow(opportunities, { taskId: 't', targetId: gsHome.id, simTime: first.time })).toBeNull();

    // A candidate scheduled well before the first real opportunity has no access yet.
    const tooEarly = new Date(start.getTime() - 3600_000);
    const finding = checkImagingWindow(opportunities, { taskId: 't', targetId: gsHome.id, simTime: tooEarly });
    expect(finding?.code).toBe('IMG_OUTSIDE_WINDOW');
  });
});
