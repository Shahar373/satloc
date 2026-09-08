import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getKeyValueStore } from '../../platform/kv';
import { openExternal } from '../../platform/open';
import { getStorage, listStorageKeys } from '../../platform/storage';
import { useCatalog } from '../../state/catalog';
import { useSettings } from '../../state/settings';
import { useUpdates } from '../../state/updates';
import { useViewerStore } from '../../state/viewer';
import { IMAGERY_LABELS, IMAGERY_SOURCES, type ImagerySource } from '../../viewer/imagery';
import { APP_VERSION, ISSUES_URL, copyDiagnostics } from '../diagnostics';
import { Icon } from './Icon';
import { Button } from './primitives/Button';

export interface SettingsV2Props {
  open: boolean;
  onClose: () => void;
}

const POINTS_MIN = 500;
const POINTS_MAX = 30_000;
const POINTS_STEP = 500;

/** Every key-value namespace the app persists into (see platform/kv.ts) — cleared on a full reset. */
const KV_NAMESPACES = ['catalog'] as const;

/**
 * The settings dialog — Shell V2's counterpart to the settings panel the removed Shell V1 had
 * (PR #22 carried over the update banner but not this, so imagery, the Ion token, the catalogue
 * points limit, a manual update check, and reset had no UI at all since then). Same stores as V1
 * (`useSettings`, `useUpdates`, `useCatalog`), presented with the V2 primitives. Opened from the
 * gear in TopBarV2; AppV2 owns the open state so Escape and the drawer/overlay stacking follow the
 * same rules as the command palette.
 */
