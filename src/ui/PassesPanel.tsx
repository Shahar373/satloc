import { useEffect, useMemo, useRef, useState } from 'react';
import { compassPoint, predictPasses, type Pass } from '../core/passes/predict';
import type { ElementSet } from '../core/tle/omm';
import { useForecast } from '../state/forecast';
import { formatLocation, useObserver } from '../state/observer';
import { usePicking } from '../state/picking';
import { useSelection } from '../state/selection';
import { useViewerStore } from '../state/viewer';
import { flyToLocation, jumpToInstant } from '../viewer/createViewer';
import { Panel } from './Panel';
import { formatLocalDateTime, formatUtcShort } from './format';
import { useForecastWindow } from './useForecastWindow';

const WINDOW_HOURS = 48;
/** Recompute the pass list when the simulation time drifts this far from the window start. */
const WINDOW_DRIFT_MS = 15 * 60 * 1000;
const MIN_ELEVATIONS = [0, 10, 20, 30, 45];

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')} min`;
}

export function PassesPanel({ set }: { set: ElementSet | undefined }) {
  const viewer = useViewerStore((s) => s.viewer);
  const simTime = useViewerStore((s) => s.simTime);
  const name = useObserver((s) => s.name);
  const latitudeDeg = useObserver((s) => s.latitudeDeg);
  const longitudeDeg = useObserver((s) => s.longitudeDeg);
  const heightM = useObserver((s) => s.heightM);
  const minElevationDeg = useObserver((s) => s.minElevationDeg);
  const picking = usePicking((s) => s.mode) === 'observer';
  const setPickingMode = usePicking((s) => s.setMode);
  const setLocation = useObserver((s) => s.setLocation);
  const setMinElevation = useObserver((s) => s.setMinElevation);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  // Only the latest geolocation request may apply its result (a late fix must not overwrite a newer choice).
  const geoRequest = useRef(0);

  const windowStart = useForecastWindow(simTime, WINDOW_DRIFT_MS);

  const forecast = useMemo<{ passes: Pass[]; error: string | null } | null>(() => {
    if (!set || !windowStart) return null;
    const observer = {
      latitude: (latitudeDeg * Math.PI) / 180,
      longitude: (longitudeDeg * Math.PI) / 180,
      heightKm: heightM / 1000,
    };
    try {
      return { passes: predictPasses(set.satrec, observer, windowStart, WINDOW_HOURS, { minElevationDeg }), error: null };
    } catch (err) {
      return { passes: [], error: err instanceof Error ? err.message : String(err) };
    }
  }, [set, windowStart, latitudeDeg, longitudeDeg, heightM, minElevationDeg]);
  const passes = forecast?.passes ?? null;

  useEffect(() => {
    useForecast.getState().setPasses(passes ?? []);
  }, [passes]);

  useEffect(() => () => useForecast.getState().setPasses([]), []);

  const useDeviceLocation = () => {
    setGeoError(null);
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation is not available here.');
      return;
    }
    const request = ++geoRequest.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (request !== geoRequest.current) return;
        setLocating(false);
        setLocation({
          name: 'My location',
          latitudeDeg: pos.coords.latitude,
          longitudeDeg: pos.coords.longitude,
          heightM: pos.coords.altitude ?? 0,
        });
      },
      (err) => {
        if (request !== geoRequest.current) return;
        setLocating(false);
        setGeoError(err.message || 'Could not read the device location.');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  };

  const jumpToPass = (pass: Pass) => {
    if (!viewer) return;
    // A satellite camera mode (track/nadir/imaging) would override or displace the flight.
    useSelection.getState().setCameraMode('free');
    jumpToInstant(viewer, new Date(pass.aos.getTime() - 30_000));
    flyToLocation(viewer, longitudeDeg, latitudeDeg);
  };

  return (
    <Panel id="passes" testId="passes" title={`Passes over ${name}`}>
      <p className="panel__hint">
        {formatLocation({ latitudeDeg, longitudeDeg })} · next {WINDOW_HOURS} h
      </p>
      <div className="toggles" role="group" aria-label="Observer">
        <button
          type="button"
          className={`btn${picking ? ' btn--on' : ''}`}
          aria-pressed={picking}
          title="Click a point on the globe to set the observer (Esc cancels)"
          onClick={() => setPickingMode(picking ? null : 'observer')}
        >
          {picking ? 'Click the globe…' : 'Pick on globe'}
        </button>
        <button type="button" className="btn" disabled={locating} onClick={useDeviceLocation} title="Use the device's location">
          {locating ? 'Locating…' : 'My location'}
        </button>
        <label className="topbar__dim" title="Passes are listed only when the satellite rises above this elevation">
          min&nbsp;
          <select
            className="select"
            aria-label="Minimum elevation"
            value={minElevationDeg}
            onChange={(e) => setMinElevation(Number(e.target.value))}
          >
            {MIN_ELEVATIONS.map((d) => (
              <option key={d} value={d}>
                {d}°
              </option>
            ))}
          </select>
        </label>
      </div>
      {geoError && <p className="panel__hint panel__hint--warn">{geoError}</p>}
      {!set && <p className="panel__hint">Select a satellite to list its passes.</p>}
      {set && forecast?.error && (
        <p className="panel__hint panel__hint--warn" role="alert">
          Passes could not be computed: {forecast.error}
        </p>
      )}
      {set && passes && !forecast?.error && passes.length === 0 && (
        <p className="panel__hint">No passes above {minElevationDeg}° in the next {WINDOW_HOURS} h.</p>
      )}
      {set && passes && passes.length > 0 && (
        <ol className="passes" data-testid="pass-list">
          {passes.map((pass) => (
            <li key={pass.aos.getTime()}>
              <button type="button" className="pass" onClick={() => jumpToPass(pass)} title="Jump to 30 s before this pass and look at the observer">
                <span className="pass__when">
                  {formatUtcShort(pass.aos)} UTC
                  <span className="topbar__dim"> · {formatLocalDateTime(pass.aos)} local</span>
                </span>
                <span className="pass__facts">
                  {formatDuration(pass.durationS)} · max {pass.maxElevationDeg.toFixed(0)}° ·{' '}
                  {compassPoint(pass.aosAzimuthDeg)} → {compassPoint(pass.losAzimuthDeg)}
                  {pass.inProgressAtStart && ' · in progress'}
                  {pass.continuesAfterEnd && ' · continues past the window'}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
