import { useCatalog } from '../../state/catalog';
import { useSelection } from '../../state/selection';
import { useLiveOrbit } from '../useLiveOrbit';
import { Field } from './primitives/Field';
import { Switch } from './primitives/Switch';

function fmt(value: number, digits: number, unit: string): string {
  return Number.isFinite(value) ? `${value.toFixed(digits)} ${unit}` : '—';
}

/** Always-visible right panel (Variant A's persistent Inspector) — real selection/telemetry data. */
export function InspectorV2() {
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
      <aside className="sl-inspector sl-inspector--empty" aria-label="Inspector">
        Select a satellite to see its details.
      </aside>
    );
  }

  return (
    <aside className="sl-inspector" aria-label="Inspector">
      <h2 className="sl-inspector__title">{selected.name}</h2>
      <div className="sl-inspector__sub sl-mono">
        NORAD <span className="sl-bidi-isolate">{selected.noradId}</span>
      </div>
      <div className="sl-inspector__grid">
        <Field label="Altitude">{orbit ? fmt(orbit.altitudeKm, 1, 'km') : '—'}</Field>
        <Field label="Velocity">{orbit ? fmt(orbit.speedKmS, 2, 'km/s') : '—'}</Field>
        <Field label="Latitude">{orbit ? fmt(orbit.latitudeDeg, 2, '°') : '—'}</Field>
        <Field label="Longitude">{orbit ? fmt(orbit.longitudeDeg, 2, '°') : '—'}</Field>
        <Field label="Period">{orbit ? fmt(orbit.periodMin, 1, 'min') : '—'}</Field>
        <Field label="Elements age">{orbit ? fmt(orbit.elementAgeDays, 1, 'd') : '—'}</Field>
      </div>
      <div className="sl-inspector__section-title">Display</div>
      <div className="sl-inspector__toggle-row">
        <span>Orbit path</span>
        <Switch checked={showOrbit} onChange={toggleOrbit} label="Show orbit path" />
      </div>
      <div className="sl-inspector__toggle-row">
        <span>Ground track</span>
        <Switch checked={showGroundTrack} onChange={toggleGroundTrack} label="Show ground track" />
      </div>
      <div className="sl-inspector__toggle-row">
        <span>Footprint</span>
        <Switch checked={showFootprint} onChange={toggleFootprint} label="Show footprint" />
      </div>
    </aside>
  );
}