export function SettingsV2({ open, onClose }: SettingsV2Props) {
  const { t, i18n } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);

  const imagery = useSettings((s) => s.imagery);
  const ionToken = useSettings((s) => s.ionToken);
  const maxCatalogPoints = useSettings((s) => s.maxCatalogPoints);
  const setImagery = useSettings((s) => s.setImagery);
  const setIonToken = useSettings((s) => s.setIonToken);
  const setMaxCatalogPoints = useSettings((s) => s.setMaxCatalogPoints);
  const resolved = useViewerStore((s) => s.imagery);
  const imageryPending = useViewerStore((s) => s.imageryPending);
  const problems = useViewerStore((s) => s.problems);

  const updateStatus = useUpdates((s) => s.status);
  const update = useUpdates((s) => s.update);
  const updateError = useUpdates((s) => s.error);
  const updateProgress = useUpdates((s) => s.progress);
  const checkedAt = useUpdates((s) => s.checkedAt);
  const checkUpdates = useUpdates((s) => s.check);
  const installUpdate = useUpdates((s) => s.install);

  const clearDownloaded = useCatalog((s) => s.clearDownloaded);

  const [tokenDraft, setTokenDraft] = useState(ionToken);
  const [pointsDraft, setPointsDraft] = useState(String(maxCatalogPoints));
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const [resetArmed, setResetArmed] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTokenDraft(ionToken);
    setPointsDraft(String(maxCatalogPoints));
    setResetArmed(false);
    const id = requestAnimationFrame(() => closeRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, ionToken, maxCatalogPoints]);

  if (!open) return null;

  const commitToken = () => {
    const token = tokenDraft.trim();
    setIonToken(token);
    // Ion imagery needs a token; without one the option is disabled, so fall back to automatic.
    if (!token && imagery === 'ion') setImagery('auto');
  };

  const commitPoints = () => {
    const parsed = Number.parseInt(pointsDraft, 10);
    if (!Number.isFinite(parsed)) {
      setPointsDraft(String(maxCatalogPoints));
      return;
    }
    const clamped = Math.min(POINTS_MAX, Math.max(POINTS_MIN, Math.round(parsed / POINTS_STEP) * POINTS_STEP));
    setMaxCatalogPoints(clamped);
    setPointsDraft(String(clamped));
  };

  const copy = async () => {
    setCopied((await copyDiagnostics()) ? 'done' : 'failed');
    window.setTimeout(() => setCopied('idle'), 2500);
  };

  const resetEverything = async () => {
    for (const key of listStorageKeys()) getStorage().removeItem(key);
    for (const namespace of KV_NAMESPACES) {
      await getKeyValueStore(namespace)
        .clear()
        .catch(() => undefined);
    }
    window.location.reload();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const updateHint = (() => {
    switch (updateStatus) {
      case 'checking':
        return t('settings.updates.checking');
      case 'upToDate':
        return t('settings.updates.upToDate', { version: APP_VERSION });
      case 'available':
        return update
          ? `${t('settings.updates.available', { version: update.version, current: update.currentVersion })}${updateError ? ` ${updateError}` : ''}`
          : '';
      case 'installing':
        return updateProgress !== null
          ? t('settings.updates.installingWithPercent', { percent: Math.round(updateProgress * 100) })
          : t('settings.updates.installing');
      case 'error':
        return t('settings.updates.error', { message: updateError ?? '' });
      case 'unsupported':
        return t('settings.updates.desktopOnly');
      default:
        return t('settings.updates.idle');
    }
  })();

  return (
    <div className="sl-settings-overlay" role="presentation" onClick={onClose}>
      <div
        className="sl-settings"
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.title')}
        data-testid="settings"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="sl-settings__header">
          <h2 className="sl-settings__title">{t('settings.title')}</h2>
          <span className="sl-settings__version sl-mono">
            SatLoc <span className="sl-bidi-isolate">{APP_VERSION}</span>
          </span>
          <button
            ref={closeRef}
            type="button"
            className="sl-settings__close"
            onClick={onClose}
            aria-label={t('palette.close')}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="sl-settings__body">
          <section className="sl-settings__section">
            <h3>{t('settings.language.title')}</h3>
            <div className="sl-settings__row">
              <Button
                variant={i18n.language === 'en' ? 'primary' : 'default'}
                onClick={() => void i18n.changeLanguage('en')}
              >
                English
              </Button>
              <Button
                variant={i18n.language === 'he' ? 'primary' : 'default'}
                onClick={() => void i18n.changeLanguage('he')}
              >
                עברית
              </Button>
            </div>
          </section>

          <section className="sl-settings__section" data-testid="settings-updates">
            <h3>{t('settings.updates.title')}</h3>
            <div className="sl-settings__row">
              <Button
                disabled={
                  updateStatus === 'checking' || updateStatus === 'installing' || updateStatus === 'unsupported'
                }
                onClick={() => void checkUpdates()}
              >
                <Icon name="refresh" size={14} />{' '}
                {updateStatus === 'checking' ? t('updates.checking') : t('updates.check')}
              </Button>
              {updateStatus === 'available' && update && (
                <Button variant="primary" onClick={() => void installUpdate()}>
                  <Icon name="download" size={14} /> {t('settings.updates.install', { version: update.version })}
                </Button>
              )}
            </div>
            <p className="sl-settings__hint">
              {updateHint}
              {checkedAt && updateStatus !== 'idle' && updateStatus !== 'unsupported' && (
                <> {t('settings.updates.lastCheck', { time: checkedAt.toLocaleTimeString() })}</>
              )}
            </p>
            {updateStatus === 'available' && update?.notes && <pre className="sl-settings__notes">{update.notes}</pre>}
          </section>

          <section className="sl-settings__section">
            <h3>{t('settings.imagery.title')}</h3>
            <label className="sl-settings__field">
              <span className="sl-settings__label">{t('settings.imagery.source')}</span>
              <select
                className="sl-settings__select"
                value={imagery}
                onChange={(event) => setImagery(event.target.value as ImagerySource)}
              >
                {IMAGERY_SOURCES.map((source) => (
                  <option key={source} value={source} disabled={source === 'ion' && !ionToken}>
                    {IMAGERY_LABELS[source]}
                  </option>
                ))}
              </select>
            </label>
            <p className="sl-settings__hint">
              {t('settings.imagery.showing', { source: resolved ? IMAGERY_LABELS[resolved] : '…' })}
              {imageryPending && ` ${t('settings.imagery.probing')}`}
            </p>
            {problems.map((problem) => (
              <p key={problem.label} className="sl-settings__hint sl-settings__hint--warning">
                {problem.detail}
              </p>
            ))}
            <label className="sl-settings__field">
              <span className="sl-settings__label">{t('settings.imagery.ionToken')}</span>
              <input
                className="sl-settings__input sl-mono"
                type="password"
                autoComplete="off"
                placeholder="eyJhbGci…"
                value={tokenDraft}
                onChange={(event) => setTokenDraft(event.target.value)}
                onBlur={commitToken}
              />
            </label>
            <p className="sl-settings__hint">{t('settings.imagery.ionHint')}</p>
          </section>

          <section className="sl-settings__section">
            <h3>{t('settings.catalog.title')}</h3>
            <label className="sl-settings__field">
              <span className="sl-settings__label">{t('settings.catalog.pointsLimit')}</span>
              <input
                className="sl-settings__input sl-settings__input--short sl-mono"
                type="number"
                inputMode="numeric"
                min={POINTS_MIN}
                max={POINTS_MAX}
                step={POINTS_STEP}
                value={pointsDraft}
                onChange={(event) => setPointsDraft(event.target.value)}
                onBlur={commitPoints}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                }}
              />
            </label>
            <p className="sl-settings__hint">{t('settings.catalog.pointsHint')}</p>
            <div className="sl-settings__row">
              <Button
                disabled={clearing}
                onClick={() => {
                  setClearing(true);
                  void clearDownloaded().finally(() => setClearing(false));
                }}
              >
                {clearing ? t('settings.catalog.clearing') : t('settings.catalog.clear')}
              </Button>
            </div>
            <p className="sl-settings__hint">{t('settings.catalog.clearHint')}</p>
          </section>

          <section className="sl-settings__section">
            <h3>{t('settings.help.title')}</h3>
            <div className="sl-settings__row">
              <Button onClick={() => void copy()}>
                {copied === 'done'
                  ? t('settings.help.copied')
                  : copied === 'failed'
                    ? t('settings.help.copyFailed')
                    : t('settings.help.copy')}
              </Button>
              <Button onClick={() => void openExternal(ISSUES_URL)}>{t('settings.help.report')}</Button>
            </div>
            <dl className="sl-settings__shortcuts">
              <div>
                <dt>
                  <kbd>{navigator.platform.toLowerCase().includes('mac') ? '⌘K' : 'Ctrl+K'}</kbd>
                </dt>
                <dd>{t('settings.help.shortcutPalette')}</dd>
              </div>
              <div>
                <dt>
                  <kbd>Esc</kbd>
                </dt>
                <dd>{t('settings.help.shortcutEscape')}</dd>
              </div>
            </dl>
          </section>

          <section className="sl-settings__section sl-settings__section--danger">
            <h3>{t('settings.reset.title')}</h3>
            <div className="sl-settings__row">
              {!resetArmed ? (
                <Button onClick={() => setResetArmed(true)}>{t('settings.reset.arm')}</Button>
              ) : (
                <>
                  <Button variant="primary" className="sl-button--danger" onClick={() => void resetEverything()}>
                    {t('settings.reset.confirm')}
                  </Button>
                  <Button variant="ghost" onClick={() => setResetArmed(false)}>
                    {t('settings.reset.cancel')}
                  </Button>
                </>
              )}
            </div>
            <p className="sl-settings__hint">{t('settings.reset.hint')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
