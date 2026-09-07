import { useTranslation } from 'react-i18next';
import { useCatalog } from '../../state/catalog';
import { useSelection } from '../../state/selection';
import { useLiveOrbit } from '../useLiveOrbit';
import { Icon } from './Icon';
import { Field } from './primitives/Field';
import { Switch } from './primitives/Switch';

function fmt(value: number, digits: number, unit: string): string {
  return Number.isFinite(value) ? `${value.toFixed(digits)} ${unit}` : '—';
}

export interface InspectorV2Props {
  /** Whether the Inspector is shown as an on-demand drawer below the 1200px breakpoint — see
   *  RailV2Props.drawerOpen for the same convention (harmless above the breakpoint). */
  drawerOpen?: boolean;
  /** Closes the drawer. Ignored above the breakpoint. */
  onCloseDrawer?: () => void;
}

/**
 * Persistent right panel above 1200px (Variant A's always-visible Inspector); an on-demand
 * drawer below it, opened automatically on selection (see AppV2) — real selection/telemetry
 * data either way.
 */
export function InspectorV2({ drawerOpen = false, onCloseDrawer }: InspectorV2Props) {
  const { t } = useTranslation();
  const selectedId = useSelection((s) => s.selectedId);
  const sets = useCatalog((s) => s.sets);
  const selected = selectedId == null ? undefined : sets.find((s) => s.noradId === selectedId);
  const orbit = useLiveOrbit(selected);

  const showOrbit = useSelection((s) => s.showOrbit);
  const showGroundTrack = useSelection((s) => s.showGroundTrack);
  const showFootprint = useSelection((s) => s.showFootprint);
  const toggleOrbit = useSelection((s) => s.toggleOrbit);
  const toggleGroundTrack = useSelection((s) => s.toggleGroundTrack);
  const toggleFootprint = useSelection((s) => s.toggleFootprint);

  if (!selected) {
    return (
      <aside className="sl-inspector sl-inspector--empty" aria-label={t('inspector.label')} data-open={drawerOpen}>
        {t('inspector.empty')}
      </aside>
    );
  }

  return (
    <aside className="sl-inspector" aria-label={t('inspector.label')} data-open={drawerOpen}>
      <button
        type="button"
        className="sl-inspector__drawer-close"
        onClick={onCloseDrawer}
        aria-label={t('palette.close')}
      >
        <Icon name="close" size={16} />
      </button>
      <h2 className="sl-inspector__title">{selected.name}</h2>
      <div className="sl-inspector__sub sl-mono">
        {t('inspector.norad')} <span className="sl-bidi-isolate">{selected.noradId}</span>
      </div>
      <div className="sl-inspector__grid">
        <Field label={t('inspector.altitude')}>{orbit ? fmt(orbit.altitudeKm, 1, 'km') : '—'}</Field>
        <Field label={t('inspector.velocity')}>{orbit ? fmt(orbit.speedKmS, 2, 'km/s') : '—'}</Field>
        <Field label={t('inspector.latitude')}>{orbit ? fmt(orbit.latitudeDeg, 2, '°') : '—'}</Field>
        <Field label={t('inspector.longitude')}>{orbit ? fmt(orbit.longitudeDeg, 2, '°') : '—'}</Field>
        <Field label={t('inspector.period')}>{orbit ? fmt(orbit.periodMin, 1, 'min') : '—'}</Field>
        <Field label={t('inspector.elementsAge')}>{orbit ? fmt(orbit.elementAgeDays, 1, 'd') : '—'}</Field>
      </div>
      <div className="sl-inspector__section-title">{t('inspector.display')}</div>
      <div className="sl-inspector__toggle-row">
        <span>{t('inspector.orbitPath')}</span>
        <Switch checked={showOrbit} onChange={toggleOrbit} label={t('inspector.orbitPath')} />
      </div>
      <div className="sl-inspector__toggle-row">
        <span>{t('inspector.groundTrack')}</span>
        <Switch checked={showGroundTrack} onChange={toggleGroundTrack} label={t('inspector.groundTrack')} />
      </div>
      <div className="sl-inspector__toggle-row">
        <span>{t('inspector.footprint')}</span>
        <Switch checked={showFootprint} onChange={toggleFootprint} label={t('inspector.footprint')} />
      </div>
    </aside>
  );
}
