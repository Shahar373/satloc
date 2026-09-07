import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCatalog } from '../../state/catalog';
import { useSelection } from '../../state/selection';
import { Icon } from './Icon';

export interface CommandPaletteV2Props {
  open: boolean;
  onClose: () => void;
}

/**
 * The functional counterpart to TopBarV2's search affordance: a modal overlay that filters the
 * real satellite catalog (`useCatalog().search`, the same search already used elsewhere in the
 * app) and jump-selects into `useSelection`. Opened by clicking the top bar's search button or
 * ⌘K/Ctrl+K (wired in `AppV2`, which owns the open/close state so both triggers share it).
 */
export function CommandPaletteV2({ open, onClose }: CommandPaletteV2Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useCatalog((s) => s.search);
  const select = useSelection((s) => s.select);

  const results = useMemo(() => (query.trim() ? search(query, 8) : []), [query, search]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const choose = (noradId: number) => {
    select(noradId);
    onClose();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = results[activeIndex];
      if (hit) choose(hit.noradId);
    }
  };

  return (
    <div className="sl-palette-overlay" role="presentation" onClick={onClose}>
      <div
        className="sl-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.label')}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="sl-palette__input-row">
          <Icon name="search" size={14} />
          <input
            ref={inputRef}
            className="sl-palette__input"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('topbar.searchPlaceholder')}
            aria-label={t('topbar.searchPlaceholder')}
          />
          <button type="button" className="sl-palette__close" onClick={onClose} aria-label={t('palette.close')}>
            <Icon name="close" size={14} />
          </button>
        </div>
        <ul className="sl-palette__results" role="listbox">
          {results.length === 0 && query.trim() !== '' && (
            <li className="sl-palette__empty">{t('palette.noResults')}</li>
          )}
          {results.map((set, i) => (
            <li key={set.noradId}>
              <button
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                className={`sl-palette__result${i === activeIndex ? ' sl-palette__result--active' : ''}`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => choose(set.noradId)}
              >
                <span className="sl-palette__result-name">{set.name}</span>
                <span className="sl-mono sl-tabular sl-palette__result-id">{set.noradId}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
