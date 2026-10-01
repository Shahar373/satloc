import { describe, expect, it } from 'vitest';
import { operatorRecords, domainRecords, validateSessionRecords } from '../contracts/envelope';
import { ASTERIA_1_SCENARIO } from '../contracts';
import { evaluateExecutablePlan, waiverKey } from '../core/scenario/executablePlan';
import { capture, contact } from '../core/scenario/operatorPlan.fixtures';
import { createTrainingStore } from './training';
import { createPlanDraftStore } from './planDraft';

describe('operator-plan session ownership', () => {
  it('loads paused, logs commitment/commands/waivers, executes the selected plan, and restarts the same snapshot', () => {
    const store = createTrainingStore();
    const candidates = [capture('late-ms', 4 * 86400, 'MS'), contact('north', ['late-ms'], 4 * 86400 + 1000)];
    const waivers = evaluateExecutablePlan(ASTERIA_1_SCENARIO, candidates).warnings.map((w) => ({
      candidateId: w.candidateId,
      code: w.finding.code,
      reason: 'Training choice',
    }));
    store.getState().loadPlan(candidates, waivers);
    expect(store.getState().running).toBe(false);
    const plan = store.getState().plan;
    const operators = operatorRecords(store.getState().records);
    expect(operators.filter((r) => r.event.type === 'PlanCommitted@1')).toHaveLength(1);
    expect(operators.filter((r) => r.event.type === 'CommandSubmitted@1')).toHaveLength(2);
    expect(operators.filter((r) => r.event.type === 'WarningWaived@1')).toHaveLength(2);
    const records = store.getState().records;
    store.getState().initialize();
    expect(store.getState().records).toBe(records);
    expect(() => store.getState().loadPlan([capture()], [])).toThrow();
    expect(store.getState().records).toBe(records);
    for (let i = 0; i < 20 && store.getState().nextEventTime; i++) store.getState().stepNext();
    expect(store.getState().status).toBe('complete');
    expect(store.getState().truth.storageUsedGB).toBe(0);
    expect(store.getState().truth.downlinkedDataProductIds).toEqual(['late-ms']);
    expect(Object.values(store.getState().truth.commandStatus)).toEqual(['executed', 'executed']);
    expect(validateSessionRecords([...store.getState().records])).toEqual([]);
    expect(domainRecords(store.getState().records).every((r) => r.causedBy)).toBe(true);
    store.getState().restart();
    expect(store.getState().plan).toBe(plan);
    expect(store.getState().running).toBe(false);
    expect(store.getState().truth.downlinkedDataProductIds).toEqual([]);
    expect(store.getState().truth.storageUsedGB).toBe(0);
    store.getState().setRunning(true);
    store.getState().advance(1e9);
    expect(store.getState().truth.downlinkedDataProductIds).toEqual(['late-ms']);
  });

  it('invalidates waivers on edits and removes orphan downlinks without changing a committed run', () => {
    const draft = createPlanDraftStore();
    const run = createTrainingStore();
    const image = capture();
    const dl = contact();
    draft.getState().toggle(image.id);
    draft.getState().toggleDownlink(dl);
    run.getState().loadPlan([image, dl], []);
    const snapshot = run.getState().plan;
    draft.getState().setWaiver(waiverKey(image.id, 'ELEMENTS_STALE'), 'accepted');
    draft.getState().toggle('second', 'MS');
    expect(draft.getState().waivers).toEqual({});
    draft.getState().toggle(image.id);
    expect(draft.getState().downlinks).toEqual([]);
    expect(draft.getState().ids).toEqual(['second']);
    expect(run.getState().plan).toBe(snapshot);
    expect(snapshot?.candidates).toHaveLength(2);
  });
});
