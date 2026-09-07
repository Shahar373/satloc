import { describe, expect, it } from 'vitest';
import { ASTERIA_1_PROFILE, ASTERIA_1_SCENARIO, ASTERIA_1_TARGETS, ASTERIA_1_TLE } from '../../contracts';
import { findImagingOpportunities } from '../imaging/opportunities';
import { elementSetAgeDays, tleToElementSet } from '../tle/omm';
import { checkRollLimit } from './rollLimit';
import { checkElementsStale } from './elementsStale';

describe('checkElementsStale', () => {
  it('returns null exactly at the 3-day threshold (inclusive)', () => {
    const finding = checkElementsStale({ taskId: 't', targetId: 'target-1', ageDays: 3 });
    expect(finding).toBeNull();
  });

  it('returns null for fresh elements', () => {
    const finding = checkElementsStale({ taskId: 't', targetId: 'target-1', ageDays: 0.93 });
    expect(finding).toBeNull();
  });

  it('flags ELEMENTS_STALE as a waivable WaivableWarning past the threshold', () => {
    const finding = checkElementsStale({ taskId: 't', targetId: 'target-1', ageDays: 3.44 });
    expect(finding).toMatchObject({
      code: 'ELEMENTS_STALE',
      severity: 'WaivableWarning',
      waivable: true,
      provenance: 'assumed',
      source: 'rules/elements-stale@1',
    });
    expect(finding?.affectedEntities).toEqual([
      { kind: 'task', id: 't' },
      { kind: 'target', id: 'target-1' },
    ]);
  });

  it('accepts a custom threshold', () => {
    expect(checkElementsStale({ taskId: 't', targetId: 'target-1', ageDays: 1 }, 0.5)).not.toBeNull();
    expect(checkElementsStale({ taskId: 't', targetId: 'target-1', ageDays: 0.5 }, 0.5)).toBeNull();
  });

  it('real-integration: real Asteria-1 opportunities over 30 days genuinely split clean/stale at the real epoch', () => {
    const { satrec, epoch } = tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name);
    const [target] = ASTERIA_1_TARGETS;
    if (!target) throw new Error('expected the asteria1 fixture to define an imaging target');
    const start = new Date(ASTERIA_1_SCENARIO.startTime);
    // ASTERIA_1_SCENARIO.startTime is asserted equal to the TLE epoch elsewhere (asteria1.test.ts),
    // so age-from-epoch here is exactly age-from-scenario-start.
    expect(epoch.getTime()).toBe(start.getTime());

    const targetPoint = {
      latitude: (target.latitudeDeg * Math.PI) / 180,
      longitude: (target.longitudeDeg * Math.PI) / 180,
      heightKm: 0,
    };
    const opportunities = findImagingOpportunities(satrec, targetPoint, start, 30, { maxOffNadirDeg: 45 });
    expect(opportunities.length).toBeGreaterThan(10);

    const findings = opportunities.map((o) =>
      checkElementsStale({ taskId: 't', targetId: target.id, ageDays: elementSetAgeDays({ epoch }, o.time) }),
    );
    // A real 30-day window genuinely produces both outcomes.
    expect(findings.some((f) => f === null)).toBe(true);
    expect(findings.some((f) => f?.code === 'ELEMENTS_STALE')).toBe(true);

    // Roll-limit and elements-staleness are genuinely orthogonal real conditions — at least one
    // real opportunity is clean on roll but still stale on elements, proving this rule adds real
    // information rather than just duplicating checkRollLimit's verdict.
    const rollCleanButStale = opportunities.some((o, i) => {
      const rollOk =
        checkRollLimit(ASTERIA_1_PROFILE, {
          taskId: 't',
          targetId: target.id,
          offNadirAngleRad: (o.offNadirDeg * Math.PI) / 180,
        }) === null;
      return rollOk && findings[i]?.code === 'ELEMENTS_STALE';
    });
    expect(rollCleanButStale).toBe(true);
  });
});
