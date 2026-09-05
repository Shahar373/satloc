import { ISI_PRESET, presetSatellite } from '../core/catalog/presets';
import type { ElementSet } from '../core/tle/omm';
import { useCatalog } from '../state/catalog';
import { useSelection } from '../state/selection';
import { useSettings } from '../state/settings';
import { CatalogPanel } from './CatalogPanel';
import { ImagingPanel } from './ImagingPanel';
import { PassesPanel } from './PassesPanel';
import { useLiveOrbit } from './useLiveOrbit';

function formatDeg(value: number, posSuffix: string, negSuffix: string): string {
  if (!Number.isFinite(value)) return '–';
  return `${Math.abs(value).toFixed(2)}° ${value >= 0 ? posSuffix : negSuffix}`;
}

function formatAge(days: number): string {
  if (Math.abs(days) < 1) return `${Math.round(days * 24)} h`;
  return `${days.toFixed(1)} d`;
}

export function Sidebar() {
  const sets = useCatalog((s) => s.sets);
  const status = useCatalog((s) => s.status);
  const source = useCatalog((s) => s.source);
  const fetchedAt = useCatalog((s) => s.fetchedAt);
  const error = useCatalog((s) => s.error);
  const refresh = useCatalog((s) => s.refresh);
  const selectedId = useSelection((s) => s.selectedId);
  const select = useSelection((s) => s.select);
  const findSet = useCatalog((s) => s.findSet);
  const groups = useCatalog((s) => s.groups);
  const favorites = useSettings((s) => s.favorites);
  // `groups`/`favorites` are dependencies because findSet reads them.
  const selected = selectedId === null ? undefined : (sets.find((s) => s.noradId === selectedId) ?? findSet(selectedId));
  void groups;
  void favorites;

  return (
    <aside className="sidebar" data-testid="sidebar">
      <section className="panel">
        <h2 className="panel__title">{ISI_PRESET.name}</h2>
        {status === 'loading' && sets.length === 0 && <p className="panel__hint">Loading orbital elements…</p>}
        {status === 'error' && sets.length === 0 && (
          <p className="panel__hint panel__hint--warn">No orbital elements available yet. {error}</p>
        )}
        <ul className="satlist" data-testid="satlist">
          {sets.map((set) => (
            <li key={set.noradId}>
              <button
                type="button"
                className={`satlist__item${set.noradId === selectedId ? ' satlist__item--selected' : ''}`}
                onClick={() => select(set.noradId === selectedId ? null : set.noradId)}
              >
                <span className="satlist__dot" aria-hidden="true" />
                <span className="satlist__name">{set.name}</span>
                <span className="satlist__meta">{set.noradId}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="panel__hint">
          Elements: {source === 'none' ? 'none' : source}
          {fetchedAt && ` · ${fetchedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`}
          {' '}
          <button type="button" className="link" onClick={() => void refresh()}>
            refresh
          </button>
        </p>
        {error && sets.length > 0 && <p className="panel__hint panel__hint--warn">Refresh failed: {error}</p>}
      </section>

      <CatalogPanel />
      {selected && <SatelliteDetails set={selected} />}
      <ImagingPanel set={selected} />
      <PassesPanel set={selected} />
    </aside>
  );
}

function SatelliteDetails({ set }: { set: ElementSet }) {
  const live = useLiveOrbit(set);
  const showOrbit = useSelection((s) => s.showOrbit);
  const showGroundTrack = useSelection((s) => s.showGroundTrack);
  const showFootprint = useSelection((s) => s.showFootprint);
  const showSwath = useSelection((s) => s.showSwath);
  const cameraMode = useSelection((s) => s.cameraMode);
  const toggleOrbit = useSelection((s) => s.toggleOrbit);
  const toggleGroundTrack = useSelection((s) => s.toggleGroundTrack);
  const toggleFootprint = useSelection((s) => s.toggleFootprint);
  const toggleSwath = useSelection((s) => s.toggleSwath);
  const setCameraMode = useSelection((s) => s.setCameraMode);
  const select = useSelection((s) => s.select);
  const preset = presetSatellite(set.noradId)?.sat;
  const hasSwath = preset?.swathKm !== undefined;
  const favorites = useSettings((s) => s.favorites);
  const addFavorite = useSettings((s) => s.addFavorite);
  const removeFavorite = useSettings((s) => s.removeFavorite);
  const isIsi = presetSatellite(set.noradId) !== undefined;
  const isFavorite = favorites.some((f) => f.noradId === set.noradId);
  const toggleFavorite = () => {
    if (isFavorite) {
      removeFavorite(set.noradId);
      return;
    }
    const record = useCatalog.getState().findRecord(set.noradId);
    if (record) addFavorite({ noradId: set.noradId, name: set.name, record });
  };
  const stale = live ? Math.abs(live.elementAgeDays) > 7 : false;

  return (
    <section className="panel" data-testid="details">
      <div className="panel__header">
        <h2 className="panel__title">{set.name}</h2>
        <span>
          {!isIsi && (
            <button
              type="button"
              className={`link${isFavorite ? ' link--on' : ''}`}
              onClick={toggleFavorite}
              title={isFavorite ? 'Remove from pinned satellites' : 'Pin: keep showing this satellite with its label'}
              aria-pressed={isFavorite}
            >
              {isFavorite ? '★ pinned' : '☆ pin'}
            </button>
          )}{' '}
          <button type="button" className="link" onClick={() => select(null)} title="Deselect" aria-label="Deselect">
            ×
          </button>
        </span>
      </div>
      <div className="toggles" aria-label="Camera">
        <button
          type="button"
          className={`btn${cameraMode === 'track' ? ' btn--on' : ''}`}
          title="Camera follows the satellite"
          onClick={() => setCameraMode(cameraMode === 'track' ? 'free' : 'track')}
        >
          Track
        </button>
        <button
          type="button"
          className={`btn${cameraMode === 'nadir' ? ' btn--on' : ''}`}
          title="Look straight down from the satellite"
          onClick={() => setCameraMode(cameraMode === 'nadir' ? 'free' : 'nadir')}
        >
          Nadir
        </button>
      </div>
      <div className="toggles" aria-label="Overlays">
        <button type="button" className={`btn${showOrbit ? ' btn--on' : ''}`} onClick={toggleOrbit}>
          Orbit
        </button>
        <button type="button" className={`btn${showGroundTrack ? ' btn--on' : ''}`} onClick={toggleGroundTrack}>
          Ground track
        </button>
        <button
          type="button"
          className={`btn${showFootprint ? ' btn--on' : ''}`}
          title="Where the satellite is above the horizon"
          onClick={toggleFootprint}
        >
          Footprint
        </button>
        {hasSwath && (
          <button
            type="button"
            className={`btn${showSwath ? ' btn--on' : ''}`}
            title={`Imaging swath, ${preset?.swathKm} km wide, along the coming orbit`}
            onClick={toggleSwath}
          >
            Swath
          </button>
        )}
      </div>
      {live?.error && <p className="panel__hint panel__hint--warn">Propagation failed: {live.error}</p>}
      <dl className="facts">
        <dt>Altitude</dt>
        <dd data-testid="altitude">{live && Number.isFinite(live.altitudeKm) ? `${live.altitudeKm.toFixed(1)} km` : '–'}</dd>
        <dt>Speed</dt>
        <dd>{live && Number.isFinite(live.speedKmS) ? `${live.speedKmS.toFixed(2)} km/s` : '–'}</dd>
        <dt>Latitude</dt>
        <dd>{live ? formatDeg(live.latitudeDeg, 'N', 'S') : '–'}</dd>
        <dt>Longitude</dt>
        <dd>{live ? formatDeg(live.longitudeDeg, 'E', 'W') : '–'}</dd>
        <dt>Period</dt>
        <dd>{live ? `${live.periodMin.toFixed(1)} min` : '–'}</dd>
        <dt>Inclination</dt>
        <dd>{set.inclinationDeg.toFixed(2)}°</dd>
        <dt>Revs / day</dt>
        <dd>{set.meanMotion.toFixed(4)}</dd>
        <dt>NORAD ID</dt>
        <dd>{set.noradId}</dd>
        <dt>Intl. designator</dt>
        <dd>{set.intlDesignator || '–'}</dd>
        {preset && (
          <>
            <dt>Launched</dt>
            <dd>{preset.launched}</dd>
            {preset.swathKm !== undefined && (
              <>
                <dt>Swath</dt>
                <dd>{preset.swathKm} km</dd>
              </>
            )}
            {preset.resolutionM !== undefined && (
              <>
                <dt>Resolution</dt>
                <dd>{preset.resolutionM} m</dd>
              </>
            )}
          </>
        )}
        <dt>Elements epoch</dt>
        <dd className={stale ? 'facts__warn' : undefined}>
          {set.epoch.toISOString().slice(0, 16).replace('T', ' ')} UTC
          {live && ` (${formatAge(live.elementAgeDays)})`}
        </dd>
      </dl>
      {stale && (
        <p className="panel__hint panel__hint--warn">
          Elements are more than a week from the simulation time; positions may be off by kilometres.
        </p>
      )}
    </section>
  );
}
