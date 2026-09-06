import { useEffect, useRef, useState } from 'react';
import { isTauri } from '../platform/env';
import { getKeyValueStore } from '../platform/kv';
import { openExternal } from '../platform/open';
import { getStorage, listStorageKeys } from '../platform/storage';
import { useCatalog } from '../state/catalog';
import { useSettings } from '../state/settings';
import { useUi } from '../state/ui';
import { useUpdates } from '../state/updates';
import { useViewerStore } from '../state/viewer';
import { IMAGERY_LABELS, IMAGERY_SOURCES, type ImagerySource } from '../viewer/imagery';
import { NumberField } from './NumberField';
import { APP_VERSION, ISSUES_URL, copyDiagnostics } from './diagnostics';
import { SHORTCUTS } from './useKeyboardShortcuts';

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
  const imageryPending = useViewerStore((s) => s.imageryPending);
  const problems = useViewerStore((s) => s.problems);
  const [tokenDraft, setTokenDraft] = useState(ionToken);
  const updateStatus = useUpdates((s) => s.status);
  const update = useUpdates((s) => s.update);
  const updateError = useUpdates((s) => s.error);
  const updateProgress = useUpdates((s) => s.progress);
  const checkedAt = useUpdates((s) => s.checkedAt);
  const checkUpdates = useUpdates((s) => s.check);
  const installUpdate = useUpdates((s) => s.install);
  const closeRef = useRef<HTMLButtonElement>(null);
  const clearDownloaded = useCatalog((s) => s.clearDownloaded);
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const [resetArmed, setResetArmed] = useState(false);
  const [clearing, setClearing] = useState(false);

  const copy = async () => {
    setCopied((await copyDiagnostics()) ? 'done' : 'failed');
    window.setTimeout(() => setCopied('idle'), 2500);
  };

  const resetEverything = async () => {
    for (const key of listStorageKeys()) getStorage().removeItem(key);
    await getKeyValueStore().clear().catch(() => undefined);
    window.location.reload();
  };

  // Move focus into the dialog when it opens (keyboard users land on the close button).
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const commitToken = () => {
    const token = tokenDraft.trim();
    setIonToken(token);
    // Ion imagery needs a token; without one the option is disabled, so fall back to automatic.
    if (!token && imagery === 'ion') setImagery('auto');
  };

  return (
    <>
      <div className="settings-backdrop" onClick={close} aria-hidden="true" />
      <div className="settings" role="dialog" aria-modal="true" aria-label="Settings" data-testid="settings">
        <div className="panel__header">
          <h2 className="panel__title">Settings</h2>
          <button ref={closeRef} type="button" className="link" onClick={close} title="Close (Esc)" aria-label="Close">
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
          <span className="panel__hint">
            Currently showing: {resolved ? IMAGERY_LABELS[resolved] : '…'}
            {imageryPending && ' (checking whether online imagery is reachable…)'}
          </span>
          {problems.map((p) => (
            <span key={p.label} className="panel__hint panel__hint--warn">
              {p.detail}
            </span>
          ))}
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
            onBlur={commitToken}
            aria-label="Cesium Ion access token"
          />
          <span className="panel__hint">
            A free account at cesium.com/ion gives Bing satellite imagery and world terrain. Stored unencrypted on this
            device only; use a token limited to imagery and terrain.
          </span>
        </label>

        <label className="field">
          <span className="field__label">Catalogue points limit</span>
          <NumberField
            className="input"
            value={maxCatalogPoints}
            min={500}
            max={30000}
            step={500}
            onCommit={setMaxCatalogPoints}
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
                  <button type="button" className="btn btn--on" onClick={() => void installUpdate()} title="Downloads the update and restarts SatLoc">
                    Install {update.version} and restart
                  </button>
                )}
              </div>
              <span className="panel__hint">
                {updateStatus === 'upToDate' && `Up to date (${APP_VERSION}).`}
                {updateStatus === 'available' && update && `Version ${update.version} is available; you have ${update.currentVersion}.`}
                {updateStatus === 'available' && updateError && ` ${updateError}`}
                {updateStatus === 'installing' && `Downloading${updateProgress !== null ? ` ${Math.round(updateProgress * 100)}%` : '…'} The app restarts when done.`}
                {updateStatus === 'error' && `Could not check: ${updateError}`}
                {updateStatus === 'unsupported' && 'Updates are only available in the installed desktop app.'}
                {updateStatus === 'idle' && 'Checked automatically a few seconds after start-up and every 6 hours.'}
                {checkedAt && updateStatus !== 'idle' && ` Last check ${checkedAt.toLocaleTimeString()}.`}
              </span>
              {updateStatus === 'available' && update?.notes && <pre className="notes">{update.notes}</pre>}
            </>
          )}
        </section>

        <section className="field">
          <span className="field__label">Keyboard shortcuts</span>
          <dl className="facts shortcuts">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="shortcuts__row">
                <dt>
                  <kbd>{s.keys}</kbd>
                </dt>
                <dd>{s.action}</dd>
              </div>
            ))}
          </dl>
          <span className="panel__hint">On the timeline: ← → step a minute (Shift: 10), PgUp/PgDn an hour, Home = now.</span>
        </section>

        <section className="field">
          <span className="field__label">Reset</span>
          <div className="toggles">
            <button
              type="button"
              className="btn"
              disabled={clearing}
              title="Deletes the downloaded catalogue groups and their 2-hour bookkeeping; displayed groups are fetched again"
              onClick={() => {
                setClearing(true);
                void clearDownloaded().finally(() => setClearing(false));
              }}
            >
              {clearing ? 'Clearing…' : 'Clear downloaded catalogue'}
            </button>
            {!resetArmed ? (
              <button type="button" className="btn" onClick={() => setResetArmed(true)} title="Targets, observer, pins, imagery choice, token, everything">
                Reset all settings…
              </button>
            ) : (
              <>
                <button type="button" className="btn btn--danger" onClick={() => void resetEverything()}>
                  Yes, reset and restart
                </button>
                <button type="button" className="btn" onClick={() => setResetArmed(false)}>
                  Cancel
                </button>
              </>
            )}
          </div>
          {resetArmed && (
            <span className="panel__hint panel__hint--warn">
              This removes targets, the observer, pinned satellites, the imagery choice and the Ion token, and restarts SatLoc.
            </span>
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
          <p className="panel__hint">
            Built with CesiumJS (Apache-2.0), satellite.js (MIT), React (MIT), zustand (MIT) and Tauri (MIT/Apache-2.0).
            Natural Earth II tiles are public domain; Esri and NASA GIBS imagery under their terms of use.
          </p>
          <div className="toggles">
            <button type="button" className="btn" onClick={() => void copy()} title="Copies a plain-text state summary (no token) for a bug report">
              {copied === 'done' ? 'Copied ✓' : copied === 'failed' ? 'Copy failed' : 'Copy diagnostics'}
            </button>
            <button type="button" className="btn" onClick={() => void openExternal(ISSUES_URL)} title="Opens GitHub in your browser; paste the diagnostics there">
              Report a problem
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
