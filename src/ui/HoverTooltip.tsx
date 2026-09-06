import { useHover } from '../state/hover';

/** Name and NORAD id of the catalogue point under the pointer. Its own component so pointer moves re-render only this. */
export function HoverTooltip() {
  const hover = useHover((s) => s.hover);
  if (!hover) return null;
  return (
    <div className="tooltip" style={{ left: hover.x + 12, top: hover.y + 12 }} data-testid="tooltip">
      {hover.name} <span className="topbar__dim">{hover.noradId}</span>
    </div>
  );
}
