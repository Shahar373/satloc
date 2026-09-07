import type { SatRec } from 'satellite.js';
import { ASTERIA_1_GROUND_STATIONS, ASTERIA_1_PROFILE, ASTERIA_1_TARGETS } from '../../contracts/asteria1';
import { downlinkGB } from '../../contracts/domain';
import type { DomainEvent } from '../../contracts/events';
import type { TargetPoint } from '../imaging/geometry';
import { findImagingOpportunities } from '../imaging/opportunities';
import type { Observer } from '../passes/predict';
import { predictPasses } from '../passes/predict';

export interface ScheduledEvent {
  simTime: Date;
  event: DomainEvent;
}

export interface RealDemoTimelineOptions {
  /** How far ahead of `searchStart` to look for a genuine daylight imaging opportunity, days. */
  imagingSearchDays?: number;
  /** How far ahead of the imaging opportunity's end to look for a ground contact, hours. */
  contactSearchHours?: number;
}

const deg2rad = (d: number) => (d * Math.PI) / 180;

/**
 * Builds Scenario 01's Capture -> Store -> Contact -> Downlink event sequence
 * (docs/design/operator-simulation.md) from genuine orbital geometry — the first daylight imaging
 * opportunity over Asteria-1's target, and the first subsequent GS-Home pass long enough to clear
 * the resulting product — instead of the fixed-offset timeline `TrainV2`'s demo has used so far.
 *
 * Deliberately does not itself invoke the Validator rules (`checkRollLimit`/`checkImagingWindow`/
 * `checkStorageBudget`/`checkContactTiming`): this is a pure scheduler answering *when* real
 * geometry says these events happen, not a validator. Proving the schedule it produces actually
 * passes all four rules when run through a real `ScenarioRunner` is `realDemoTimeline.test.ts`'s
 * job, not this function's — the same "pure scheduler, decisions live elsewhere" split
 * `Scheduler.ts` itself documents.
 *
 * Throws if no daylight opportunity, or no ground contact able to clear the product, exists
 * within the search window — a caller needing a guaranteed schedule should widen the window
 * (`imagingSearchDays`/`contactSearchHours`), not silently fall back to a fabricated one.
 */
export function buildRealDemoTimeline(
  satrec: SatRec,
  searchStart: Date,
  options: RealDemoTimelineOptions = {},
): ScheduledEvent[] {
  const target = ASTERIA_1_TARGETS[0];
  if (!target) throw new Error('buildRealDemoTimeline: Asteria-1 has no imaging targets configured');
  const station = ASTERIA_1_GROUND_STATIONS.find((candidate) => candidate.id === 'gs-home');
  if (!station) throw new Error('buildRealDemoTimeline: Asteria-1 has no gs-home ground station configured');

  const imagingSearchDays = options.imagingSearchDays ?? 7;
  const targetPoint: TargetPoint = {
    latitude: deg2rad(target.latitudeDeg),
    longitude: deg2rad(target.longitudeDeg),
    heightKm: 0,
  };
  const opportunities = findImagingOpportunities(satrec, targetPoint, searchStart, imagingSearchDays);
  const opportunity = opportunities.find((candidate) => candidate.daylight);
  if (!opportunity) {
    throw new Error(
      `buildRealDemoTimeline: no daylight imaging opportunity for "${target.name}" within ${imagingSearchDays} days of ${searchStart.toISOString()}`,
    );
  }

  const contactSearchHours = options.contactSearchHours ?? 24;
  const observer: Observer = {
    latitude: deg2rad(station.latitudeDeg),
    longitude: deg2rad(station.longitudeDeg),
    heightKm: 0,
  };
  const passes = predictPasses(satrec, observer, opportunity.end, contactSearchHours, {
    minElevationDeg: station.minElevationDeg,
  });
  const productGB = ASTERIA_1_PROFILE.storage.productGB.PAN;
  const pass = passes.find((candidate) => downlinkGB(ASTERIA_1_PROFILE, candidate.durationS) >= productGB);
  if (!pass) {
    throw new Error(
      `buildRealDemoTimeline: no ${station.name} contact within ${contactSearchHours}h of ${opportunity.end.toISOString()} long enough to downlink a ${productGB} GB product`,
    );
  }

  const captureTaskId = 'capture-1';
  const downlinkTaskId = 'downlink-1';
  const productId = 'product-1';
  const contactId = 'contact-1';

  const neededS = ASTERIA_1_PROFILE.downlink.acquisitionS + (productGB * 8000) / ASTERIA_1_PROFILE.downlink.rateMbps;
  const downlinkCompleteAt = new Date(pass.aos.getTime() + neededS * 1000);

  return [
    { simTime: opportunity.start, event: { type: 'TaskStarted@1', taskId: captureTaskId } },
    {
      simTime: opportunity.time,
      event: {
        type: 'DataProductStored@1',
        dataProduct: { id: productId, taskId: captureTaskId, mode: 'PAN', sizeGB: productGB },
      },
    },
    { simTime: opportunity.end, event: { type: 'TaskCompleted@1', taskId: captureTaskId, outcome: 'success' } },
    { simTime: pass.aos, event: { type: 'ContactAcquired@1', stationId: station.id, contactId } },
    { simTime: pass.aos, event: { type: 'TaskStarted@1', taskId: downlinkTaskId } },
    {
      simTime: downlinkCompleteAt,
      event: { type: 'DownlinkCompleted@1', contactId, dataProductId: productId, mode: 'PAN' },
    },
    { simTime: downlinkCompleteAt, event: { type: 'TaskCompleted@1', taskId: downlinkTaskId, outcome: 'success' } },
    { simTime: pass.los, event: { type: 'ContactLost@1', stationId: station.id, contactId } },
  ];
}
