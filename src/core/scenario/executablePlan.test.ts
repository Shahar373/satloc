import { describe, expect, it } from 'vitest';
import { ASTERIA_1_SCENARIO as scenario, ASTERIA_1_PROFILE as profile } from '../../contracts/asteria1';
import { downlinkGB } from '../../contracts/domain';
import { domainRecords, validateSessionRecords } from '../../contracts/envelope';
import { evaluateImagingOpportunities } from './planOpportunities';
import { predictPasses } from '../passes/predict';
import { tleToElementSet } from '../tle/omm';
import { checkContactTiming } from '../validation/contactTiming';
import { checkIllumination } from '../validation/illumination';
import { compilePlan, evaluateExecutablePlan, type ExecutableCandidate, type PlanWaiver } from './executablePlan';
import { ScenarioRunner } from './ScenarioRunner';
import { at, capture, contact } from './operatorPlan.fixtures';

const evaluate = (candidates: ExecutableCandidate[]) => evaluateExecutablePlan(scenario, candidates);
const codes = (candidates: ExecutableCandidate[]) => evaluate(candidates).findings.map((f) => f.code);
const waive = (candidates: ExecutableCandidate[]): PlanWaiver[] =>
  evaluate(candidates).warnings.map(({ candidateId, finding }) => ({
    candidateId,
    code: finding.code,
    reason: 'Accepted synthetic training forecast',
  }));

