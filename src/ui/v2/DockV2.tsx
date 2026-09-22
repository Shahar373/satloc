import { useTranslation } from 'react-i18next';
import { useCatalog } from '../../state/catalog';
import { useSelection } from '../../state/selection';
import { ExploreControlsV2 } from './ExploreControlsV2';

/** Explore time controls and the selectable catalog. */
export function DockV2({ onSelect }: { onSelect: (id: number) => void }) {
  const { t } = useTranslation();
  const sets = useCatalog((s) => s.sets);
  const selectedId = useSelection((s) => s.selectedId);
  const source = useCatalog((s) => s.source);
  const error = useCatalog((s) => s.error);
  const notice = useCatalog((s) => s.notice);

  return (
    <div className="sl-dock">
      <ExploreControlsV2 />
      <div className="sl-dock__title">
        {t('dock.catalog', { count: sets.length })}
        <span>{t(`dock.sources.${source}`)}</span>
      </div>
      {(error || notice) && (
        <p className="sl-dock__notice" role="status">
          {error || notice}
        </p>
      )}
      <table className="sl-dock__table">
        <thead>
          <tr>
            <th>{t('dock.satellite')}</th>
            <th>NORAD</th>
            <th>{t('dock.inclination')}</th>
          </tr>
        </thead>
        <tbody>
          {sets.map((set) => (
            <tr
              key={set.noradId}
              className={set.noradId === selectedId ? 'sl-dock__row sl-dock__row--selected' : 'sl-dock__row'}
              onClick={() => onSelect(set.noradId)}
            >
              <td className="sl-dock__row-name">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(set.noradId);
                  }}
                  aria-pressed={set.noradId === selectedId}
                >
                  {set.name}
                </button>
              </td>
              <td className="sl-mono sl-tabular">{set.noradId}</td>
              <td className="sl-mono sl-tabular">{set.inclinationDeg.toFixed(1)}°</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
