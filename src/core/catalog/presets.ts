import isiPreset from '../../data/isi.json';

export interface PresetSatellite {
  noradId: number;
  name: string;
  intlDesignator: string;
  launched: string;
  /** Nadir imaging swath width, km (imaging satellites only). */
  swathKm?: number;
  /** Best panchromatic ground resolution, metres (imaging satellites only). */
  resolutionM?: number;
  status: 'active' | 'inactive';
}

export interface HistoricalSatellite {
  noradId: number;
  name: string;
  intlDesignator: string;
  launched: string;
  /** Re-entry date; no element sets exist after it. */
  decayed: string;
  swathKm?: number;
  resolutionM?: number;
}

export interface Preset {
  id: string;
  name: string;
  description?: string;
  /** Satellites currently in orbit. Only these are fetched and displayed. */
  satellites: PresetSatellite[];
  historical?: HistoricalSatellite[];
}

export const ISI_PRESET: Preset = isiPreset as Preset;

export const PRESETS: Preset[] = [ISI_PRESET];

/** True when the catalogue number belongs to a satellite we track in any preset. */
export function isPresetSatellite(noradId: number): boolean {
  return PRESETS.some((p) => p.satellites.some((s) => s.noradId === noradId));
}

export function presetSatellite(noradId: number): { preset: Preset; sat: PresetSatellite } | undefined {
  for (const preset of PRESETS) {
    const sat = preset.satellites.find((s) => s.noradId === noradId);
    if (sat) return { preset, sat };
  }
  return undefined;
}
