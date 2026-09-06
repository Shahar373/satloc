import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

interface NumberFieldProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit(value: number): void;
  'aria-label': string;
  title?: string;
  className?: string;
}

/**
 * Number input that lets the user type freely: a valid in-range value is applied as soon as it is
 * typed (so the spinner works), anything else waits for blur/Enter and is then clamped, instead of
 * being clamped keystroke by keystroke ("30" turning into 50 because "3" was clamped to 5 first).
 */
export function NumberField({ value, min, max, step, onCommit, title, className, 'aria-label': ariaLabel }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, parsed));
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <input
      className={className ?? 'input input--num'}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={text}
      aria-label={ariaLabel}
      title={title}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const parsed = Number(raw);
        if (raw.trim() !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max && parsed !== value) onCommit(parsed);
      }}
      onBlur={(e) => {
        setFocused(false);
        if (cancelled.current) {
          cancelled.current = false;
          setText(String(value));
          return;
        }
        commit(e.target.value);
      }}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          // blur() runs onBlur synchronously; the flag keeps it from committing the discarded text.
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}
