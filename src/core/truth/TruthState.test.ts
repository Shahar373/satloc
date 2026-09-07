import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../contracts/events';
import { applyDomainEvent, foldTruthState, initialTruthState } from './TruthState';

const product = (id: string, sizeGB: number): DomainEvent => ({
  type: 'DataProductStored@1',
  dataProduct: { id, taskId: 'task-1', mode: 'PAN', sizeGB },
});

describe('applyDomainEvent', () => {
  it('starts empty', () => {
    const state = initialTruthState();
    expect(state.taskStatus).toEqual({});
    expect(state.storageUsedGB).toBe(0);
  });

  it('does not mutate the input state', () => {
    const before = initialTruthState();
    const snapshot = JSON.parse(JSON.stringify(before)) as unknown;
    applyDomainEvent(before, { type: 'TaskStarted@1', taskId: 'task-1' });
    expect(before).toEqual(snapshot);
  });

  it('tracks command status transitions', () => {
    let state = initialTruthState();
    state = applyDomainEvent(state, { type: 'CommandAccepted@1', commandId: 'cmd-1', taskId: 'task-1' });
    expect(state.commandStatus['cmd-1']).toBe('accepted');
    state = applyDomainEvent(state, { type: 'CommandExecuted@1', commandId: 'cmd-1', taskId: 'task-1' });
    expect(state.commandStatus['cmd-1']).toBe('executed');
  });

  it('tracks task status: started -> active, completed(success) -> completed, completed(failed) -> failed', () => {
    let state = initialTruthState();
    state = applyDomainEvent(state, { type: 'TaskStarted@1', taskId: 'task-1' });
    expect(state.taskStatus['task-1']).toBe('active');

    state = applyDomainEvent(state, { type: 'TaskCompleted@1', taskId: 'task-1', outcome: 'success' });
    expect(state.taskStatus['task-1']).toBe('completed');

    state = applyDomainEvent(state, { type: 'TaskStarted@1', taskId: 'task-2' });
    state = applyDomainEvent(state, { type: 'TaskCompleted@1', taskId: 'task-2', outcome: 'failed' });
    expect(state.taskStatus['task-2']).toBe('failed');
  });

  it('a partial outcome still counts as completed (TaskStatus has no partial state)', () => {
    let state = initialTruthState();
    state = applyDomainEvent(state, { type: 'TaskCompleted@1', taskId: 'task-1', outcome: 'partial' });
    expect(state.taskStatus['task-1']).toBe('completed');
  });

  it('DataProductStored adds the product and accumulates storageUsedGB', () => {
    let state = initialTruthState();
    state = applyDomainEvent(state, product('dp-1', 1.2));
    state = applyDomainEvent(state, product('dp-2', 0.4));
    expect(state.dataProducts['dp-1']).toEqual({ id: 'dp-1', taskId: 'task-1', mode: 'PAN', sizeGB: 1.2 });
    expect(state.storageUsedGB).toBeCloseTo(1.6, 5);
  });

  it('storing the same product id twice adjusts by the size delta, not a blind add (no double-counting a replayed event)', () => {
    let state = initialTruthState();
    state = applyDomainEvent(state, product('dp-1', 1.2));
    state = applyDomainEvent(state, product('dp-1', 1.2)); // the exact same event fired again
    expect(state.storageUsedGB).toBeCloseTo(1.2, 5);

    state = applyDomainEvent(state, product('dp-1', 2)); // a genuinely revised size for the same id
    expect(state.storageUsedGB).toBeCloseTo(2, 5);
  });

  it('DownlinkCompleted removes the product from onboard storage and frees its space', () => {
    let state = initialTruthState();
    state = applyDomainEvent(state, product('dp-1', 1.2));
    state = applyDomainEvent(state, {
      type: 'DownlinkCompleted@1',
      contactId: 'contact-1',
      dataProductId: 'dp-1',
      mode: 'PAN',
    });
    expect(state.dataProducts['dp-1']).toBeUndefined();
    expect(state.downlinkedDataProductIds).toEqual(['dp-1']);
    expect(state.storageUsedGB).toBe(0);
  });

  it('DownlinkCompleted for an unknown product id is recorded without touching storageUsedGB', () => {
    const state = applyDomainEvent(initialTruthState(), {
      type: 'DownlinkCompleted@1',
      contactId: 'contact-1',
      dataProductId: 'never-stored',
      mode: 'PAN',
    });
    expect(state.downlinkedDataProductIds).toEqual(['never-stored']);
    expect(state.storageUsedGB).toBe(0);
  });

  it('tracks active contacts: acquired adds, lost removes, and acquiring twice does not duplicate', () => {
    let state = initialTruthState();
    state = applyDomainEvent(state, { type: 'ContactAcquired@1', stationId: 'gs-1', contactId: 'contact-1' });
    state = applyDomainEvent(state, { type: 'ContactAcquired@1', stationId: 'gs-1', contactId: 'contact-1' });
    expect(state.activeContactIds).toEqual(['contact-1']);

    state = applyDomainEvent(state, { type: 'ContactLost@1', stationId: 'gs-1', contactId: 'contact-1' });
    expect(state.activeContactIds).toEqual([]);
  });
});

describe('foldTruthState', () => {
  it('folds a whole event sequence in order', () => {
    const events: DomainEvent[] = [
      { type: 'TaskStarted@1', taskId: 'task-1' },
      product('dp-1', 1.2),
      { type: 'DownlinkCompleted@1', contactId: 'contact-1', dataProductId: 'dp-1', mode: 'PAN' },
      { type: 'TaskCompleted@1', taskId: 'task-1', outcome: 'success' },
    ];
    const state = foldTruthState(events);
    expect(state.taskStatus['task-1']).toBe('completed');
    expect(state.storageUsedGB).toBe(0);
    expect(state.downlinkedDataProductIds).toEqual(['dp-1']);
  });

  it('folds onto a given initial state instead of always starting empty', () => {
    const base = applyDomainEvent(initialTruthState(), product('dp-1', 2));
    const state = foldTruthState([product('dp-2', 1)], base);
    expect(state.storageUsedGB).toBeCloseTo(3, 5);
  });
});
