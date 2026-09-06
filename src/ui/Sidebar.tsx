import { ISI_PRESET, presetSatellite } from '../core/catalog/presets';
import type { ElementSet } from '../core/tle/omm';
import { favoriteToSet, useCatalog } from '../state/catalog';
import { useSelection } from '../state/selection';
import { useSettings } from '../state/settings';
import { CatalogPanel } from './CatalogPanel';
import { ImagingPanel } from './ImagingPanel';
import { Panel } from './Panel';
import { PassesPanel } from './PassesPanel';
import { UndoHint } from './UndoHint';
import { useLiveOrbit } from './useLiveOrbit';
import { useUndo } from './useUndo';

function formatDeg(value: number, posSuffix: string, negSuffix: string): string {
  if (!Number.isFinite(value)) return '–';
  return `${Math.abs(value).toFixed(2)}° ${value >= 0 ? posSuffix : negSuffix}`;
}

function formatAge(days: number): string {
  if (Math.abs(days) < 1) return `${Math.round(days * 24)} h`;
  return `${days.toFixed(1)} d`;
}

const SOURCE_LABELS: Record<string, string> = {
  none: 'none',
  fixture: 'test fixture',
  snapshot: 'bundled snapshot',
  cache: 'saved on this device',
  celestrak: 'CelesTrak',
  mirror: 'TLE mirror (tle.ivanstanojevic.me)',
};

