import { describe, expect, it } from 'vitest';
import { ASTERIA_1_PROFILE } from '../../contracts/asteria1';
import type { CommandSubmitted } from '../../contracts/events';
import type { ValidationFinding } from '../../contracts/validation';
import { initialTruthState } from '../truth/TruthState';
import { compileCommand } from './commandCompiler';
import { checkStorageBudget } from './storageBudget';

const SUBMITTED: CommandSubmitted = { type: 'CommandSubmitted@1', commandId: 'cmd-1', taskId: 'task-1' };

const infoFinding: ValidationFinding = {
  code: 'STORAGE_UTILISATION_LOW',
  severity: 'Info',
  message: 'info only',
  why: 'why',
  affectedEntities: [],
  waivable: false,
  provenance: 'calculated',
  source: 'rules/test@1',
};

const warningFinding: ValidationFinding = {
  ...infoFinding,
  code: 'ELEMENTS_STALE',
  severity: 'WaivableWarning',
  waivable: true,
};

const hardBlockFinding: ValidationFinding = {
  ...infoFinding,
  code: 'STORAGE_INSUFFICIENT',
  severity: 'HardBlock',
  message: 'storage insufficient',
};

describe('compileCommand', () => {
  it('accepts when there are no findings at all', () => {
    const event = compileCommand(SUBMITTED, []);
    expect(event).toEqual({ type: 'CommandAccepted@1', commandId: 'cmd-1', taskId: 'task-1' });
  });

  it('accepts when only Info/WaivableWarning findings apply — those never block a command', () => {
    const event = compileCommand(SUBMITTED, [infoFinding, warningFinding]);
    expect(event).toEqual({ type: 'CommandAccepted@1', commandId: 'cmd-1', taskId: 'task-1' });
  });

  it('rejects when a HardBlock finding applies, using its message as the reason', () => {
    const event = compileCommand(SUBMITTED, [infoFinding, hardBlockFinding]);
    expect(event).toEqual({
      type: 'CommandRejected@1',
      commandId: 'cmd-1',
      taskId: 'task-1',
      reason: 'storage insufficient',
    });
  });

  it("uses the first HardBlock finding's message when more than one applies", () => {
    const secondHardBlock: ValidationFinding = { ...hardBlockFinding, code: 'OTHER', message: 'second reason' };
    const event = compileCommand(SUBMITTED, [hardBlockFinding, secondHardBlock]);
    expect(event).toEqual({
      type: 'CommandRejected@1',
      commandId: 'cmd-1',
      taskId: 'task-1',
      reason: 'storage insufficient',
    });
  });

  it('integrates with a real Validator rule: a command whose product would overflow storage is rejected', () => {
    const truth = { ...initialTruthState(), storageUsedGB: 5.9 }; // Asteria-1 usable budget is 6 GB
    const finding = checkStorageBudget(ASTERIA_1_PROFILE, truth, {
      id: 'dp-1',
      taskId: 'task-1',
      mode: 'PAN',
      sizeGB: 1.2,
    });
    const event = compileCommand(SUBMITTED, finding ? [finding] : []);
    expect(event.type).toBe('CommandRejected@1');
  });
});
