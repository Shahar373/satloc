import { useCallback, useEffect, useRef, useState } from 'react';

const UNDO_MS = 8000;

export interface UndoOffer {
  label: string;
  restore(): void;
}

/** A short-lived "Removed X · undo" offer; the caller renders it and clears it by calling `restore` or waiting. */
export function useUndo(): [UndoOffer | null, (offer: UndoOffer) => void, () => void] {
  const [offer, setOffer] = useState<UndoOffer | null>(null);
  const timer = useRef<number | null>(null);
  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setOffer(null);
  }, []);
  const propose = useCallback(
    (next: UndoOffer) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      setOffer({
        label: next.label,
        restore: () => {
          next.restore();
          clear();
        },
      });
      timer.current = window.setTimeout(() => setOffer(null), UNDO_MS);
    },
    [clear],
  );
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);
  return [offer, propose, clear];
}
