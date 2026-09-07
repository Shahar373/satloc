/**
 * Domain model types shared by the operator-simulation vertical slice (Phase C onward). These
 * are intentionally minimal where a subsystem hasn't landed yet (Task/Command in particular —
 * their real shape is the Plan workspace/Validator's job, not this file's) rather than
 * pre-guessing fields nothing consumes yet. `SatelliteProfile`, by contrast, is fully specified
 * here because its shape and consistency rules are already pinned down by the storage model this
 * was designed against (docs/DESIGN.md's operator-simulation plan, §5).
 */

export type ImagingMode = 'PAN' | 'MS';

/** How a value in a profile or plan came to be, shown in the UI so nothing simulated is mistaken for real telemetry. */
export type Provenance = 'assumed' | 'simulated' | 'calculated' | 'public-fact';

export interface GroundStation {
  id: string;
  name: string;
  latitudeDeg: number;
  longitudeDeg: number;
  minElevationDeg: number;
}

export interface SatelliteProfile {
  id: string;
  name: string;
  /** All GB fields are decimal (10^9 bytes); the UI may offer GiB as a display-only conversion. */
  units: 'GB-decimal';
  storage: {
    rawGB: number;
    reservedGB: number;
    productGB: Record<ImagingMode, number>;
  };
  downlink: {
    rateMbps: number;
    /** Seconds of a contact spent acquiring lock before useful downlink throughput starts. */
    acquisitionS: number;
  };
  imaging: {
    maxRollDeg: number;
    slewRateDegPerS: number;
    settlingS: number;
    sunElevationConstraintDeg: number;
  };
  uplinkKbps: number;
  /** Provenance per top-level field path (e.g. 'storage.rawGB'), so the UI can label each value. */
  provenance: Record<string, Provenance>;
}

/** `rawGB - reservedGB`. */
export function usableStorageGB(profile: SatelliteProfile): number {
  return profile.storage.rawGB - profile.storage.reservedGB;
}

/** `floor(usableStorageGB / productGB(mode))`. */
export function maxProducts(profile: SatelliteProfile, mode: ImagingMode): number {
  return Math.floor(usableStorageGB(profile) / profile.storage.productGB[mode]);
}

/** `rateMbps * max(0, durationS - acquisitionS) / 8000` — megabits/s to gigabytes, minus acquisition overhead. */
export function downlinkGB(profile: SatelliteProfile, contactDurationS: number): number {
  const usefulS = Math.max(0, contactDurationS - profile.downlink.acquisitionS);
  return (profile.downlink.rateMbps * usefulS) / 8000;
}

/**
 * Profile-only consistency checks (the ones that don't need a scenario's contact list — the
 * "downlink per shortest planned contact" check belongs with the scenario that has one).
 * Returns violation descriptions; empty means the profile is internally consistent.
 */
export function checkProfileConsistency(profile: SatelliteProfile): string[] {
  const violations: string[] = [];
  if (!(profile.storage.reservedGB < profile.storage.rawGB)) {
    violations.push(`reservedGB (${profile.storage.reservedGB}) must be less than rawGB (${profile.storage.rawGB})`);
  }
  const usable = usableStorageGB(profile);
  for (const [mode, productGB] of Object.entries(profile.storage.productGB) as [ImagingMode, number][]) {
    if (!(productGB <= usable)) {
      violations.push(`productGB.${mode} (${productGB}) must be <= usable storage (${usable})`);
    }
    if (!(maxProducts(profile, mode) >= 1)) {
      violations.push(`maxProducts for ${mode} must be >= 1 (usable ${usable} / productGB ${productGB})`);
    }
  }
  return violations;
}

export type TaskKind = 'image' | 'downlink';
export type TaskStatus = 'planned' | 'active' | 'completed' | 'failed';

export interface Task {
  id: string;
  kind: TaskKind;
  status: TaskStatus;
}

export interface Command {
  id: string;
  taskId: string;
  type: string;
}

export interface DataProduct {
  id: string;
  taskId: string;
  mode: ImagingMode;
  sizeGB: number;
}
