import type { DataProduct, TaskStatus } from '../../contracts/domain';
import type { DomainEvent } from '../../contracts/events';

/**
 * Ground truth, folded from the DomainEvent stream — the "what actually happened" state a Truth
 * reducer maintains, kept deliberately separate from Operator Observables (what the operator can
 * currently *see*, which may lag or omit parts of this — that split is the future Plan/Train UI's
 * job, this module only produces the truth side of it). See
 * docs/design/operator-simulation.md's "Truth State vs Operator Observables" section.
 *
 * This only tracks what the current DomainEvent set (src/contracts/events.ts, explicitly a
 * starter/non-exhaustive set) actually conveys — it does not invent fields no event carries. In
 * particular there is no `TaskCreated`/`TaskPlanned` event yet, so a task only appears in
 * `taskStatus` once something has actually happened to it (`TaskStarted`/`TaskCompleted`); a
 * future PR that adds a task-creation event should extend this reducer to handle it, not have
 * this one guess a task's existence from nothing.
 */
export interface TruthState {
  /** Status per task, as implied by the events seen so far (no entry = nothing has happened to it yet). */
  taskStatus: Record<string, TaskStatus>;
  /** Status per command. */
  commandStatus: Record<string, 'accepted' | 'rejected' | 'executed'>;
  /** Data products currently stored onboard (not yet downlinked) — see `storageUsedGB`'s doc comment for the modeling assumption this rests on. */
  dataProducts: Record<string, DataProduct>;
  /** Ids of data products that have been downlinked and are no longer counted onboard. */
  downlinkedDataProductIds: string[];
  /** Ground-contact ids with a `ContactAcquired` seen and no matching `ContactLost` yet. */
  activeContactIds: string[];
  /**
   * Sum of `sizeGB` for everything still in `dataProducts`. Modeling assumption: a downlinked
   * product is removed from onboard storage (freeing its space) since there is no
   * `DataProductDeleted` event to model an explicit, separate deletion step — downlink is treated
   * as the only way storage is freed in this version.
   */
  storageUsedGB: number;
}

export function initialTruthState(): TruthState {
  return {
    taskStatus: {},
    commandStatus: {},
    dataProducts: {},
    downlinkedDataProductIds: [],
    activeContactIds: [],
    storageUsedGB: 0,
  };
}

/** Folds one DomainEvent into the state, returning a new TruthState (the input is never mutated). */
export function applyDomainEvent(state: TruthState, event: DomainEvent): TruthState {
  switch (event.type) {
    case 'CommandAccepted@1':
      return { ...state, commandStatus: { ...state.commandStatus, [event.commandId]: 'accepted' } };
    case 'CommandRejected@1':
      return { ...state, commandStatus: { ...state.commandStatus, [event.commandId]: 'rejected' } };
    case 'CommandExecuted@1':
      return { ...state, commandStatus: { ...state.commandStatus, [event.commandId]: 'executed' } };

    case 'TaskStarted@1':
      return { ...state, taskStatus: { ...state.taskStatus, [event.taskId]: 'active' } };
    case 'TaskCompleted@1':
      return {
        ...state,
        // TaskStatus has no 'partial' state; a partial outcome still counts as the task having
        // finished (not still active, not an outright failure) — see the class doc comment.
        taskStatus: { ...state.taskStatus, [event.taskId]: event.outcome === 'failed' ? 'failed' : 'completed' },
      };

    case 'DataProductStored@1': {
      // Adjust by the size delta rather than always adding sizeGB, so a duplicate/replayed event
      // for the same product id (a retry, say) can't silently double-count storage used.
      const previousSizeGB = state.dataProducts[event.dataProduct.id]?.sizeGB ?? 0;
      return {
        ...state,
        dataProducts: { ...state.dataProducts, [event.dataProduct.id]: event.dataProduct },
        storageUsedGB: state.storageUsedGB - previousSizeGB + event.dataProduct.sizeGB,
      };
    }

    case 'ContactAcquired@1':
      return state.activeContactIds.includes(event.contactId)
        ? state
        : { ...state, activeContactIds: [...state.activeContactIds, event.contactId] };
    case 'ContactLost@1':
      return { ...state, activeContactIds: state.activeContactIds.filter((id) => id !== event.contactId) };

    case 'DownlinkCompleted@1': {
      const product = state.dataProducts[event.dataProductId];
      if (!product)
        return { ...state, downlinkedDataProductIds: [...state.downlinkedDataProductIds, event.dataProductId] };
      const remaining = { ...state.dataProducts };
      delete remaining[event.dataProductId];
      return {
        ...state,
        dataProducts: remaining,
        downlinkedDataProductIds: [...state.downlinkedDataProductIds, event.dataProductId],
        storageUsedGB: state.storageUsedGB - product.sizeGB,
      };
    }
  }
}

/** Folds a whole ordered event stream (e.g. `domainRecords(log.records).map(r => r.event)`) into TruthState, starting from `initial` (default: `initialTruthState()`). */
export function foldTruthState(events: readonly DomainEvent[], initial: TruthState = initialTruthState()): TruthState {
  return events.reduce(applyDomainEvent, initial);
}
