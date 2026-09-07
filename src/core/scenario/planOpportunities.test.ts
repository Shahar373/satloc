import { describe, expect, it } from 'vitest';
import { ASTERIA_1_PROFILE, ASTERIA_1_SCENARIO, ASTERIA_1_TARGETS, ASTERIA_1_TLE } from '../../contracts/asteria1';
import { tleToElementSet } from '../tle/omm';
import { evaluateImagingOpportunities } from './planOpportunities';

const start = new Date(ASTERIA_1_SCENARIO.startTime);

function satrec() {
  return tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name).satrec;
}

describe('evaluateImagingOpportunities', () => {
  it('evaluates a real, non-trivial mix of clean and roll-limited opportunities over 30 days', () => {
    const [target] = ASTERIA_1_TARGETS;
    if (!target) throw new Error('expected the asteria1 fixture to define an imaging target');
    const evaluated = evaluateImagingOpportunities(satrec(), ASTERIA_1_PROFILE, target, start, 30);

    // Real orbital geometry over 30 days — not a fabricated fixture — genuinely produces both
    // clean and roll-limited candidates for Asteria-1's target, confirmed by scratch survey
    // before writing this module.
    expect(evaluated.length).toBeGreaterThan(10);
    const clean = evaluated.filter((e) => e.findings.length === 0);
    const blocked = evaluated.filter((e) => e.findings.some((f) => f.code === 'IMG_ROLL_EXCEEDS_LIMIT'));
    expect(clean.length).toBeGreaterThan(0);
    expect(blocked.length).toBeGreaterThan(0);
  });

  it('every finding on a roll-limited opportunity matches the real checkRollLimit shape', () => {
    const [target] = ASTERIA_1_TARGETS;
    if (!target) throw new Error('expected the asteria1 fixture to define an imaging target');
    const evaluated = evaluateImagingOpportunities(satrec(), ASTERIA_1_PROFILE, target, start, 30);
    const blocked = evaluated.find((e) => e.findings.some((f) => f.code === 'IMG_ROLL_EXCEEDS_LIMIT'));
    if (!blocked) throw new Error('expected at least one roll-limited opportunity in this real 30-day window');

    const finding = blocked.findings.find((f) => f.code === 'IMG_ROLL_EXCEEDS_LIMIT');
    expect(finding).toMatchObject({ severity: 'HardBlock', waivable: false, source: 'rules/roll-limit@1' });
    expect(finding!.why).toContain('°');
  });

  it('checkImagingWindow never flags an opportunity evaluated against its own opportunity list', () => {
    const [target] = ASTERIA_1_TARGETS;
    if (!target) throw new Error('expected the asteria1 fixture to define an imaging target');
    const evaluated = evaluateImagingOpportunities(satrec(), ASTERIA_1_PROFILE, target, start, 30);
    expect(evaluated.every((e) => !e.findings.some((f) => f.code === 'IMG_OUTSIDE_WINDOW'))).toBe(true);
  });

  it('flags ELEMENTS_STALE on real opportunities past 3 days, as a WaivableWarning that does not need to coincide with a roll finding', () => {
    const [target] = ASTERIA_1_TARGETS;
    if (!target) throw new Error('expected the asteria1 fixture to define an imaging target');
    const evaluated = evaluateImagingOpportunities(satrec(), ASTERIA_1_PROFILE, target, start, 30);

    // The scenario's TLE epoch equals its startTime (asteria1.test.ts), so most of a real 30-day
    // search genuinely falls past the 3-day threshold — this is not a contrived example.
    const stale = evaluated.filter((e) => e.findings.some((f) => f.code === 'ELEMENTS_STALE'));
    expect(stale.length).toBeGreaterThan(0);
    const finding = stale[0].findings.find((f) => f.code === 'ELEMENTS_STALE');
    expect(finding).toMatchObject({ severity: 'WaivableWarning', waivable: true, source: 'rules/elements-stale@1' });

    // Genuinely orthogonal to roll-limit: at least one real stale opportunity is otherwise clean.
    const staleButRollOk = stale.some((e) => !e.findings.some((f) => f.code === 'IMG_ROLL_EXCEEDS_LIMIT'));
    expect(staleButRollOk).toBe(true);
  });
});