describe('executable operator plans', () => {
  it('compiles in time order and serializes multiple products within one exact-capacity contact', () => {
    // Analytical accounting: two 1.2 GB products / 150 Mbps = 128 s, plus 20 s acquisition.
    const images = [capture('one'), capture('two', 120)];
    const downlink = contact('dl', ['one', 'two'], 1000, 148);
    const plan = compilePlan(scenario, [downlink, ...images.reverse()], [], 'plan-1');
    expect(plan.tasks.map((t) => t.id)).toEqual(['one', 'two', 'dl']);
    const completed = plan.timeline.filter((s) => s.event.type === 'DownlinkCompleted@1');
    expect(completed.map((s) => s.simTime)).toEqual([at(1084), at(1148)]);
    expect(plan.timeline.at(-1)?.event.type).toBe('ContactLost@1');
    const runner = new ScenarioRunner(scenario, 'test');
    for (const item of plan.timeline) runner.schedule(item.simTime, item.event);
    runner.clock.seek(at(1148));
    runner.advance(0);
    expect(runner.truth.storageUsedGB).toBe(0);
    expect(runner.truth.downlinkedDataProductIds).toEqual(['one', 'two']);
    expect(Object.values(runner.truth.taskStatus)).toEqual(['completed', 'completed', 'completed']);
    expect(validateSessionRecords([...runner.log.records])).toEqual([]);
    expect(
      checkContactTiming(domainRecords(runner.log.records), {
        commandId: 'command:dl',
        taskId: 'dl',
        contactId: downlink.contactId,
        simTime: at(1020),
      }),
    ).toBeNull();
  });

  it('takes an independent snapshot and derives duration from contact times', () => {
    const image = capture();
    const downlink = contact();
    downlink.durationS = 90000;
    const plan = compilePlan(scenario, [image, downlink], [], 'snapshot');
    image.opportunity.time.setUTCFullYear(2040);
    downlink.dataProductCandidateIds.length = 0;
    expect(plan.candidates[0].kind === 'imaging' && plan.candidates[0].opportunity.time).toEqual(at(70));
    expect(plan.candidates[1].kind === 'downlink' && plan.candidates[1].durationS).toBe(100);
  });

  it('supports MS product sizes in capacity and execution', () => {
    const plan = compilePlan(scenario, [capture('ms', 60, 'MS'), contact('dl', ['ms'], 1000, 42)], [], 'ms');
    const stored = plan.timeline.find((s) => s.event.type === 'DataProductStored@1');
    expect(stored?.event).toMatchObject({ dataProduct: { sizeGB: 0.4, mode: 'MS' } });
    expect(plan.timeline.find((s) => s.event.type === 'DownlinkCompleted@1')?.simTime).toEqual(at(1041.333));
  });

  it.each([
    ['empty', () => [], 'PLAN_CAPTURE_REQUIRED'],
    ['no downlink', () => [capture()], 'PLAN_DOWNLINK_REQUIRED'],
    ['downlink before capture', () => [capture(), contact('dl', ['image-1'], 10)], 'DOWNLINK_PRODUCT_MISSING'],
    ['overlap', () => [capture(), contact('dl', ['image-1'], 75)], 'PLAN_TASK_OVERLAP'],
    ['duplicate product', () => [capture(), contact('dl', ['image-1', 'image-1'])], 'PLAN_PRODUCTS_REQUIRED'],
    ['empty downlink', () => [capture(), contact('empty', [])], 'PLAN_PRODUCTS_REQUIRED'],
    ['duplicate task', () => [capture(), capture(), contact()], 'PLAN_DUPLICATE'],
    ['duplicate transfer', () => [capture(), contact(), contact('dl2', ['image-1'], 2000)], 'DOWNLINK_PRODUCT_MISSING'],
    ['short contact', () => [capture(), contact('dl', ['image-1'], 1000, 83)], 'CONTACT_TOO_SHORT_FOR_PRODUCT'],
    [
      'storage full',
      () => [
        ...Array.from({ length: 6 }, (_, i) => capture(`i${i}`, 60 + i * 60)),
        contact(
          'dl',
          Array.from({ length: 6 }, (_, i) => `i${i}`),
          1000,
          500,
        ),
      ],
      'STORAGE_INSUFFICIENT',
    ],
    ['unknown station', () => [capture(), { ...contact(), stationId: 'missing' }], 'PLAN_UNKNOWN_STATION'],
    [
      'invalid times',
      () => [capture(), { ...contact(), pass: { ...contact().pass, aos: at(1200) } }],
      'PLAN_INVALID_TIME',
    ],
    [
      'truncated contact',
      () => [capture(), { ...contact(), pass: { ...contact().pass, continuesAfterEnd: true } }],
      'PLAN_INCOMPLETE_WINDOW',
    ],
  ] as const)('rejects %s without producing an executable schedule', (_name, build, expected) => {
    const candidates = build();
    expect(codes(candidates)).toContain(expected);
    expect(() => compilePlan(scenario, candidates, waive(candidates), 'blocked')).toThrow();
  });

  it('accounts at byte precision for a full mixed PAN/MS plan and frees every byte', () => {
    // Independent arithmetic: 2 × 1.2 GB + 9 × 0.4 GB = exactly 6 GB.
    // Download takes 6 × 8000 / 150 = 320 s, plus 20 s acquisition: exactly 340 s.
    const images = Array.from({ length: 11 }, (_, i) => capture(`mix-${i}`, 60 + i * 60, i < 2 ? 'PAN' : 'MS'));
    const candidates = [
      ...images,
      contact(
        'dl',
        images.map((i) => i.id),
        1000,
        340,
      ),
    ];
    expect(evaluate(candidates).hardBlocked).toBe(false);
    expect(evaluate(candidates).peakStorageGB).toBe(6);
    expect(evaluate(candidates).remainingStorageGB).toBe(0);
    const plan = compilePlan(scenario, candidates, [], 'mixed');
    expect(plan.timeline.filter((item) => item.event.type === 'DownlinkCompleted@1').at(-1)?.simTime).toEqual(at(1340));
    const runner = new ScenarioRunner(scenario, 'byte-accounting');
    for (const item of plan.timeline) runner.schedule(item.simTime, item.event);
    runner.clock.seek(at(1340));
    runner.advance(0);
    expect(runner.truth.storageUsedGB).toBe(0);
    expect(Object.keys(runner.truth.dataProducts)).toHaveLength(0);
  });

  it('does not treat a daylight flag as proof of sufficient illumination', () => {
    const image = capture();
    image.opportunity.sunElevationDeg = 19.99;
    expect(codes([image, contact()])).toContain('IMG_INSUFFICIENT_LIGHT');
    expect(evaluate([image, contact()]).rows[0].cumulativeStorageUsedGB).toBe(0);
    expect(checkIllumination(profile, { taskId: 't', targetId: 'target-1', sunElevationDeg: 20 })).toBeNull();
    expect(checkIllumination(profile, { taskId: 't', targetId: 'target-1', sunElevationDeg: NaN })).not.toBeNull();
  });

  it('requires a nonblank, task-specific waiver for every stale capture and contact', () => {
    const candidates = [capture('late', 4 * 86400), contact('late-dl', ['late'], 4 * 86400 + 1000)];
    expect(evaluate(candidates).warnings).toHaveLength(2);
    expect(() => compilePlan(scenario, candidates, [], 'p')).toThrow('Explicit waiver');
    const waivers = waive(candidates);
    expect(() => compilePlan(scenario, candidates, waivers.slice(0, 1), 'p')).toThrow('Explicit waiver');
    expect(() =>
      compilePlan(
        scenario,
        candidates,
        waivers.map((w) => ({ ...w, reason: ' ' })),
        'p',
      ),
    ).toThrow('Explicit waiver');
    expect(compilePlan(scenario, candidates, waivers, 'p').waivers).toHaveLength(2);
  });

  it('real geometry integration: runs a selected daylight capture and GS-North downlink, independently of the guided timeline', () => {
    // Integration/golden-regression coverage, not an independent orbital correctness reference.
    const { satrec } = tleToElementSet(scenario.tle.line1, scenario.tle.line2, scenario.tle.name);
    const imaging = evaluateImagingOpportunities(
      satrec,
      profile,
      scenario.targets[0],
      new Date(scenario.startTime),
      30,
    );
    const chosen = imaging.filter((i) => !i.findings.some((f) => f.severity === 'HardBlock'))[1];
    expect(chosen).toBeDefined();
    const station = scenario.groundStations[1];
    const passes = predictPasses(
      satrec,
      {
        latitude: (station.latitudeDeg * Math.PI) / 180,
        longitude: (station.longitudeDeg * Math.PI) / 180,
        heightKm: 0,
      },
      chosen.opportunity.end,
      48,
      { minElevationDeg: station.minElevationDeg },
    );
    const pass = passes.find(
      (p) => !p.inProgressAtStart && !p.continuesAfterEnd && downlinkGB(profile, p.durationS) >= 0.4,
    );
    if (!pass) throw new Error('Expected a complete GS-North contact with capacity');
    const candidates: ExecutableCandidate[] = [
      { ...capture('chosen-ms', 0, 'MS'), opportunity: chosen.opportunity },
      { ...contact('north', ['chosen-ms']), stationId: station.id, pass },
    ];
    const plan = compilePlan(scenario, candidates, waive(candidates), 'operator-choice');
    const runner = new ScenarioRunner(scenario, 'integration');
    for (const item of plan.timeline) runner.schedule(item.simTime, item.event);
    runner.clock.seek(pass.los);
    runner.advance(0);
    expect(runner.truth.downlinkedDataProductIds).toEqual(['chosen-ms']);
    expect(runner.truth.activeContactIds).toEqual([]);
    expect(runner.truth.storageUsedGB).toBe(0);
    expect(plan.timeline.find((s) => s.event.type === 'DataProductStored@1')?.simTime).toEqual(chosen.opportunity.time);
  });
});
