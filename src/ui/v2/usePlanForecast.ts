import { useEffect, useState } from 'react';
import { ASTERIA_1_SCENARIO as scenario } from '../../contracts';
import { validateImagingOpportunities, type EvaluatedOpportunity } from '../../core/scenario/planOpportunities';
import type { ScheduledDownlinkCandidate } from '../../core/scenario/executablePlan';
import { satrecEpochDate, tleToElementSet } from '../../core/tle/omm';
import { ForecastClient } from '../../workers/ForecastClient';
import type { ElementSetInput } from '../../workers/forecastProtocol';

/** Expensive geometry stays in the existing cancellable worker, including ground-station contacts. */
export function usePlanForecast() {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    imaging: EvaluatedOpportunity[];
    contacts: ScheduledDownlinkCandidate[];
  }>({ loading: true, error: null, imaging: [], contacts: [] });
  useEffect(() => {
    let cancelled = false;
    let client: ForecastClient | undefined;
    async function load() {
      try {
        const forecast = new ForecastClient();
        client = forecast;
        const { satrec } = tleToElementSet(scenario.tle.line1, scenario.tle.line2, scenario.tle.name);
        const target = scenario.targets[0];
        if (!target) throw new Error('The training scenario has no imaging target');
        const element: ElementSetInput = { source: 'tle', tle: { ...scenario.tle, noradId: Number(satrec.satnum) } };
        const radians = (d: number) => (d * Math.PI) / 180;
        const [opportunities, ...passes] = await Promise.all([
          forecast.imaging(
            scenario.satellite.id,
            element,
            { latitude: radians(target.latitudeDeg), longitude: radians(target.longitudeDeg), heightKm: 0 },
            new Date(scenario.startTime),
            30,
            { maxOffNadirDeg: 45, minSunElevationDeg: scenario.satellite.imaging.sunElevationConstraintDeg },
          ),
          ...scenario.groundStations.map((station) =>
            forecast.passes(
              scenario.satellite.id,
              element,
              { latitude: radians(station.latitudeDeg), longitude: radians(station.longitudeDeg), heightKm: 0 },
              new Date(scenario.startTime),
              30 * 24,
              { minElevationDeg: station.minElevationDeg },
            ),
          ),
        ] as const);
        const contacts = passes
          .flatMap((stationPasses, i) =>
            stationPasses.map((pass): ScheduledDownlinkCandidate => {
              const stationId = scenario.groundStations[i].id;
              const contactId = `${stationId}@${pass.aos.toISOString()}`;
              return {
                kind: 'downlink',
                id: `downlink:${contactId}`,
                contactId,
                stationId,
                pass,
                durationS: pass.durationS,
                dataProductCandidateIds: [],
              };
            }),
          )
          .filter((c) => !c.pass.inProgressAtStart && !c.pass.continuesAfterEnd)
          .sort((a, b) => a.pass.aos.getTime() - b.pass.aos.getTime());
        if (!cancelled)
          setState({
            loading: false,
            error: null,
            imaging: validateImagingOpportunities(opportunities, scenario.satellite, target, satrecEpochDate(satrec)),
            contacts,
          });
      } catch (error) {
        if (!cancelled)
          setState({
            loading: false,
            error: error instanceof Error ? error.message : String(error),
            imaging: [],
            contacts: [],
          });
      }
    }
    void load();
    return () => {
      cancelled = true;
      client?.terminate();
    };
  }, []);
  return state;
}
