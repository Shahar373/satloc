import type { ImagingMode } from '../../contracts/domain';
import type { ScenarioDefinition } from '../../contracts/scenario';
import type { ValidationFinding } from '../../contracts/validation';
import type { Pass } from '../passes/predict';
import { elementSetAgeDays, satrecEpochDate, tleToElementSet } from '../tle/omm';
import { checkElementsStale } from '../validation/elementsStale';
import { evaluatePlanDraft, type DownlinkPlanCandidate, type ImagingPlanCandidate } from './planDraft';
import type { ScheduledEvent } from './realDemoTimeline';

export interface ScheduledDownlinkCandidate extends DownlinkPlanCandidate {
  stationId: string;
  pass: Pass;
}
export type ExecutableCandidate = ImagingPlanCandidate | ScheduledDownlinkCandidate;
export interface PlanWaiver {
  candidateId: string;
  code: string;
  reason: string;
}
export interface PlanTask {
  id: string;
  kind: 'imaging' | 'downlink';
  subject: string;
  mode?: ImagingMode;
  start: Date;
}
export interface CompiledPlan {
  id: string;
  scenarioId: string;
  candidates: ExecutableCandidate[];
  tasks: PlanTask[];
  timeline: ScheduledEvent[];
  waivers: PlanWaiver[];
}

export const candidateStart = (c: ExecutableCandidate): Date =>
  c.kind === 'imaging' ? c.opportunity.start : c.pass.aos;
export const candidateEnd = (c: ExecutableCandidate): Date => (c.kind === 'imaging' ? c.opportunity.end : c.pass.los);
export const waiverKey = (candidateId: string, code: string): string => `${candidateId}|${code}`;

function block(code: string, message: string, candidateId?: string): ValidationFinding {
  return {
    code,
    severity: 'HardBlock',
    message,
    why: message,
    affectedEntities: candidateId ? [{ kind: 'task', id: candidateId }] : [],
    waivable: false,
    provenance: 'calculated',
    source: 'executable-plan@1',
  };
}

/**
 * Forecasts are trusted outputs from the bundled scenario/ForecastClient, not imported user data.
 * Normalize times/element age here and validate the entire sequence before any runner is replaced.
 * One spacecraft resource: imaging windows and full selected contact windows cannot overlap.
 */
export function evaluateExecutablePlan(scenario: ScenarioDefinition, candidates: readonly ExecutableCandidate[]) {
  const { satrec } = tleToElementSet(scenario.tle.line1, scenario.tle.line2, scenario.tle.name);
  const epoch = satrecEpochDate(satrec);
  const ordered = candidates
    .map((c): ExecutableCandidate =>
      c.kind === 'imaging'
        ? { ...c, elementSetAgeDays: elementSetAgeDays({ epoch }, c.opportunity.time) }
        : { ...c, durationS: (c.pass.los.getTime() - c.pass.aos.getTime()) / 1000 },
    )
    .sort((a, b) => candidateStart(a).getTime() - candidateStart(b).getTime() || a.id.localeCompare(b.id));
  const rows = evaluatePlanDraft(scenario.satellite, ordered).map((row, i) => ({ ...row, candidate: ordered[i] }));
  const planFindings: ValidationFinding[] = [];
  if (!ordered.some((c) => c.kind === 'imaging'))
    planFindings.push(block('PLAN_CAPTURE_REQUIRED', 'Select at least one capture.'));
  const ids = new Set<string>();
  const contacts = new Set<string>();
  let occupiedUntil = -Infinity;

  for (const row of rows) {
    const c = row.candidate;
    const start = candidateStart(c).getTime();
    const end = candidateEnd(c).getTime();
    const add = (code: string, message: string) => row.findings.push(block(code, message, c.id));
    if (ids.has(c.id)) add('PLAN_DUPLICATE', 'Each task must have a unique ID.');
    ids.add(c.id);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end < start ||
      start < new Date(scenario.startTime).getTime()
    ) {
      add('PLAN_INVALID_TIME', 'Tasks must have valid, ordered times at or after the scenario start.');
    }
    if (start < occupiedUntil)
      add('PLAN_TASK_OVERLAP', 'Imaging and downlink windows must not overlap on this spacecraft.');
    occupiedUntil = Math.max(occupiedUntil, end);

    if (c.kind === 'imaging') {
      if (!scenario.targets.some((t) => t.id === c.targetId))
        add('PLAN_UNKNOWN_TARGET', 'Choose a target from this scenario.');
      if (
        !Number.isFinite(c.opportunity.offNadirDeg) ||
        c.opportunity.offNadirDeg < 0 ||
        !Number.isFinite(c.opportunity.time.getTime())
      ) {
        add('PLAN_INVALID_TIME', 'Capture geometry and time must be finite.');
      }
      if (c.opportunity.continuesAfterEnd) add('PLAN_INCOMPLETE_WINDOW', 'Choose a complete forecast window.');
      if (!ordered.some((d) => d.kind === 'downlink' && d.dataProductCandidateIds.includes(c.id))) {
        add('PLAN_DOWNLINK_REQUIRED', 'Assign this capture to a later downlink before running the plan.');
      }
    } else {
      if (!scenario.groundStations.some((s) => s.id === c.stationId))
        add('PLAN_UNKNOWN_STATION', 'Choose a ground station from this scenario.');
      if (contacts.has(c.contactId)) add('PLAN_DUPLICATE', 'Use a contact only once in a plan.');
      contacts.add(c.contactId);
      if (c.pass.inProgressAtStart || c.pass.continuesAfterEnd)
        add('PLAN_INCOMPLETE_WINDOW', 'Choose a complete forecast contact.');
      if (
        !c.dataProductCandidateIds.length ||
        new Set(c.dataProductCandidateIds).size !== c.dataProductCandidateIds.length
      ) {
        add('PLAN_PRODUCTS_REQUIRED', 'A downlink must contain a non-empty set of distinct products.');
      }
      for (const id of c.dataProductCandidateIds) {
        const image = ordered.find((x) => x.id === id && x.kind === 'imaging');
        if (!image || candidateEnd(image).getTime() > start)
          add('DOWNLINK_PRODUCT_MISSING', 'Downlink must follow the complete capture window.');
      }
      const stale = checkElementsStale({
        taskId: c.id,
        targetId: c.stationId,
        ageDays: elementSetAgeDays({ epoch }, c.pass.aos),
      });
      if (stale)
        row.findings.push({
          ...stale,
          affectedEntities: [
            { kind: 'task', id: c.id },
            { kind: 'station', id: c.stationId },
          ],
        });
    }
  }
  const findings = [...planFindings, ...rows.flatMap((r) => r.findings)];
  const warnings = rows.flatMap((r) =>
    r.findings
      .filter((f) => f.severity === 'WaivableWarning')
      .map((f) => ({ candidateId: r.candidate.id, finding: f })),
  );
  return {
    rows,
    findings,
    warnings,
    hardBlocked: findings.some((f) => f.severity === 'HardBlock'),
    peakStorageGB: Math.max(0, ...rows.map((r) => r.cumulativeStorageUsedGB)),
    remainingStorageGB: rows.at(-1)?.cumulativeStorageUsedGB ?? 0,
  };
}

