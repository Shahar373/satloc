import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'default' | 'ghost';
}

/** Base button primitive for Shell V2. `type="button"` by default — pass `type="submit"` to override. */
export function Button({ variant = 'default', className, type = 'button', ...rest }: ButtonProps) {
  const classes = ['sl-button', `sl-button--${variant}`, className].filter(Boolean).join(' ');
  return <button type={type} className={classes} {...rest} />;
}
