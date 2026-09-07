import type { CommandSubmitted, DomainEvent } from '../../contracts/events';
import type { ValidationFinding } from '../../contracts/validation';

/**
 * Compiles a submitted command into the DomainEvent that actually changes Truth State: rejected
 * if any `HardBlock` finding applies, accepted otherwise. The next real connector in the
 * pipeline — `OperatorAction -> Validator -> DomainEvent` — feeding whatever it returns into
 * `EventLog`/`ScenarioRunner` (docs/design/operator-simulation.md).
 *
 * Deliberately does not treat `WaivableWarning`/`Info` findings as blocking: waiver-gating (an
 * operator must explicitly waive each `WaivableWarning` before a *plan* commits) is the Plan
 * workspace's concern, at the level of a whole plan, not this function's — a `CommandSubmitted`
 * for one already-planned command isn't the place to re-litigate a plan-level waiver decision.
 * If more than one `HardBlock` finding applies, the first one's message is used as the rejection
 * reason (a UI surfacing every finding does so separately, from the same `findings` array).
 */
export function compileCommand(submitted: CommandSubmitted, findings: ValidationFinding[]): DomainEvent {
  const hardBlock = findings.find((finding) => finding.severity === 'HardBlock');
  if (hardBlock) {
    return {
      type: 'CommandRejected@1',
      commandId: submitted.commandId,
      taskId: submitted.taskId,
      reason: hardBlock.message,
    };
  }
  return { type: 'CommandAccepted@1', commandId: submitted.commandId, taskId: submitted.taskId };
}
