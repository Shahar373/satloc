import type { ValidationFinding } from '../../contracts/validation';

export interface ElementsStaleCandidate {
  taskId: string;
  targetId: string;
  /** Age of the element set used to compute this candidate's geometry, in days (`elementSetAgeDays`). */
  ageDays: number;
}

/** Per the original rule table (docs/design/operator-simulation.md): elements older than 3 days are stale. */
export const DEFAULT_MAX_ELEMENT_AGE_DAYS = 3;

/**
 * The first `WaivableWarning` rule (docs/design/operator-simulation.md's rule table lists six
 * candidates for this severity; this is the one that needs nothing beyond the element set's own
 * age — no new geometry, no profile field). A stale element set doesn't make a candidate's
 * predicted geometry (off-nadir angle, imaging window) physically impossible — it means that
 * prediction may have drifted from where the satellite actually is by the time the candidate
 * executes, a growing risk rather than a hard block, so an operator can accept it explicitly
 * (waivable: true) rather than being unable to plan around it at all.
 *
 * Returns `null` when the elements are within `maxAgeDays` (inclusive), or an `ELEMENTS_STALE`
 * finding when they're older.
 */
export function checkElementsStale(
  candidate: ElementsStaleCandidate,
  maxAgeDays: number = DEFAULT_MAX_ELEMENT_AGE_DAYS,
): ValidationFinding | null {
  if (candidate.ageDays <= maxAgeDays) return null;

  return {
    code: 'ELEMENTS_STALE',
    severity: 'WaivableWarning',
    message: `Element set is ${candidate.ageDays.toFixed(1)} days old, past the ${maxAgeDays}-day freshness threshold`,
    why: `This candidate's geometry was computed from an element set ${candidate.ageDays.toFixed(1)} days past its epoch, beyond the ${maxAgeDays}-day threshold this profile assumes for prediction confidence — the satellite's actual position may have drifted from what was predicted by the time this candidate executes.`,
    affectedEntities: [
      { kind: 'task', id: candidate.taskId },
      { kind: 'target', id: candidate.targetId },
    ],
    waivable: true,
    // The 3-day threshold itself is a policy assumption, not a measured or calculated quantity.
    provenance: 'assumed',
    source: 'rules/elements-stale@1',
  };
}
