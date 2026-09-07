import type { HTMLAttributes } from 'react';

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /** Raises the surface a shade lighter than the app background — for cards nested on a panel. */
  raised?: boolean;
  /** Highlights the surface as selected/active (e.g. the selected task in a list). */
  selected?: boolean;
}

/**
 * Base themed container — the building block behind task cards, findings, gauges, and other
 * bordered boxes throughout Shell V2. Not to be confused with `src/ui/Panel.tsx` (Shell V1's
 * collapsible sidebar section, a different concept).
 */
export function Surface({ raised = false, selected = false, className, ...rest }: SurfaceProps) {
  const classes = ['sl-surface', raised ? 'sl-surface--raised' : '', selected ? 'sl-surface--selected' : '', className]
    .filter(Boolean)
    .join(' ');
  return <div className={classes} {...rest} />;
}
