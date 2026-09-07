import type { DataProduct, ImagingMode } from './domain';

/**
 * A starter, representative set of event variants for each stream — enough to type-check the
 * envelope/log/replay machinery meaningfully and demonstrate the versioned-`type` convention
 * (`'Name@1'`, so a future schema change adds `'Name@2'` alongside it rather than breaking old
 * session files). Deliberately not exhaustive: the Plan workspace, Train console, and Scenario
 * 01/02 PRs each add the variants they actually need, rather than this file guessing them now.
 */

// ---- Domain events: change Truth State. Nothing else may. ----

export interface CommandAccepted {
  type: 'CommandAccepted@1';
  commandId: string;
  taskId: string;
}

export interface CommandRejected {
  type: 'CommandRejected@1';
  commandId: string;
  taskId: string;
  reason: string;
}

export interface CommandExecuted {
  type: 'CommandExecuted@1';
  commandId: string;
  taskId: string;
}

export interface TaskStarted {
  type: 'TaskStarted@1';
  taskId: string;
}

export interface TaskCompleted {
  type: 'TaskCompleted@1';
  taskId: string;
  outcome: 'success' | 'partial' | 'failed';
}

export interface DataProductStored {
  type: 'DataProductStored@1';
  dataProduct: DataProduct;
}

export interface ContactAcquired {
  type: 'ContactAcquired@1';
  stationId: string;
  contactId: string;
}

export interface ContactLost {
  type: 'ContactLost@1';
  stationId: string;
  contactId: string;
}

export interface DownlinkCompleted {
  type: 'DownlinkCompleted@1';
  contactId: string;
  dataProductId: string;
  mode: ImagingMode;
}

export type DomainEvent =
  | CommandAccepted
  | CommandRejected
  | CommandExecuted
  | TaskStarted
  | TaskCompleted
  | DataProductStored
  | ContactAcquired
  | ContactLost
  | DownlinkCompleted;

// ---- Operator actions: what the operator did. Informative on replay, never mutate Truth directly. ----

export interface CommandSubmitted {
  type: 'CommandSubmitted@1';
  commandId: string;
  taskId: string;
}

export interface WarningWaived {
  type: 'WarningWaived@1';
  code: string;
  reason: string;
}

export interface PlanCommitted {
  type: 'PlanCommitted@1';
  planId: string;
}

export type OperatorAction = CommandSubmitted | WarningWaived | PlanCommitted;

// ---- Run-control events: how the operator drove the simulation clock (pause/rate/seek). ----

export interface SimulationStarted {
  type: 'SimulationStarted@1';
  scenarioId: string;
  seed: string;
}

export interface SimulationPaused {
  type: 'SimulationPaused@1';
}

export interface SimulationResumed {
  type: 'SimulationResumed@1';
}

export interface SimulationRateChanged {
  type: 'SimulationRateChanged@1';
  rate: number;
}

export interface SimulationSeeked {
  type: 'SimulationSeeked@1';
  toSimTime: string;
}

export type RunControlEvent =
  SimulationStarted | SimulationPaused | SimulationResumed | SimulationRateChanged | SimulationSeeked;
