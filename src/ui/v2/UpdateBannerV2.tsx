import { useTranslation } from 'react-i18next';
import { useUpdates } from '../../state/updates';

/**
 * Top-bar notice when a newer signed build is available — Shell V2's counterpart to V1's
 * UpdateBanner (removed alongside the rest of Shell V1), styled with `.sl-*` tokens instead of
 * V1's `badge`/`link` classes. Same `useUpdates` store either way; only the presentation changes.
 */
export function UpdateBannerV2() {
  const { t } = useTranslation();
  const status = useUpdates((s) => s.status);
  const update = useUpdates((s) => s.update);
  const progress = useUpdates((s) => s.progress);
  const dismissed = useUpdates((s) => s.dismissed);
  const error = useUpdates((s) => s.error);
  const install = useUpdates((s) => s.install);
  const dismiss = useUpdates((s) => s.dismiss);

  if (status === 'installing') {
    return (
      <span className="sl-update-banner sl-update-banner--nominal" data-testid="update-banner">
        {progress !== null
          ? t('updates.installingWithPercent', { percent: Math.round(progress * 100) })
          : t('updates.installingUnknown')}
      </span>
    );
  }
  if (status !== 'available' || !update || dismissed) return null;
  return (
    <span
      className={`sl-update-banner${error ? ' sl-update-banner--warning' : ' sl-update-banner--nominal'}`}
      data-testid="update-banner"
      title={error ?? undefined}
    >
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
