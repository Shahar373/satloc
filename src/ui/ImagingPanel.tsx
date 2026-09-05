import { useEffect, useMemo, useState } from 'react';
import { JulianDate } from 'cesium';
import { findImagingOpportunities, type ImagingOpportunity } from '../core/imaging/opportunities';
import type { ElementSet } from '../core/tle/omm';
import { usePicking } from '../state/picking';
import { useSelection } from '../state/selection';
import { formatLatLon, useTargets } from '../state/targets';
import { useViewerStore } from '../state/viewer';
import { setSimulationTime } from '../viewer/createViewer';

/** Recompute when the simulation clock drifts this far from the forecast start. */
const WINDOW_DRIFT_MS = 30 * 60 * 1000;

function formatUtc(date: Date): string {
  return date.toISOString().slice(5, 16).replace('T', ' ');
}

function formatLocal(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function ImagingPanel({ set }: { set: ElementSet | undefined }) {
  const viewer = useViewerStore((s) => s.viewer);
  const simTime = useViewerStore((s) => s.simTime);
  const targets = useTargets((s) => s.targets);
  const selectedTargetId = useTargets((s) => s.selectedTargetId);
  const maxOffNadirDeg = useTargets((s) => s.maxOffNadirDeg);
  const minSunElevationDeg = useTargets((s) => s.minSunElevationDeg);
  const forecastDays = useTargets((s) => s.forecastDays);
  const selectTarget = useTargets((s) => s.selectTarget);
  const addTarget = useTargets((s) => s.addTarget);
  const removeTarget = useTargets((s) => s.removeTarget);
  const updateTarget = useTargets((s) => s.updateTarget);
  const setMaxOffNadir = useTargets((s) => s.setMaxOffNadir);
  const setMinSunElevation = useTargets((s) => s.setMinSunElevation);
  const setForecastDays = useTargets((s) => s.setForecastDays);
  const picking = usePicking((s) => s.mode) === 'target';
  const setPickingMode = usePicking((s) => s.setMode);
  const cameraMode = useSelection((s) => s.cameraMode);
  const setCameraMode = useSelection((s) => s.setCameraMode);
  const showReach = useSelection((s) => s.showReach);
  const toggleReach = useSelection((s) => s.toggleReach);
  const [coords, setCoords] = useState('');
  const [coordsError, setCoordsError] = useState<string | null>(null);
  const target = targets.find((t) => t.id === selectedTargetId);

  const [windowStart, setWindowStart] = useState<Date | null>(null);
  useEffect(() => {
    if (!simTime) return;
    if (!windowStart || Math.abs(simTime.getTime() - windowStart.getTime()) > WINDOW_DRIFT_MS) setWindowStart(simTime);
  }, [simTime, windowStart]);

  const opportunities = useMemo<ImagingOpportunity[] | null>(() => {
    if (!set || !target || !windowStart) return null;
    try {
      return findImagingOpportunities(
        set.satrec,
        { latitude: (target.latitudeDeg * Math.PI) / 180, longitude: (target.longitudeDeg * Math.PI) / 180, heightKm: 0 },
        windowStart,
        forecastDays,
        { maxOffNadirDeg, minSunElevationDeg },
      );
    } catch {
      return [];
    }
  }, [set, target, windowStart, forecastDays, maxOffNadirDeg, minSunElevationDeg]);

  const addByCoordinates = () => {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(coords);
    if (!m) {
      setCoordsError('Enter "latitude, longitude" in decimal degrees, e.g. 31.77, 35.21');
      return;
    }
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setCoordsError('Latitude must be within ±90 and longitude within ±180.');
      return;
    }
    setCoordsError(null);
    addTarget({ name: `Target ${targets.length + 1}`, latitudeDeg: lat, longitudeDeg: lon });
    setCoords('');
  };

  const jumpTo = (o: ImagingOpportunity) => {
    if (!viewer) return;
    setSimulationTime(viewer, JulianDate.fromDate(o.time));
    viewer.clock.shouldAnimate = true;
    setCameraMode('imaging');
  };

  return (
    <section className="panel" data-testid="imaging">
      <h2 className="panel__title">Imaging opportunities</h2>

      <ul className="satlist" data-testid="target-list">
        {targets.map((t) => (
          <li key={t.id} className="target-row">
            <button
              type="button"
              className={`satlist__item${t.id === selectedTargetId ? ' satlist__item--selected' : ''}`}
              onClick={() => selectTarget(t.id === selectedTargetId ? null : t.id)}
              title={formatLatLon(t.latitudeDeg, t.longitudeDeg)}
            >
              <span className="satlist__dot satlist__dot--target" aria-hidden="true" />
              <span className="satlist__name">{t.name}</span>
              <span className="satlist__meta">{formatLatLon(t.latitudeDeg, t.longitudeDeg)}</span>
            </button>
            <button
              type="button"
              className="link"
              title="Rename"
              aria-label={`Rename ${t.name}`}
              onClick={() => {
                const name = window.prompt('Target name', t.name);
                if (name && name.trim()) updateTarget(t.id, { name: name.trim() });
              }}
            >
              ✎
            </button>
            <button type="button" className="link" title="Remove" aria-label={`Remove ${t.name}`} onClick={() => removeTarget(t.id)}>
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="toggles">
        <button
          type="button"
          className={`btn${picking ? ' btn--on' : ''}`}
          title="Click a point on the globe to add a target"
          onClick={() => setPickingMode(picking ? null : 'target')}
        >
          {picking ? 'Click the globe…' : 'Add on globe'}
        </button>
        <form
          className="coords"
          onSubmit={(e) => {
            e.preventDefault();
            addByCoordinates();
          }}
        >
          <input
            className="input"
            placeholder="lat, lon"
            aria-label="Target coordinates"
            value={coords}
            onChange={(e) => setCoords(e.target.value)}
          />
          <button type="submit" className="btn">
            Add
          </button>
        </form>
      </div>
      {coordsError && <p className="panel__hint panel__hint--warn">{coordsError}</p>}

      <div className="toggles">
        <label className="topbar__dim">
          roll ≤&nbsp;
          <input
            className="input input--num"
            type="number"
            min={5}
            max={70}
            step={5}
            value={maxOffNadirDeg}
            aria-label="Maximum off-nadir angle"
            onChange={(e) => setMaxOffNadir(Math.max(5, Math.min(70, Number(e.target.value) || 45)))}
          />
          °
        </label>
        <label className="topbar__dim">
          sun ≥&nbsp;
          <input
            className="input input--num"
            type="number"
            min={-10}
            max={60}
            step={5}
            value={minSunElevationDeg}
            aria-label="Minimum Sun elevation"
            onChange={(e) => setMinSunElevation(Math.max(-10, Math.min(60, Number(e.target.value) || 0)))}
          />
          °
        </label>
        <label className="topbar__dim">
          <select className="select" aria-label="Forecast days" value={forecastDays} onChange={(e) => setForecastDays(Number(e.target.value))}>
            {[1, 3, 7, 14].map((d) => (
              <option key={d} value={d}>
                {d} d
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={`btn${showReach ? ' btn--on' : ''}`} onClick={toggleReach} title="Ground reach of the roll limit and the line of sight to the target">
          Reach
        </button>
        <button
          type="button"
          className={`btn${cameraMode === 'imaging' ? ' btn--on' : ''}`}
          disabled={!set || !target}
          title="Camera on the satellite, looking at the target"
          onClick={() => setCameraMode(cameraMode === 'imaging' ? 'free' : 'imaging')}
        >
          Imaging view
        </button>
      </div>

      {!set && <p className="panel__hint">Select a satellite to compute its imaging opportunities.</p>}
      {set && !target && <p className="panel__hint">Select or add a target.</p>}
      {set && target && opportunities && opportunities.length === 0 && (
        <p className="panel__hint">
          No access to {target.name} within {forecastDays} day{forecastDays > 1 ? 's' : ''} at roll ≤ {maxOffNadirDeg}°.
        </p>
      )}
      {set && target && opportunities && opportunities.length > 0 && (
        <ol className="passes" data-testid="opportunity-list">
          {opportunities.map((o) => (
            <li key={o.time.getTime()}>
              <button type="button" className={`pass${o.daylight ? '' : ' pass--night'}`} onClick={() => jumpTo(o)} title="Jump to this opportunity and look at the target from the satellite">
                <span className="pass__when">
                  {formatUtc(o.time)} UTC
                  <span className="topbar__dim"> · {formatLocal(o.time)} local</span>
                  <span className={`badge badge--inline${o.daylight ? ' badge--ok' : ' badge--warn'}`}>{o.daylight ? 'daylight' : 'night'}</span>
                </span>
                <span className="pass__facts">
                  roll {o.offNadirDeg.toFixed(1)}° {o.side} · sun {o.sunElevationDeg.toFixed(0)}° · {o.direction}
                  {!o.satelliteSunlit && ' · satellite in eclipse'}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
