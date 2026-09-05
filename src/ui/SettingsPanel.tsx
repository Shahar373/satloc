import { useState } from 'react';
import { isTauri } from '../platform/env';
import { useSettings } from '../state/settings';
import { useUi } from '../state/ui';
import { useUpdates } from '../state/updates';
import { useViewerStore } from '../state/viewer';
import { IMAGERY_LABELS, IMAGERY_SOURCES, type ImagerySource } from '../viewer/imagery';

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.1.0';

export function SettingsPanel() {
  const open = useUi((s) => s.settingsOpen);
  const close = () => useUi.getState().setSettingsOpen(false);
  const imagery = useSettings((s) => s.imagery);
  const ionToken = useSettings((s) => s.ionToken);
  const maxCatalogPoints = useSettings((s) => s.maxCatalogPoints);
  const setImagery = useSettings((s) => s.setImagery);
  const setIonToken = useSettings((s) => s.setIonToken);
  const setMaxCatalogPoints = useSettings((s) => s.setMaxCatalogPoints);
  const resolved = useViewerStore((s) => s.imagery);
  const [tokenDraft, setTokenDraft] = useState(ionToken);
  const updateStatus = useUpdates((s) => s.status);
  const update = useUpdates((s) => s.update);
  const updateError = useUpdates((s) => s.error);
  const updateProgress = useUpdates((s) => s.progress);
  const checkedAt = useUpdates((s) => s.checkedAt);
  const checkUpdates = useUpdates((s) => s.check);
  const installUpdate = useUpdates((s) => s.install);

  if (!open) return null;

  return (
    <div className="settings" role="dialog" aria-label="Settings" data-testid="settings">
      <div className="panel__header">
        <h2 className="panel__title">Settings</h2>
        <button type="button" className="link" onClick={close} title="Close" aria-label="Close">
          ×
        </button>
      </div>

      <label className="field">
        <span className="field__label">Earth imagery</span>
        <select
          className="select input--wide"
          value={imagery}
          onChange={(e) => setImagery(e.target.value as ImagerySource)}
          aria-label="Earth imagery"
        >
          {IMAGERY_SOURCES.map((source) => (
            <option key={source} value={source} disabled={source === 'ion' && !ionToken}>
              {IMAGERY_LABELS[source]}
            </option>
          ))}
        </select>
        <span className="panel__hint">Currently showing: {resolved ?? '…'}</span>
      </label>

      <label className="field">
        <span className="field__label">Cesium Ion access token (optional)</span>
        <input
          className="input input--wide"
          type="password"
          autoComplete="off"
          placeholder="eyJhbGci…"
          value={tokenDraft}
          onChange={(e) => setTokenDraft(e.target.value)}
          onBlur={() => setIonToken(tokenDraft)}
          aria-label="Cesium Ion access token"
        />
        <span className="panel__hint">
          A free account at cesium.com/ion gives Bing satellite imagery and world terrain. Stored only on this device.
        </span>
      </label>

      <label className="field">
        <span className="field__label">Catalogue points limit</span>
        <input
          className="input"
          type="number"
          min={500}
          max={30000}
          step={500}
          value={maxCatalogPoints}
          onChange={(e) => setMaxCatalogPoints(Math.max(500, Math.min(30000, Number(e.target.value) || 500)))}
          aria-label="Catalogue points limit"
        />
        <span className="panel__hint">Lower this on slower machines or phones.</span>
      </label>

      <section className="field" data-testid="updates">
        <span className="field__label">Updates</span>
        {!isTauri() && <span className="panel__hint">Updates apply to the installed app only.</span>}
        {isTauri() && (
          <>
            <div className="toggles">
              <button type="button" className="btn" disabled={updateStatus === 'checking' || updateStatus === 'installing'} onClick={() => void checkUpdates()}>
                {updateStatus === 'checking' ? 'Checking…' : 'Check for updates'}
              </button>
              {updateStatus === 'available' && update && (
                <button type="button" className="btn btn--on" onClick={() => void installUpdate()}>
                  Install {update.version}
                </button>
              )}
            </div>
            <span className="panel__hint">
              {updateStatus === 'upToDate' && `Up to date (${APP_VERSION}).`}
              {updateStatus === 'available' && update && `Version ${update.version} is available; you have ${update.currentVersion}.`}
              {updateStatus === 'installing' && `Downloading${updateProgress !== null ? ` ${Math.round(updateProgress * 100)}%` : '…'} The app restarts when done.`}
              {updateStatus === 'error' && `Could not check: ${updateError}`}
              {updateStatus === 'idle' && 'Checked automatically a few seconds after start-up and every 6 hours.'}
              {checkedAt && updateStatus !== 'idle' && ` Last check ${checkedAt.toLocaleTimeString()}.`}
            </span>
            {updateStatus === 'available' && update?.notes && <pre className="notes">{update.notes}</pre>}
          </>
        )}
      </section>

      <section className="field">
        <span className="field__label">About</span>
        <p className="panel__hint">
          SatLoc {APP_VERSION}. Orbital elements from CelesTrak (celestrak.org) with tle.ivanstanojevic.me as
          fallback; positions by SGP4 (satellite.js). Imagery: Esri World Imagery, NASA GIBS, Natural Earth II;
          globe by CesiumJS. Satellite positions carry the usual SGP4 error of a few kilometres and grow with the age
          of the element set.
        </p>
      </section>
    </div>
  );
}
