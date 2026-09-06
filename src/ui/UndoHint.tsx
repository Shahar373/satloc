import type { UndoOffer } from './useUndo';

export function UndoHint({ offer }: { offer: UndoOffer | null }) {
  if (!offer) return null;
  return (
    <p className="panel__hint" role="status">
      {offer.label} ·{' '}
      <button type="button" className="link" onClick={offer.restore}>
        undo
      </button>
    </p>
  );
}
