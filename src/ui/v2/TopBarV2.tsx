import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

export interface TopBarV2Props {
  onOpenPalette: () => void;
  /** Opens the Rail as a drawer below the 1200px breakpoint (see shell.css's media query and
   *  RailV2Props.drawerOpen) — the button itself is CSS-hidden above the breakpoint. */
  onOpenRailDrawer: () => void;
}

export function TopBarV2({ onOpenPalette, onOpenRailDrawer }: TopBarV2Props) {
  const clock = useDisplayClock();
  const multiplier = useViewerStore((s) => s.multiplier);
  const { t, i18n } = useTranslation();

  return (
    <div className="sl-topbar">
      <button type="button" className="sl-topbar__menu" onClick={onOpenRailDrawer} aria-label={t('rail.label')}>
        <Icon name="menu" size={18} />
      </button>
      <div className="sl-topbar__brand">
        <span className="sl-topbar__mark" aria-hidden="true" />
        SatLoc
      </div>
      <button type="button" className="sl-topbar__cmdk" onClick={onOpenPalette}>
        <Icon name="search" size={14} />
        <span>{t('topbar.searchPlaceholder')}</span>
        <kbd>⌘K</kbd>
      </button>
      <div className="sl-topbar__clock sl-mono sl-tabular">
        <span className="sl-bidi-isolate">{formatUtc(clock)}</span>
        {multiplier !== 1 && <span className="sl-topbar__rate"> · ×{multiplier}</span>}
      </div>
      <button
        type="button"
        className="sl-topbar__lang"
        onClick={() => void i18n.changeLanguage(i18n.language === 'he' ? 'en' : 'he')}
      >
        {t('topbar.switchLanguage')}
      </button>
    </div>
  );
}
