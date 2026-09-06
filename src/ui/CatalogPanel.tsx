import { useMemo, useState } from 'react';
import { CATALOG_GROUPS } from '../core/catalog/groups';
import { ISRAEL_GROUP_ID, useCatalog } from '../state/catalog';
import { useSelection } from '../state/selection';
import { useSettings } from '../state/settings';
import { Panel } from './Panel';
import { formatAgeSince } from './format';

const SEARCH_LIMIT = 30;
const GROUP_ROWS: { id: string; name: string; approxCount: number; hint?: string }[] = [
  {
    id: ISRAEL_GROUP_ID,
    name: 'Israeli satellites',
    approxCount: 15,
    hint: 'A name-based filter (OFEQ, AMOS, EROS, TECSAR, …) over the full active catalogue, so the first load downloads all ~12,000 objects (a few MB).',
  },
  ...CATALOG_GROUPS,
];

export function CatalogPanel() {
  const groups = useCatalog((s) => s.groups);
  const workerError = useCatalog((s) => s.workerError);
  const pointStats = useCatalog((s) => s.pointStats);
  const loadGroup = useCatalog((s) => s.loadGroup);
  const search = useCatalog((s) => s.search);
  const displayedGroups = useSettings((s) => s.displayedGroups);
  const favorites = useSettings((s) => s.favorites);
  const setGroupDisplayed = useSettings((s) => s.setGroupDisplayed);
  const select = useSelection((s) => s.select);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  // `groups`/`favorites` are dependencies so results refresh as groups finish loading or pins change.
  const results = useMemo(() => (query.trim() ? search(query, SEARCH_LIMIT) : []), [query, search, groups, favorites]);
  const loadedCount = Object.values(groups).filter((g) => g.status === 'ready').length;
  const truncated = pointStats && pointStats.shown + pointStats.rejected < pointStats.total;

  return (
    <Panel
      id="catalog"
      testId="catalog"
      title="Catalogue"
      actions={
        <button
          type="button"
          className="link"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          title="Choose which CelesTrak groups to download and draw on the globe"
        >
          {open ? 'hide groups' : 'groups'}
        </button>
      }
    >
      <input
        className="input input--wide"
        type="search"
        placeholder="Search name or NORAD id…"
        aria-label="Search satellites"
        title="Searches the ISI satellites, pinned satellites and every loaded group"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() && (
        <ul className="satlist" data-testid="search-results">
          {results.length === 0 && (
            <li className="panel__hint">
              {loadedCount === 0 ? (
                <>
                  No match.{' '}
                  <button type="button" className="link" onClick={() => setOpen(true)}>
                    Load a catalogue group
                  </button>{' '}
                  to search it.
                </>
              ) : (
                'No match in the loaded groups.'
              )}
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
          {results.length >= SEARCH_LIMIT && (
            <li className="panel__hint">First {SEARCH_LIMIT} matches shown. Narrow the search to find others.</li>
          )}
        </ul>
      )}
      {workerError && (
        <p className="panel__hint panel__hint--warn" role="alert" data-testid="catalog-worker-error">
          Catalogue points are not shown: {workerError}
        </p>
      )}
      {truncated && (
        <p className="panel__hint panel__hint--warn" data-testid="catalog-truncated">
          Showing {pointStats.shown.toLocaleString()} of {pointStats.total.toLocaleString()} satellites. Raise the points limit in
          Settings to see them all.
        </p>
      )}
      {(open || displayedGroups.length > 0) && (
        <ul className="groups" data-testid="groups">
          {[...(groups['fixture'] ? [{ id: 'fixture', name: groups['fixture'].name, approxCount: 300 }] : []), ...GROUP_ROWS]
            .filter((g) => open || displayedGroups.includes(g.id))
            .map((g) => {
              const state = groups[g.id];
              const displayed = displayedGroups.includes(g.id);
              const count = state?.status === 'ready' ? state.records.length : undefined;
              const staleWithError = state?.status === 'ready' && state.error;
              return (
                <li key={g.id} className="groups__row">
                  <label className="groups__label" title={g.hint}>
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
                      {state?.status === 'loading' && (g.id === ISRAEL_GROUP_ID ? 'loading active…' : 'loading…')}
                      {state?.status === 'error' && <span className="panel__hint--warn">failed</span>}
                      {count !== undefined && `${count}`}
                      {count === undefined && state?.status !== 'loading' && state?.status !== 'error' && `~${g.approxCount}`}
                    </span>
                  </label>
                  {state?.error && displayed && (
                    <p className="panel__hint panel__hint--warn">
                      {staleWithError
                        ? `Refresh failed: ${state.error}. Showing data saved ${state.fetchedAt ? formatAgeSince(state.fetchedAt) : 'earlier'}.`
                        : state.error}
                    </p>
                  )}
                </li>
              );
            })}
        </ul>
      )}
    </Panel>
  );
}
