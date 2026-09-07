import type { Provenance } from './domain';

/**
 * `HardBlock` disables committing a plan outright — there is no override for physics/capacity
 * violations. `WaivableWarning` allows committing only after an explicit operator waiver (recorded
 * as a `WarningWaived` OperatorAction, src/contracts/events.ts, and shown in Debrief). `Info` is
 * shown but never blocks anything.
 */
export type ValidationSeverity = 'HardBlock' | 'WaivableWarning' | 'Info';

export interface EntityRef {
  kind: 'task' | 'command' | 'contact' | 'target' | 'station' | 'dataProduct';
  id: string;
}

/**
 * One validation result from a rule in the future Plan workspace's Validator
 * (docs/design/operator-simulation.md). `suggestedFix` is a placeholder shape (a label only) —
 * this project has no `PlanAction` type yet to wire an actual fix action to; a future PR that adds
 * one should extend this field, not invent a second finding shape alongside it.
 */
export interface ValidationFinding {
  code: string;
  severity: ValidationSeverity;
  message: string;
  /** The physical/logical explanation, with the actual numbers — not just "storage insufficient" but why. */
  why: string;
  suggestedFix?: { label: string };
  affectedEntities: EntityRef[];
  /** True only for `WaivableWarning` — a `HardBlock` or `Info` finding is never waivable. */
  waivable: boolean;
  /** Provenance of the value that drove this finding (e.g. the profile field it checked). */
  provenance: Provenance;
  /** Rule id + source, e.g. 'rules/storage-budget@1'. */
  source: string;
}
