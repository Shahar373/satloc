import { useMemo } from 'react';
import { gmstAt, orbitalPeriodMinutes, propagateTeme, speedKmS, temeToGroundPoint } from '../core/propagation/sgp4';
import { elementSetAgeDays, type ElementSet } from '../core/tle/omm';
import { useViewerStore } from '../state/viewer';

export interface LiveOrbit {
  time: Date;
  altitudeKm: number;
  speedKmS: number;
  latitudeDeg: number;
  longitudeDeg: number;
  periodMin: number;
  elementAgeDays: number;
  error: string | null;
}

/** Live numbers for one satellite, refreshed with the (throttled) simulation clock. */
export function useLiveOrbit(set: ElementSet | undefined): LiveOrbit | null {
  const simTime = useViewerStore((s) => s.simTime);
  return useMemo(() => {
    if (!set || !simTime) return null;
    const base = {
      time: simTime,
      periodMin: orbitalPeriodMinutes(set.satrec),
      elementAgeDays: elementSetAgeDays(set, simTime),
    };
    try {
      const state = propagateTeme(set.satrec, simTime);
      const ground = temeToGroundPoint(state.position, gmstAt(simTime));
      return {
        ...base,
        altitudeKm: ground.heightKm,
        speedKmS: speedKmS(state),
        latitudeDeg: (ground.latitude * 180) / Math.PI,
        longitudeDeg: (ground.longitude * 180) / Math.PI,
        error: null,
      };
    } catch (err) {
      return {
        ...base,
        altitudeKm: NaN,
        speedKmS: NaN,
        latitudeDeg: NaN,
        longitudeDeg: NaN,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [set, simTime]);
}
