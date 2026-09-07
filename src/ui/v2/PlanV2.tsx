import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ASTERIA_1_PROFILE, ASTERIA_1_SCENARIO, ASTERIA_1_TARGETS, ASTERIA_1_TLE } from '../../contracts';
import { evaluateImagingOpportunities, type EvaluatedOpportunity } from '../../core/scenario/planOpportunities';
import { tleToElementSet } from '../../core/tle/omm';
import { Pill } from './primitives/Pill';
import { Surface } from './primitives/Surface';

const SEARCH_DAYS = 30;

/**
 * Plan workspace, browse mode: lists real imaging opportunities for Asteria-1's target
 * (`evaluateImagingOpportunities` — genuine `findImagingOpportunities` output, each evaluated
 * against `checkRollLimit`/`checkImagingWindow`), so an operator can see actual access windows
 * and actual Validator findings, not a placeholder. Deliberately read-only: picking an opportunity
 * to build a real, committable plan needs a `CommandSubmitted`/plan data model this codebase
 * doesn't have yet (docs/design/operator-simulation.md) — that's later work, not guessed at here.
 */
export function PlanV2() {
  const { t } = useTranslation();
  const [loadError, setLoadError] = useState<string | null>(null);

  const evaluated = useMemo<EvaluatedOpportunity[]>(() => {
    try {
      const { satrec } = tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name);
      const [target] = ASTERIA_1_TARGETS;
      if (!target) throw new Error('Asteria-1 has no imaging targets configured');
      return evaluateImagingOpportunities(
        satrec,
        ASTERIA_1_PROFILE,
        target,
        new Date(ASTERIA_1_SCENARIO.startTime),
        SEARCH_DAYS,
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
      return [];
    }
  }, []);

  return (
    <div className="sl-plan">
      <header className="sl-plan__header">
        <h1>{t('plan.title')}</h1>
        <p className="sl-plan__disclaimer">{t('plan.disclaimer')}</p>
        <p className="sl-plan__note">{t('plan.note')}</p>
      </header>

      {loadError && (
        <p className="sl-plan__error" role="alert">
          {t('plan.loadError', { message: loadError })}
        </p>
      )}

      <Surface className="sl-plan__list-surface">
        {evaluated.length === 0 && !loadError ? (
          <p className="sl-plan__empty">{t('plan.empty')}</p>
        ) : (
          <ul className="sl-plan__list">
            {evaluated.map(({ opportunity, findings }) => {
              const blocked = findings.find((finding) => finding.severity === 'HardBlock');
              return (
                <li key={opportunity.start.toISOString()} className="sl-plan__row">
                  <div className="sl-plan__row-main">
                    <span className="sl-mono sl-tabular sl-plan__row-time">{opportunity.start.toISOString()}</span>
                    <span className="sl-plan__row-meta">
                      {t('plan.offNadir', { deg: opportunity.offNadirDeg.toFixed(1) })} ·{' '}
                      {opportunity.daylight ? t('plan.daylightYes') : t('plan.daylightNo')}
                    </span>
                  </div>
                  <div className="sl-plan__row-status">
                    <Pill tone={blocked ? 'critical' : 'nominal'}>{blocked ? blocked.code : t('plan.clean')}</Pill>
                    {blocked && <span className="sl-plan__row-reason">{blocked.message}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Surface>
    </div>
  );
}
