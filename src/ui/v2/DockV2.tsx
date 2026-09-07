import { useCatalog } from '../../state/catalog';
import { useSelection } from '../../state/selection';
import type { WorkspaceId } from './RailV2';

export interface DockV2Props {
  workspace: WorkspaceId;
}

/**
 * Bottom Dock. Shows the real, clickable satellite catalog (selection is wired to the same
 * state the rest of the app uses). No timeline scrubber yet — that needs a Cesium clock
 * attached, which lands with Explore workspace wiring (see AppV2.tsx's globe placeholder note).
 */
export function DockV2({ workspace }: DockV2Props) {
  const sets = useCatalog((s) => s.sets);
  const selectedId = useSelection((s) => s.selectedId);
  const select = useSelection((s) => s.select);

  if (workspace !== 'explore') {
    return <div className="sl-dock sl-dock--empty" />;
  }

  return (
    <div className="sl-dock">
      <div className="sl-dock__title">Catalog ({sets.length})</div>
      <table className="sl-dock__table">
        <tbody>
          {sets.map((set) => (
            <tr
              key={set.noradId}
              className={set.noradId === selectedId ? 'sl-dock__row sl-dock__row--selected' : 'sl-dock__row'}
              onClick={() => select(set.noradId)}
            >
              <td className="sl-dock__row-name">{set.name}</td>
              <td className="sl-mono sl-tabular">{set.noradId}</td>
              <td className="sl-mono sl-tabular">{set.inclinationDeg.toFixed(1)}°</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
