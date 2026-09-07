import { useTranslation } from 'react-i18next';
import type { IconName } from './Icon';
import { Icon } from './Icon';

export type WorkspaceId = 'explore' | 'plan' | 'train';

const WORKSPACES: Array<{ id: WorkspaceId; labelKey: string; icon: IconName }> = [
  { id: 'explore', labelKey: 'rail.explore', icon: 'globe' },
  { id: 'plan', labelKey: 'rail.plan', icon: 'radio' },
  { id: 'train', labelKey: 'rail.train', icon: 'satellite' },
];

export interface RailV2Props {
  workspace: WorkspaceId;
  onChange: (workspace: WorkspaceId) => void;
}

/**
 * Compact icon rail (56px) that reveals workspace labels on hover/focus, adopted from Variant
 * B's discoverability in the Design Gate without committing to B's permanently-expanded 240px
 * sidebar (see docs/design/gate-01/DECISION.md for why that combination didn't hold up at
 * narrower widths).
 */
export function RailV2({ workspace, onChange }: RailV2Props) {
  const { t } = useTranslation();
  return (
    <nav className="sl-rail" aria-label={t('rail.label')}>
      {WORKSPACES.map((w) => (
        <button
          key={w.id}
          type="button"
          className={`sl-rail__item${workspace === w.id ? ' sl-rail__item--active' : ''}`}
          aria-current={workspace === w.id ? 'page' : undefined}
          onClick={() => onChange(w.id)}
        >
          <Icon name={w.icon} size={18} />
          <span className="sl-rail__label">{t(w.labelKey)}</span>
        </button>
      ))}
    </nav>
  );
}
