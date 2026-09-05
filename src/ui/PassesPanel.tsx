import { useEffect, useMemo, useState } from 'react';
import { Cartesian3, JulianDate } from 'cesium';
import { compassPoint, predictPasses, type Pass } from '../core/passes/predict';
import type { ElementSet } from '../core/tle/omm';
import { useForecast } from '../state/forecast';
import { formatLocation, useObserver } from '../state/observer';
import { usePicking } from '../state/picking';
import { useViewerStore } from '../state/viewer';
import { setSimulationTime } from '../viewer/createViewer';

const WINDOW_HOURS = 48;
/** Recompute the pass list when the simulation time drifts this far from the window start. */
const WINDOW_DRIFT_MS = 15 * 60 * 1000;
const MIN_ELEVATIONS = [0, 10, 20, 30, 45];

function formatUtc(date: Date): string {
  return date.toISOString().slice(5, 16).replace('T', ' ');
}

function formatLocal(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
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

  // Window start follows the simulation clock, but only in 15-minute jumps to avoid recomputing every tick.
  const [windowStart, setWindowStart] = useState<Date | null>(null);
  useEffect(() => {
    if (!simTime) return;
    if (!windowStart || Math.abs(simTime.getTime() - windowStart.getTime()) > WINDOW_DRIFT_MS) {
      setWindowStart(simTime);
    }
  }, [simTime, windowStart]);

  const passes = useMemo<Pass[] | null>(() => {
    if (!set || !windowStart) return null;
    const observer = {
      latitude: (latitudeDeg * Math.PI) / 180,
      longitude: (longitudeDeg * Math.PI) / 180,
      heightKm: heightM / 1000,
    };
    try {
      return predictPasses(set.satrec, observer, windowStart, WINDOW_HOURS, { minElevationDeg });
    } catch {
      return [];
    }
  }, [set, windowStart, latitudeDeg, longitudeDeg, heightM, minElevationDeg]);

  useEffect(() => {
    useForecast.getState().setPasses(passes ?? []);
  }, [passes]);

  const useDeviceLocation = () => {
    setGeoError(null);
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation is not available here.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setLocation({
          name: 'My location',
          latitudeDeg: pos.coords.latitude,
          longitudeDeg: pos.coords.longitude,
          heightM: pos.coords.altitude ?? 0,
        }),
      (err) => setGeoError(err.message || 'Could not read the device location.'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  };

  const jumpToPass = (pass: Pass) => {
    if (!viewer) return;
    setSimulationTime(viewer, JulianDate.fromDate(new Date(pass.aos.getTime() - 30_000)));
    viewer.clock.shouldAnimate = true;
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(longitudeDeg, latitudeDeg, 3_500_000),
      duration: 1.5,
    });
  };

  return (
    <section className="panel" data-testid="passes">
      <h2 className="panel__title">Passes over {name}</h2>
      <p className="panel__hint">{formatLocation({ latitudeDeg, longitudeDeg })}</p>
      <div className="toggles">
        <button
          type="button"
          className={`btn${picking ? ' btn--on' : ''}`}
          title="Click a point on the globe to set the observer"
          onClick={() => setPickingMode(picking ? null : 'observer')}
        >
          {picking ? 'Click the globe…' : 'Pick on globe'}
        </button>
        <button type="button" className="btn" onClick={useDeviceLocation} title="Use the device's location">
          My location
        </button>
        <label className="topbar__dim">
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
      {set && passes && passes.length === 0 && (
        <p className="panel__hint">No passes above {minElevationDeg}° in the next {WINDOW_HOURS} h.</p>
      )}
      {set && passes && passes.length > 0 && (
        <ol className="passes" data-testid="pass-list">
          {passes.map((pass) => (
            <li key={pass.aos.getTime()}>
              <button type="button" className="pass" onClick={() => jumpToPass(pass)} title="Jump to this pass">
                <span className="pass__when">
                  {formatUtc(pass.aos)} UTC
                  <span className="topbar__dim"> · {formatLocal(pass.aos)} local</span>
                </span>
                <span className="pass__facts">
                  {formatDuration(pass.durationS)} · max {pass.maxElevationDeg.toFixed(0)}° ·{' '}
                  {compassPoint(pass.aosAzimuthDeg)} → {compassPoint(pass.losAzimuthDeg)}
                  {pass.inProgressAtStart && ' · in progress'}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
