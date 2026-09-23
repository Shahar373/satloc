import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewerStore } from '../../state/viewer';
import { useSelection } from '../../state/selection';
import { flyHome, jumpToInstant, jumpToNow } from '../../viewer/createViewer';
import { Button } from './primitives/Button';
import { Icon } from './Icon';

/** Controls the actual Cesium clock; Explore and the fictional training clock remain separate. */
export function ExploreControlsV2() {
  const { t } = useTranslation();
  const viewer = useViewerStore((s) => s.viewer);
  const animating = useViewerStore((s) => s.animating);
  const multiplier = useViewerStore((s) => s.multiplier);
  const [timeInput, setTimeInput] = useState('');
  const time = new Date(`${timeInput}Z`);

  return (
    <div className="sl-explore-controls" role="group" aria-label={t('explore.controls')}>
      <Button
        disabled={!viewer}
        onClick={() => {
          if (viewer) viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate;
        }}
        data-testid="explore-play"
      >
        <Icon name={animating ? 'pause' : 'play'} size={14} />
        {t(animating ? 'train.pause' : 'train.play')}
      </Button>
      <label className="sl-explore-controls__rate">
        {t('train.rate')}
        <select
          value={multiplier}
          disabled={!viewer}
          onChange={(event) => {
            if (viewer) viewer.clock.multiplier = Number(event.target.value);
          }}
        >
          {[-60, -1, 1, 10, 60, 300, 1000].map((rate) => (
            <option key={rate} value={rate}>
              ×{rate}
            </option>
          ))}
        </select>
      </label>
      <Button
        disabled={!viewer}
        onClick={() => {
          if (viewer) jumpToNow(viewer);
        }}
      >
        {t('explore.now')}
      </Button>
      <label className="sl-explore-controls__date">
        UTC
        <input
          type="datetime-local"
          aria-label={t('explore.utc')}
          value={timeInput}
          onChange={(event) => setTimeInput(event.target.value)}
        />
      </label>
      <Button
        disabled={!viewer || !Number.isFinite(time.getTime())}
        onClick={() => {
          if (viewer) jumpToInstant(viewer, time);
        }}
      >
        {t('explore.go')}
      </Button>
      <Button
        variant="ghost"
        disabled={!viewer}
        onClick={() => {
          if (viewer) {
            useSelection.getState().setCameraMode('free');
            flyHome(viewer);
          }
        }}
      >
        {t('explore.home')}
      </Button>
    </div>
  );
}
