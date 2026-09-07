import type { ReactNode } from 'react';

export interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  /** Renders the value in the monospace/tabular-nums style used for telemetry and other data. */
  tabular?: boolean;
}

/** Labeled value display — altitude/velocity/lat/lon-style read-only fields throughout Shell V2. */
export function Field({ label, children, tabular = true }: FieldProps) {
  return (
    <div className="sl-field">
      <span className="sl-field__label">{label}</span>
      <div className={tabular ? 'sl-field__value sl-tabular sl-mono' : 'sl-field__value'}>{children}</div>
    </div>
  );
}
