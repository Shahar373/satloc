import { useUpdates } from '../state/updates';

/** Compact top-bar notice when a newer signed build is available. */
export function UpdateBanner() {
  const status = useUpdates((s) => s.status);
  const update = useUpdates((s) => s.update);
  const progress = useUpdates((s) => s.progress);
  const dismissed = useUpdates((s) => s.dismissed);
  const error = useUpdates((s) => s.error);
  const install = useUpdates((s) => s.install);
  const dismiss = useUpdates((s) => s.dismiss);

  if (status === 'installing') {
    return (
      <span className="badge badge--ok" data-testid="update-banner">
        Installing update{progress !== null ? ` ${Math.round(progress * 100)}%` : '…'}
      </span>
    );
  }
  if (status !== 'available' || !update || dismissed) return null;
  return (
    <span className={`badge update-banner${error ? ' badge--warn' : ' badge--ok'}`} data-testid="update-banner" title={error ?? undefined}>
      {error ? `Update to ${update.version} failed` : `SatLoc ${update.version} is available`}{' '}
      <button type="button" className="link" onClick={() => void install()} title="Downloads the update and restarts SatLoc">
        {error ? 'retry' : 'install & restart'}
      </button>{' '}
      <button type="button" className="link" onClick={dismiss} aria-label="Dismiss update notice">
        ×
      </button>
    </span>
  );
}
