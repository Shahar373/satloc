import { describe, expect, it } from 'vitest';
import { domainRecords, validateSessionRecords } from '../contracts/envelope';
import { ASTERIA_1_SCENARIO } from '../contracts';
import { createTrainingStore } from './training';

describe('the shared training session', () => {
  it('starts paused and initialization preserves an existing run', () => {
    const store = createTrainingStore();
    store.getState().initialize();
    expect(store.getState().running).toBe(false);
    store.getState().advance(10_000);
    expect(store.getState().simTime.toISOString()).toBe(new Date(ASTERIA_1_SCENARIO.startTime).toISOString());
    store.getState().stepNext();
    const records = store.getState().records;
    store.getState().initialize();
    expect(store.getState().records).toBe(records);
    expect(domainRecords(records)).toHaveLength(1);
  });

  it('steps the real run at exact event times, including simultaneous events, once each', () => {
    const store = createTrainingStore();
    store.getState().initialize();
    store.getState().setRate(60);
    for (let i = 0; i < 10 && store.getState().nextEventTime; i++) {
      const next = store.getState().nextEventTime;
      store.getState().stepNext();
      expect(store.getState().simTime).toEqual(next);
      expect(store.getState().running).toBe(false);
    }
    const state = store.getState();
    expect(state.status).toBe('complete');
    expect(domainRecords(state.records)).toHaveLength(8);
    expect(state.truth.storageUsedGB).toBe(0);
    expect(state.truth.taskStatus).toEqual({ 'capture-1': 'completed', 'downlink-1': 'completed' });
    expect(validateSessionRecords([...state.records])).toEqual([]);
    state.stepNext();
    state.setRunning(true);
    state.advance(10_000);
    expect(store.getState().records).toBe(state.records);
  });

  it('pauses without losing progress, finishes at the last event, and explicitly restarts', () => {
    const store = createTrainingStore();
    store.getState().initialize();
    store.getState().setRunning(true);
    store.getState().advance(100);
    store.getState().setRunning(false);
    const time = store.getState().simTime;
    store.getState().advance(60_000);
    expect(store.getState().simTime).toBe(time);
    store.getState().setRunning(true);
    store.getState().advance(1e9);
    expect(store.getState().status).toBe('complete');
    expect(store.getState().running).toBe(false);
    const domain = domainRecords(store.getState().records);
    expect(store.getState().simTime.toISOString()).toBe(domain.at(-1)?.simTime);
    const oldId = store.getState().records[0]?.recordId;
    store.getState().restart();
    expect(store.getState().records[0]?.recordId).not.toBe(oldId);
    expect(domainRecords(store.getState().records)).toHaveLength(0);
    expect(store.getState().truth.storageUsedGB).toBe(0);
    expect(store.getState().running).toBe(false);
  });
});
