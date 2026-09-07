import type { ReactNode } from 'react';

export type PillTone = 'nominal' | 'warning' | 'critical' | 'info';

export interface PillProps {
  tone: PillTone;
  children: ReactNode;
}

/**
 * Small status badge. Tones map directly onto the plan-validation severities used elsewhere in
 * the product (`HardBlock` -> critical, `WaivableWarning` -> warning, `Info` -> info) plus
 * `nominal` for a healthy/ready state — but this component itself is generic status styling,
 * not aware of that domain vocabulary.
 */
export function Pill({ tone, children }: PillProps) {
  return <span className={`sl-pill sl-pill--${tone}`}>{children}</span>;
}
