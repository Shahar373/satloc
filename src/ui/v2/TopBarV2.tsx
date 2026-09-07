import { useEffect, useState } from 'react';
import { useViewerStore } from '../../state/viewer';
import { Icon } from './Icon';

function formatUtc(date: Date): string {
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 19)} UTC`;
}

/** Falls back to wall-clock time when no simulation clock is attached yet (no globe mounted). */
function useDisplayClock(): Date {
  const simTime = useViewerStore((s) => s.simTime);
  const [wallClock, setWallClock] = useState(() => new Date());
  useEffect(() => {
    if (simTime) return;
    const id = setInterval(() => setWallClock(new Date()), 1000);
    return () => clearInterval(id);
  }, [simTime]);
  return simTime ?? wallClock;
}

export function TopBarV2() {
  const clock = useDisplayClock();
  const multiplier = useViewerStore((s) => s.multiplier);

  return (
    <div className="sl-topbar">
      <div className="sl-topbar__brand">
        <span className="sl-topbar__mark" aria-hidden="true" />
        SatLoc
      </div>
      <button type="button" className="sl-topbar__cmdk">
        <Icon name="search" size={14} />
        <span>Jump to satellite, task, or command…</span>
        <kbd>⌘K</kbd>
      </button>
      <div className="sl-topbar__clock sl-mono sl-tabular">
        <span className="sl-bidi-isolate">{formatUtc(clock)}</span>
        {multiplier !== 1 && <span className="sl-topbar__rate"> · ×{multiplier}</span>}
      </div>
    </div>
  );
}
