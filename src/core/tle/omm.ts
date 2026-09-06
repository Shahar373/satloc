import { json2satrec, twoline2satrec, type SatRec } from 'satellite.js';

/**
 * CelesTrak "GP" record in OMM JSON form (FORMAT=json). Field names follow the CCSDS OMM standard.
 * Only the fields we read are typed; the raw object is kept for satellite.js.
 */
export interface OmmRecord {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  EPHEMERIS_TYPE: number;
  CLASSIFICATION_TYPE: string;
  NORAD_CAT_ID: number;
  ELEMENT_SET_NO: number;
  REV_AT_EPOCH: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
}

/** One orbital element set ready for propagation, plus the metadata the UI shows. */
export interface ElementSet {
  noradId: number;
  name: string;
  intlDesignator: string;
  /** Element set epoch. */
  epoch: Date;
  satrec: SatRec;
  /** Degrees. */
  inclinationDeg: number;
  eccentricity: number;
  /** Revolutions per day. */
  meanMotion: number;
}

const MS_PER_DAY = 86_400_000;

export function ommToElementSet(record: OmmRecord): ElementSet {
  const satrec = json2satrec(record as unknown as Parameters<typeof json2satrec>[0]);
  if (satrec.error !== 0) {
    throw new Error(`SGP4 initialisation failed for ${record.OBJECT_NAME} (error ${satrec.error})`);
  }
  assertUsable(satrec, record.OBJECT_NAME);
  return {
    noradId: record.NORAD_CAT_ID,
    name: record.OBJECT_NAME.trim(),
    intlDesignator: record.OBJECT_ID,
    epoch: new Date(record.EPOCH.endsWith('Z') ? record.EPOCH : record.EPOCH + 'Z'),
    satrec,
    inclinationDeg: record.INCLINATION,
    eccentricity: record.ECCENTRICITY,
    meanMotion: record.MEAN_MOTION,
  };
}

/** Modulo-10 checksum of a TLE line: digits count their value, minus signs count 1, everything else 0. */
export function tleChecksum(line: string): number {
  let sum = 0;
  for (const ch of line.slice(0, 68)) {
    if (ch >= '0' && ch <= '9') sum += Number(ch);
    else if (ch === '-') sum += 1;
  }
  return sum % 10;
}

/** Reject lines that are not 69 columns, start with the wrong line number, or fail the checksum. */
export function validateTleLine(line: string, lineNumber: 1 | 2): void {
  if (line.length !== 69) throw new Error(`TLE line ${lineNumber} is ${line.length} characters long, expected 69`);
  if (line[0] !== String(lineNumber)) throw new Error(`TLE line ${lineNumber} starts with "${line[0]}"`);
  const expected = Number(line[68]);
  const actual = tleChecksum(line);
  if (expected !== actual) throw new Error(`TLE line ${lineNumber} checksum mismatch (line says ${line[68]}, computed ${actual})`);
}

/** Classic two-line element set; `name` is the optional "line 0". Lines are checksum-verified first. */
export function tleToElementSet(line1: string, line2: string, name?: string): ElementSet {
  validateTleLine(line1.trimEnd(), 1);
  validateTleLine(line2.trimEnd(), 2);
  const satrec = twoline2satrec(line1, line2);
  if (satrec.error !== 0) {
    throw new Error(`SGP4 initialisation failed for TLE ${satrec.satnum} (error ${satrec.error})`);
  }
  assertUsable(satrec, name ?? `NORAD ${satrec.satnum}`);
  const noradId = Number(satrec.satnum);
  const intl = line1.slice(9, 17).trim();
  return {
    noradId,
    name: (name ?? `NORAD ${noradId}`).trim(),
    intlDesignator: intl ? expandIntlDesignator(intl) : '',
    epoch: satrecEpochDate(satrec),
    satrec,
    inclinationDeg: (satrec.inclo * 180) / Math.PI,
    eccentricity: satrec.ecco,
    meanMotion: publishedMeanMotion(satrec),
  };
}

/**
 * satellite.js reports `error === 0` even when a field was missing or NaN; such a satrec then
 * propagates to NaN positions silently. Reject it up front.
 */
function assertUsable(satrec: SatRec, name: string): void {
  const fields = [satrec.jdsatepoch, satrec.no, satrec.ecco, satrec.inclo, satrec.nodeo, satrec.argpo, satrec.mo, satrec.bstar];
  if (!fields.every(Number.isFinite) || satrec.no <= 0 || satrec.ecco < 0 || satrec.ecco >= 1) {
    throw new Error(`Element set for ${name.trim()} is malformed (missing or non-numeric orbital elements)`);
  }
}

/** Epoch from the satrec's Julian date. Unix epoch is JD 2440587.5. */
export function satrecEpochDate(satrec: SatRec): Date {
  return new Date((satrec.jdsatepoch - 2440587.5) * MS_PER_DAY);
}

/**
 * Mean motion as published (Kozai), revolutions per day. satellite.js keeps the published value in
 * `nokozai` and stores the Brouwer ("un-Kozai'd") value SGP4 works with in `no`.
 */
export function publishedMeanMotion(satrec: SatRec): number {
  const radPerMin = satrec.nokozai;
  return (radPerMin * 1440) / (2 * Math.PI);
}

/** Age of the element set at `at`, in days (negative if `at` is before the epoch). */
export function elementSetAgeDays(set: Pick<ElementSet, 'epoch'>, at: Date): number {
  return (at.getTime() - set.epoch.getTime()) / MS_PER_DAY;
}

/** "06014A" (TLE column form) -> "2006-014A". */
function expandIntlDesignator(compact: string): string {
  const yy = Number(compact.slice(0, 2));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return `${year}-${compact.slice(2)}`;
}
