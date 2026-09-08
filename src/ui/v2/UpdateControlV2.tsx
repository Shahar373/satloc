import { useTranslation } from 'react-i18next';
import { useUpdates } from '../../state/updates';
import { Icon } from './Icon';

/**
 * The top bar's always-present update control. Replaces the old passive banner (which only
 * appeared once a background check had already found something, leaving no way to ask for a
 * check by hand — the desktop app's single most-requested control after the settings panel):
 *
 * - idle / upToDate / error: a "Check for updates" button that runs the check on demand and shows
 *   the outcome inline, so a user who has just heard of a new build doesn't have to wait for the
 *   next scheduled 6-hourly check.
 * - available: the offer to install (and restart), with a dismiss for this session.
 * - installing: the download progress.
 * - unsupported (running in a browser, not the desktop app): stays visible but disabled with a
 *   tooltip, so the control's absence in the browser is never mistaken for a missing feature.
 *
 * Same `useUpdates` store as before — only the presentation changed.
 */
export function UpdateControlV2() {
  const { t } = useTranslation();
  const status = useUpdates((s) => s.status);
  const update = useUpdates((s) => s.update);
  const progress = useUpdates((s) => s.progress);
  const dismissed = useUpdates((s) => s.dismissed);
  const error = useUpdates((s) => s.error);
  const check = useUpdates((s) => s.check);
  const install = useUpdates((s) => s.install);
  const dismiss = useUpdates((s) => s.dismiss);

  if (status === 'installing') {
    return (
      <span className="sl-update-banner sl-update-banner--nominal" data-testid="update-banner">
        <Icon name="download" size={14} />
        {progress !== null
          ? t('updates.installingWithPercent', { percent: Math.round(progress * 100) })
          : t('updates.installingUnknown')}
      </span>
    );
  }

  if (status === 'available' && update && !dismissed) {
    return (
      <span
        className={`sl-update-banner${error ? ' sl-update-banner--warning' : ' sl-update-banner--nominal'}`}
        data-testid="update-banner"
        title={error ?? undefined}
      >
        <Icon name="download" size={14} />
        {error ? t('updates.failed', { version: update.version }) : t('updates.available', { version: update.version })}
        <button type="button" className="sl-update-banner__action" onClick={() => void install()}>
          {error ? t('updates.retry') : t('updates.install')}
        </button>
        <button type="button" className="sl-update-banner__action" onClick={dismiss} aria-label={t('updates.dismiss')}>
          ×
        </button>
      </span>
    );
  }

  const checking = status === 'checking';
  const unsupported = status === 'unsupported';
  const label = checking
    ? t('updates.checking')
    : status === 'upToDate'
      ? t('updates.upToDate')
      : status === 'error'
        ? t('updates.checkFailed')
        : unsupported
          ? t('updates.desktopOnly')
          : t('updates.check');
  return (
    <button
      type="button"
      className={`sl-topbar__update${status === 'error' ? ' sl-topbar__update--warning' : ''}`}
      onClick={() => void check()}
      disabled={checking || unsupported}
      title={status === 'error' && error ? error : unsupported ? t('updates.desktopOnlyHint') : t('updates.checkHint')}
      data-testid="update-check"
    >
      <Icon name="refresh" size={14} className={checking ? 'sl-icon--spin' : undefined} />
      <span>{label}</span>
    </button>
  );
}
