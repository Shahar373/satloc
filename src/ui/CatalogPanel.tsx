import { useMemo, useState } from 'react';
import { CATALOG_GROUPS } from '../core/catalog/groups';
import { ISRAEL_GROUP_ID, useCatalog } from '../state/catalog';
import { useSelection } from '../state/selection';
import { useSettings } from '../state/settings';

const GROUP_ROWS = [{ id: ISRAEL_GROUP_ID, name: 'Israeli satellites', approxCount: 15 }, ...CATALOG_GROUPS];

export function CatalogPanel() {
  const groups = useCatalog((s) => s.groups);
  const loadGroup = useCatalog((s) => s.loadGroup);
  const search = useCatalog((s) => s.search);
  const displayedGroups = useSettings((s) => s.displayedGroups);
  const setGroupDisplayed = useSettings((s) => s.setGroupDisplayed);
  const select = useSelection((s) => s.select);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  // `groups` is a dependency so results refresh as groups finish loading.
  const results = useMemo(() => (query.trim() ? search(query) : []), [query, search, groups]);
  const loadedCount = Object.values(groups).filter((g) => g.status === 'ready').length;

  return (
    <section className="panel" data-testid="catalog">
      <div className="panel__header">
        <h2 className="panel__title">Catalogue</h2>
        <button type="button" className="link" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'hide groups' : 'groups'}
        </button>
      </div>
      <input
        className="input input--wide"
        type="search"
        placeholder="Search name or NORAD id…"
        aria-label="Search satellites"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() && (
        <ul className="satlist" data-testid="search-results">
          {results.length === 0 && (
            <li className="panel__hint">
              No match{loadedCount === 0 ? '. Load a group below to search it.' : ' in the loaded groups.'}
            </li>
          )}
          {results.map((set) => (
            <li key={set.noradId}>
              <button
                type="button"
                className="satlist__item"
                onClick={() => {
                  select(set.noradId);
                  setQuery('');
                }}
              >
                <span className="satlist__dot" aria-hidden="true" />
                <span className="satlist__name">{set.name}</span>
                <span className="satlist__meta">{set.noradId}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {(open || displayedGroups.length > 0) && (
        <ul className="groups" data-testid="groups">
          {[...(groups['fixture'] ? [{ id: 'fixture', name: groups['fixture'].name, approxCount: 300 }] : []), ...GROUP_ROWS]
            .filter((g) => open || displayedGroups.includes(g.id))
            .map((g) => {
              const state = groups[g.id];
              const displayed = displayedGroups.includes(g.id);
              const count = state?.status === 'ready' ? state.records.length : undefined;
              return (
                <li key={g.id} className="groups__row">
                  <label className="groups__label">
                    <input
                      type="checkbox"
                      checked={displayed}
                      onChange={(e) => {
                        setGroupDisplayed(g.id, e.target.checked);
                        if (e.target.checked) void loadGroup(g.id);
                      }}
                    />
                    <span className="satlist__name">{g.name}</span>
                    <span className="satlist__meta">
                      {state?.status === 'loading' && 'loading…'}
                      {state?.status === 'error' && <span className="panel__hint--warn">failed</span>}
                      {count !== undefined && `${count}`}
                      {count === undefined && state?.status !== 'loading' && state?.status !== 'error' && `~${g.approxCount}`}
                    </span>
                  </label>
                  {state?.error && displayed && <p className="panel__hint panel__hint--warn">{state.error}</p>}
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}
