import { describe, expect, it } from 'vitest';
import { ASTERIA_1_PROFILE } from '../../contracts/asteria1';
import type { DataProduct } from '../../contracts/domain';
import { initialTruthState, type TruthState } from '../truth/TruthState';
import { checkStorageBudget } from './storageBudget';

// Asteria-1's usable storage is 6 GB (8 rawGB - 2 reservedGB), PAN product 1.2 GB (see asteria1.ts).
const product = (id: string, sizeGB: number): DataProduct => ({ id, taskId: 'task-1', mode: 'PAN', sizeGB });
const truthWithStored = (storageUsedGB: number): TruthState => ({ ...initialTruthState(), storageUsedGB });

describe('checkStorageBudget', () => {
  it('returns null when the candidate fits comfortably within the budget', () => {
    const finding = checkStorageBudget(ASTERIA_1_PROFILE, truthWithStored(0), product('dp-1', 1.2));
    expect(finding).toBeNull();
  });

  it('returns null exactly at the budget limit (inclusive boundary)', () => {
    const finding = checkStorageBudget(ASTERIA_1_PROFILE, truthWithStored(4.8), product('dp-1', 1.2)); // 4.8 + 1.2 = 6.0 exactly
    expect(finding).toBeNull();
  });

  it('returns a STORAGE_INSUFFICIENT HardBlock finding when the candidate would exceed the budget', () => {
    const finding = checkStorageBudget(ASTERIA_1_PROFILE, truthWithStored(5.4), product('dp-1', 1.2)); // 5.4 + 1.2 = 6.6 > 6.0
    expect(finding).not.toBeNull();
    expect(finding).toMatchObject({
      code: 'STORAGE_INSUFFICIENT',
      severity: 'HardBlock',
      waivable: false,
      provenance: 'calculated', // usableStorageGB is a derived quantity, not any one raw profile field
      source: 'rules/storage-budget@1',
    });
    expect(finding!.affectedEntities).toEqual([
      { kind: 'dataProduct', id: 'dp-1' },
      { kind: 'task', id: 'task-1' },
    ]);
  });

  it('the why field names the actual numbers involved, not just a generic message', () => {
    const finding = checkStorageBudget(ASTERIA_1_PROFILE, truthWithStored(5.4), product('dp-1', 1.2));
    expect(finding!.why).toContain('5.400 GB already stored');
    expect(finding!.why).toContain('1.2 GB for this product');
    expect(finding!.why).toContain('6.600 GB');
    expect(finding!.why).toContain('rawGB 8');
    expect(finding!.why).toContain('reservedGB 2');
    expect(finding!.why).toContain('= 6 GB');
  });

  it('a candidate already-full profile (no room for even a small product) still blocks correctly', () => {
    const finding = checkStorageBudget(ASTERIA_1_PROFILE, truthWithStored(6), product('dp-1', 0.4));
    expect(finding?.severity).toBe('HardBlock');
  });
});
