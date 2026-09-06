import type { ReactNode } from 'react';
import { useUi } from '../state/ui';

interface PanelProps {
  /** Stable id: the collapsed state is remembered under it. */
  id: string;
  title: ReactNode;
  /** Controls shown at the right of the header while expanded. */
  actions?: ReactNode;
  testId?: string;
  children: ReactNode;
}

/** Sidebar section with a collapsible header, so the sidebar does not grow to several screens. */
export function Panel({ id, title, actions, testId, children }: PanelProps) {
  const collapsed = useUi((s) => s.collapsed[id] ?? false);
  const togglePanel = useUi((s) => s.togglePanel);
  return (
    <section className={`panel${collapsed ? ' panel--collapsed' : ''}`} data-testid={testId}>
      <div className="panel__header">
        <h2 className="panel__title">
          <button
            type="button"
            className="panel__toggle"
            onClick={() => togglePanel(id)}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <span className="panel__chevron" aria-hidden="true">
              {collapsed ? '▸' : '▾'}
            </span>
            {title}
          </button>
        </h2>
        {!collapsed && actions && <span className="panel__actions">{actions}</span>}
      </div>
      {!collapsed && children}
    </section>
  );
}
