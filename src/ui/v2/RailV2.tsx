import { useTranslation } from 'react-i18next';
import type { IconName } from './Icon';
import { Icon } from './Icon';

export type WorkspaceId = 'explore' | 'plan' | 'train' | 'debrief';

const WORKSPACES: Array<{ id: WorkspaceId; labelKey: string; icon: IconName }> = [
  { id: 'explore', labelKey: 'rail.explore', icon: 'globe' },
  { id: 'plan', labelKey: 'rail.plan', icon: 'radio' },
  { id: 'train', labelKey: 'rail.train', icon: 'satellite' },
  { id: 'debrief', labelKey: 'rail.debrief', icon: 'debrief' },
];

export interface RailV2Props {
  workspace: WorkspaceId;
  onChange: (workspace: WorkspaceId) => void;
  /**
   * Whether the rail is currently shown as an on-demand drawer (below the 1200px breakpoint —
   * see the media query in shell.css). Purely presentational above the breakpoint: the CSS there
   * keeps the rail persistent regardless of this value, so passing it is harmless either way.
   */
  drawerOpen?: boolean;
  /** Closes the drawer. Ignored above the breakpoint (no drawer to close). */
  onCloseDrawer?: () => void;
}

/** Labeled workspace rail on desktop; a navigation drawer below 1200px. */
export function RailV2({ workspace, onChange, drawerOpen = false, onCloseDrawer }: RailV2Props) {
  const { t } = useTranslation();
  return (
    <nav className="sl-rail" aria-label={t('rail.label')} data-open={drawerOpen}>
      <button type="button" className="sl-rail__drawer-close" onClick={onCloseDrawer} aria-label={t('palette.close')}>
        <Icon name="close" size={16} />
      </button>
      {WORKSPACES.map((w) => (
        <button
          key={w.id}
          type="button"
          className={`sl-rail__item${workspace === w.id ? ' sl-rail__item--active' : ''}`}
          aria-current={workspace === w.id ? 'page' : undefined}
          onClick={() => {
            onChange(w.id);
            onCloseDrawer?.();
          }}
        >
          <Icon name={w.icon} size={20} />
          <span className="sl-rail__label">{t(w.labelKey)}</span>
        </button>
      ))}
    </nav>
  );
}
