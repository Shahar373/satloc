import { useEffect, useMemo, useState } from 'react';
import { findImagingOpportunities, type ImagingOpportunity } from '../core/imaging/opportunities';
import type { ElementSet } from '../core/tle/omm';
import { useForecast } from '../state/forecast';
import { usePicking } from '../state/picking';
import { useSelection } from '../state/selection';
import { formatLatLon, nextTargetName, useTargets } from '../state/targets';
import { useViewerStore } from '../state/viewer';
import { flyToLocation, jumpToInstant } from '../viewer/createViewer';
import { NumberField } from './NumberField';
import { Panel } from './Panel';
import { formatLocalDateTime, formatUtcShort } from './format';
import { useForecastWindow } from './useForecastWindow';

/** Recompute when the simulation clock drifts this far from the forecast start. */
const WINDOW_DRIFT_MS = 30 * 60 * 1000;
/** Land a jump this long before the closest approach, so the approach is visible at 1x–10x. */
const JUMP_LEAD_MS = 60_000;

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
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const target = targets.find((t) => t.id === selectedTargetId);

  const windowStart = useForecastWindow(simTime, WINDOW_DRIFT_MS);

  const forecast = useMemo<{ opportunities: ImagingOpportunity[]; error: string | null } | null>(() => {
    if (!set || !target || !windowStart) return null;
    try {
      return {
        opportunities: findImagingOpportunities(
          set.satrec,
          { latitude: (target.latitudeDeg * Math.PI) / 180, longitude: (target.longitudeDeg * Math.PI) / 180, heightKm: 0 },
          windowStart,
          forecastDays,
          { maxOffNadirDeg, minSunElevationDeg },
        ),
        error: null,
      };
    } catch (err) {
      return { opportunities: [], error: err instanceof Error ? err.message : String(err) };
    }
  }, [set, target, windowStart, forecastDays, maxOffNadirDeg, minSunElevationDeg]);
  const opportunities = forecast?.opportunities ?? null;

  useEffect(() => {
    useForecast.getState().setOpportunities(opportunities ?? []);
  }, [opportunities]);

  useEffect(() => () => useForecast.getState().setOpportunities([]), []);

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
    addTarget({ name: nextTargetName(targets), latitudeDeg: lat, longitudeDeg: lon });
    setCoords('');
    // Show where it landed; a target on the far side of the planet would otherwise look like nothing happened.
    if (viewer && cameraMode === 'free') flyToLocation(viewer, lon, lat);
  };

  const commitRename = () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (name) updateTarget(editing.id, { name });
    setEditing(null);
  };

  const jumpTo = (o: ImagingOpportunity) => {
    if (!viewer) return;
    jumpToInstant(viewer, new Date(Math.max(o.start.getTime(), o.time.getTime() - JUMP_LEAD_MS)));
    setCameraMode('imaging');
  };

  const daylightCount = opportunities?.filter((o) => o.daylight).length ?? 0;

  return (
    <Panel id="imaging" testId="imaging" title="Imaging opportunities">
      <ul className="satlist" data-testid="target-list">
        {targets.map((t) => (
          <li key={t.id} className="target-row">
            {editing?.id === t.id ? (
              <form
                className="target-row__edit"
                onSubmit={(e) => {
                  e.preventDefault();
                  commitRename();
                }}
              >
                <input
                  className="input input--wide"
                  autoFocus
                  value={editing.name}
                  aria-label={`New name for ${t.name}`}
                  onChange={(e) => setEditing({ id: t.id, name: e.target.value })}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditing(null);
                    }
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                className={`satlist__item${t.id === selectedTargetId ? ' satlist__item--selected' : ''}`}
                aria-pressed={t.id === selectedTargetId}
                onClick={() => selectTarget(t.id === selectedTargetId ? null : t.id)}
                title={formatLatLon(t.latitudeDeg, t.longitudeDeg)}
              >
                <span className="satlist__dot satlist__dot--target" aria-hidden="true" />
                <span className="satlist__name">{t.name}</span>
                <span className="satlist__meta">{formatLatLon(t.latitudeDeg, t.longitudeDeg)}</span>
              </button>
            )}
            <button
              type="button"
              className="link"
              title="Rename"
              aria-label={`Rename ${t.name}`}
              onClick={() => setEditing({ id: t.id, name: t.name })}
            >
              ✎
            </button>
            <button type="button" className="link" title="Remove" aria-label={`Remove ${t.name}`} onClick={() => removeTarget(t.id)}>
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="toggles" role="group" aria-label="Targets">
        <button
          type="button"
          className={`btn${picking ? ' btn--on' : ''}`}
          aria-pressed={picking}
          title="Click a point on the globe to add a target (Esc cancels)"
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
            title="Decimal degrees, e.g. 31.77, 35.21"
            value={coords}
            onChange={(e) => setCoords(e.target.value)}
          />
          <button type="submit" className="btn" title="Add a target at these coordinates">
            Add
          </button>
        </form>
      </div>
      {coordsError && <p className="panel__hint panel__hint--warn">{coordsError}</p>}

      <div className="toggles" role="group" aria-label="Imaging constraints">
        <label className="topbar__dim" title="Largest roll (off-nadir angle) the satellite may use to look at the target">
          roll ≤&nbsp;
          <NumberField value={maxOffNadirDeg} min={5} max={70} step={5} onCommit={setMaxOffNadir} aria-label="Maximum off-nadir angle" />
          °
        </label>
        <label
          className="topbar__dim"
          title="Sun elevation at the target above which an opportunity counts as daylight (night opportunities are still listed)"
        >
          sun ≥&nbsp;
          <NumberField value={minSunElevationDeg} min={-10} max={60} step={5} onCommit={setMinSunElevation} aria-label="Minimum Sun elevation" />
          °
        </label>
        <label className="topbar__dim" title="How far ahead to look for opportunities">
          <select className="select" aria-label="Forecast days" value={forecastDays} onChange={(e) => setForecastDays(Number(e.target.value))}>
            {[1, 3, 7, 14].map((d) => (
              <option key={d} value={d}>
                {d} d
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`btn${showReach ? ' btn--on' : ''}`}
          aria-pressed={showReach}
          onClick={toggleReach}
          title="Show the ground reach of the roll limit along the coming orbit and the line of sight to the target"
        >
          Reach
        </button>
        <button
          type="button"
          className={`btn${cameraMode === 'imaging' ? ' btn--on' : ''}`}
          aria-pressed={cameraMode === 'imaging'}
          disabled={!set || !target}
          title={
            !set || !target
              ? 'Select a satellite and a target first'
              : 'Camera on the satellite, looking at the target (locks the camera; Esc releases it)'
          }
          onClick={() => setCameraMode(cameraMode === 'imaging' ? 'free' : 'imaging')}
        >
          Imaging view
        </button>
      </div>

      {!set && <p className="panel__hint">Select a satellite to compute its imaging opportunities.</p>}
      {set && !target && <p className="panel__hint">Select or add a target.</p>}
      {set && target && forecast?.error && (
        <p className="panel__hint panel__hint--warn" role="alert">
          Opportunities could not be computed: {forecast.error}
        </p>
      )}
      {set && target && opportunities && !forecast?.error && opportunities.length === 0 && (
        <p className="panel__hint">
          No access to {target.name} within {forecastDays} day{forecastDays > 1 ? 's' : ''} at roll ≤ {maxOffNadirDeg}°. Try a
          longer forecast or a larger roll.
        </p>
      )}
      {set && target && opportunities && opportunities.length > 0 && (
        <>
          <p className="panel__hint">
            {opportunities.length} in {forecastDays} d, {daylightCount} in daylight (sun ≥ {minSunElevationDeg}°).
          </p>
          <ol className="passes" data-testid="opportunity-list">
            {opportunities.map((o) => (
              <li key={o.time.getTime()}>
                <button
                  type="button"
                  className={`pass${o.daylight ? '' : ' pass--night'}`}
                  onClick={() => jumpTo(o)}
                  title="Jump to this opportunity and look at the target from the satellite"
                >
                  <span className="pass__when">
                    {formatUtcShort(o.time)} UTC
                    <span className="topbar__dim"> · {formatLocalDateTime(o.time)} local</span>
                    <span className={`badge badge--inline${o.daylight ? ' badge--ok' : ' badge--warn'}`}>{o.daylight ? 'daylight' : 'night'}</span>
                  </span>
                  <span className="pass__facts">
                    roll {o.offNadirDeg.toFixed(1)}° {o.side} · sun {o.sunElevationDeg.toFixed(0)}° · {o.direction}
                    {!o.satelliteSunlit && ' · satellite in eclipse'}
                    {o.continuesAfterEnd && ' · continues past the forecast'}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </Panel>
  );
}