export function Sidebar() {
  const sets = useCatalog((s) => s.sets);
  const status = useCatalog((s) => s.status);
  const source = useCatalog((s) => s.source);
  const fetchedAt = useCatalog((s) => s.fetchedAt);
  const error = useCatalog((s) => s.error);
  const notice = useCatalog((s) => s.notice);
  const refreshing = useCatalog((s) => s.refreshing);
  const refresh = useCatalog((s) => s.refresh);
  const selectedId = useSelection((s) => s.selectedId);
  const select = useSelection((s) => s.select);
  const findSet = useCatalog((s) => s.findSet);
  const groups = useCatalog((s) => s.groups);
  const favorites = useSettings((s) => s.favorites);
  const removeFavorite = useSettings((s) => s.removeFavorite);
  const addFavorite = useSettings((s) => s.addFavorite);
  const [undo, offerUndo] = useUndo();
  // `groups`/`favorites` are dependencies because findSet reads them.
  const selected = selectedId === null ? undefined : (sets.find((s) => s.noradId === selectedId) ?? findSet(selectedId));
  void groups;

  const unpin = (noradId: number) => {
    const favorite = favorites.find((f) => f.noradId === noradId);
    removeFavorite(noradId);
    // A pinned catalogue satellite whose group is not loaded has nowhere else to come from.
    const orphaned = selectedId === noradId && !useCatalog.getState().findSet(noradId);
    if (orphaned) select(null);
    if (favorite) {
      offerUndo({
        label: `Unpinned ${favorite.name}`,
        restore: () => {
          addFavorite(favorite);
          if (orphaned) select(favorite.noradId);
        },
      });
    }
  };

  return (
    <aside className="sidebar" data-testid="sidebar">
      <Panel id="isi" title={ISI_PRESET.name}>
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
                aria-pressed={set.noradId === selectedId}
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
          Elements: {SOURCE_LABELS[source]}
          {fetchedAt && ` · ${fetchedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`}
          {' '}
          <button
            type="button"
            className="link"
            disabled={refreshing || source === 'fixture'}
            onClick={() => void refresh()}
            title="Fetch the latest element sets (CelesTrak at most once every 2 hours, otherwise the mirror)"
          >
            {refreshing ? 'refreshing…' : 'refresh'}
          </button>
        </p>
        {notice && <p className="panel__hint">{notice}</p>}
        {error && sets.length > 0 && <p className="panel__hint panel__hint--warn">Refresh failed, showing the last known elements: {error}</p>}
        {ISI_PRESET.historical && ISI_PRESET.historical.length > 0 && (
          <details className="history">
            <summary className="panel__hint">History (re-entered, no orbit to show)</summary>
            <ul className="satlist">
              {ISI_PRESET.historical.map((h) => (
                <li key={h.noradId} className="history__row">
                  <span className="satlist__dot satlist__dot--gone" aria-hidden="true" />
                  <span className="satlist__name">{h.name}</span>
                  <span className="satlist__meta">
                    {h.launched.slice(0, 4)}–{h.decayed.slice(0, 4)}
                    {h.resolutionM !== undefined && ` · ${h.resolutionM} m`}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <UndoHint offer={undo} />
      </Panel>

      {favorites.length > 0 && (
        <Panel id="pinned" testId="pinned" title="Pinned">
          <ul className="satlist" data-testid="pinned-list">
            {favorites.map((f) => {
              const set = favoriteToSet(f);
              return (
                <li key={f.noradId} className="target-row">
                  <button
                    type="button"
                    className={`satlist__item${f.noradId === selectedId ? ' satlist__item--selected' : ''}`}
                    aria-pressed={f.noradId === selectedId}
                    disabled={!set}
                    title={set ? undefined : 'The saved element set is unusable'}
                    onClick={() => select(f.noradId === selectedId ? null : f.noradId)}
                  >
                    <span className="satlist__dot" aria-hidden="true" />
                    <span className="satlist__name">{f.name}</span>
                    <span className="satlist__meta">{f.noradId}</span>
                  </button>
                  <button type="button" className="link" title="Unpin" aria-label={`Unpin ${f.name}`} onClick={() => unpin(f.noradId)}>
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <CatalogPanel />
      {selected && <SatelliteDetails set={selected} onUnpin={unpin} />}
      <ImagingPanel set={selected} />
      <PassesPanel set={selected} />
    </aside>
  );
}

function SatelliteDetails({ set, onUnpin }: { set: ElementSet; onUnpin(noradId: number): void }) {
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
  const isIsi = presetSatellite(set.noradId) !== undefined;
  const isFavorite = favorites.some((f) => f.noradId === set.noradId);
  const toggleFavorite = () => {
    if (isFavorite) {
      onUnpin(set.noradId);
      return;
    }
    const record = useCatalog.getState().findRecord(set.noradId);
    if (record) addFavorite({ noradId: set.noradId, name: set.name, record });
  };
  const stale = live ? Math.abs(live.elementAgeDays) > 7 : false;

  return (
    <Panel
      id="details"
      testId="details"
      title={set.name}
      actions={
        <>
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
          <button type="button" className="link" onClick={() => select(null)} title="Deselect (Esc)" aria-label="Deselect">
            ×
          </button>
        </>
      }
    >
      <div className="toggles" role="group" aria-label="Camera">
        <button
          type="button"
          className={`btn${cameraMode === 'track' ? ' btn--on' : ''}`}
          aria-pressed={cameraMode === 'track'}
          title="Camera follows the satellite; drag to orbit around it (Esc releases)"
          onClick={() => setCameraMode(cameraMode === 'track' ? 'free' : 'track')}
        >
          Track
        </button>
        <button
          type="button"
          className={`btn${cameraMode === 'nadir' ? ' btn--on' : ''}`}
          aria-pressed={cameraMode === 'nadir'}
          title="Look straight down from the satellite (locks the camera; Esc releases it)"
          onClick={() => setCameraMode(cameraMode === 'nadir' ? 'free' : 'nadir')}
        >
          Nadir
        </button>
      </div>
      <div className="toggles" role="group" aria-label="Overlays">
        <button type="button" className={`btn${showOrbit ? ' btn--on' : ''}`} aria-pressed={showOrbit} onClick={toggleOrbit} title="One orbit in inertial space">
          Orbit
        </button>
        <button
          type="button"
          className={`btn${showGroundTrack ? ' btn--on' : ''}`}
          aria-pressed={showGroundTrack}
          onClick={toggleGroundTrack}
          title="Path of the sub-satellite point: half an orbit back, one orbit ahead"
        >
          Ground track
        </button>
        <button
          type="button"
          className={`btn${showFootprint ? ' btn--on' : ''}`}
          aria-pressed={showFootprint}
          title="Where the satellite is above the horizon"
          onClick={toggleFootprint}
        >
          Footprint
        </button>
        {hasSwath && (
          <button
            type="button"
            className={`btn${showSwath ? ' btn--on' : ''}`}
            aria-pressed={showSwath}
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
    </Panel>
  );
}
