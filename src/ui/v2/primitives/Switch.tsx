export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name — required, since the switch carries no visible label of its own. */
  label: string;
  disabled?: boolean;
}

/**
 * Accessible toggle switch. A native `<button>` with `role="switch"` and `aria-checked`, so
 * Enter/Space and focus behavior come from the browser for free rather than being reimplemented.
 */
export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`sl-switch${checked ? ' sl-switch--on' : ''}`}
      onClick={() => onChange(!checked)}
    />
  );
}
