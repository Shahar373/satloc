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

export interface Preset {
  id: string;
  name: string;
  description?: string;
  satellites: PresetSatellite[];
  historical?: { noradId: number; name: string; intlDesignator: string; launched: string; decayed: string }[];
}

export const ISI_PRESET: Preset = isiPreset as Preset;

export const PRESETS: Preset[] = [ISI_PRESET];

export function presetSatellite(noradId: number): { preset: Preset; sat: PresetSatellite } | undefined {
  for (const preset of PRESETS) {
    const sat = preset.satellites.find((s) => s.noradId === noradId);
    if (sat) return { preset, sat };
  }
  return undefined;
}