/** Throws before creating any events if physical constraints or explicit warning waivers are missing. */
export function compilePlan(
  scenario: ScenarioDefinition,
  candidates: readonly ExecutableCandidate[],
  waivers: readonly PlanWaiver[],
  id: string,
): CompiledPlan {
  const validation = evaluateExecutablePlan(scenario, candidates);
  if (validation.hardBlocked)
    throw new Error(
      validation.findings
        .filter((f) => f.severity === 'HardBlock')
        .map((f) => f.message)
        .join('; '),
    );
  const acceptedWaivers = validation.warnings.map(({ candidateId, finding }) => {
    const waiver = waivers.find((w) => w.candidateId === candidateId && w.code === finding.code && w.reason.trim());
    if (!waiver) throw new Error(`Explicit waiver required: ${candidateId} / ${finding.code}`);
    return { ...waiver, reason: waiver.reason.trim() };
  });
  // A committed plan is a snapshot. Subsequent draft edits must never alter the running schedule.
  const snapshot = structuredClone(validation.rows.map((r) => r.candidate));
  const tasks: PlanTask[] = [];
  const timeline: ScheduledEvent[] = [];
  for (const c of snapshot) {
    const commandId = `command:${c.id}`;
    if (c.kind === 'imaging') {
      const target = scenario.targets.find((t) => t.id === c.targetId);
      if (!target) throw new Error('Validated target is missing');
      tasks.push({
        id: c.id,
        kind: c.kind,
        mode: c.mode,
        subject: target.name,
        start: c.opportunity.start,
      });
      timeline.push(
        { simTime: c.opportunity.start, event: { type: 'TaskStarted@1', taskId: c.id } },
        { simTime: c.opportunity.time, event: { type: 'CommandExecuted@1', commandId, taskId: c.id } },
        {
          simTime: c.opportunity.time,
          event: {
            type: 'DataProductStored@1',
            dataProduct: { id: c.id, taskId: c.id, mode: c.mode, sizeGB: scenario.satellite.storage.productGB[c.mode] },
          },
        },
        { simTime: c.opportunity.end, event: { type: 'TaskCompleted@1', taskId: c.id, outcome: 'success' } },
      );
    } else {
      const station = scenario.groundStations.find((s) => s.id === c.stationId);
      if (!station) throw new Error('Validated station is missing');
      tasks.push({
        id: c.id,
        kind: c.kind,
        subject: station.name,
        start: c.pass.aos,
      });
      let elapsedMs = scenario.satellite.downlink.acquisitionS * 1000;
      timeline.push(
        { simTime: c.pass.aos, event: { type: 'ContactAcquired@1', contactId: c.contactId, stationId: c.stationId } },
        { simTime: c.pass.aos, event: { type: 'TaskStarted@1', taskId: c.id } },
        {
          simTime: new Date(c.pass.aos.getTime() + elapsedMs),
          event: { type: 'CommandExecuted@1', commandId, taskId: c.id },
        },
      );
      for (const imageId of c.dataProductCandidateIds) {
        const image = snapshot.find((p): p is ImagingPlanCandidate => p.kind === 'imaging' && p.id === imageId);
        if (!image) throw new Error('Validated product is missing');
        elapsedMs +=
          ((scenario.satellite.storage.productGB[image.mode] * 8000) / scenario.satellite.downlink.rateMbps) * 1000;
        // Floor to JS's millisecond resolution: an exactly-full contact must finish by LOS.
        timeline.push({
          simTime: new Date(c.pass.aos.getTime() + Math.floor(elapsedMs)),
          event: { type: 'DownlinkCompleted@1', contactId: c.contactId, dataProductId: imageId, mode: image.mode },
        });
      }
      timeline.push(
        {
          simTime: new Date(c.pass.aos.getTime() + Math.floor(elapsedMs)),
          event: { type: 'TaskCompleted@1', taskId: c.id, outcome: 'success' },
        },
        { simTime: c.pass.los, event: { type: 'ContactLost@1', contactId: c.contactId, stationId: c.stationId } },
      );
    }
  }
  timeline.sort((a, b) => a.simTime.getTime() - b.simTime.getTime());
  return { id, scenarioId: scenario.id, candidates: snapshot, tasks, timeline, waivers: acceptedWaivers };
}
