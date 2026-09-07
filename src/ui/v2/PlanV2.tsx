import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ASTERIA_1_PROFILE, ASTERIA_1_SCENARIO, ASTERIA_1_TARGETS, ASTERIA_1_TLE } from '../../contracts';
import { usableStorageGB } from '../../contracts/domain';
import { evaluateImagingOpportunities, type EvaluatedOpportunity } from '../../core/scenario/planOpportunities';
import { evaluatePlanDraft, type ImagingPlanCandidate } from '../../core/scenario/planDraft';
import { tleToElementSet } from '../../core/tle/omm';
import { Button } from './primitives/Button';
import { Pill } from './primitives/Pill';
import { Surface } from './primitives/Surface';

const SEARCH_DAYS = 30;

/**
 * Plan workspace: real imaging opportunities for Asteria-1's target (`evaluateImagingOpportunities`
 * — genuine `findImagingOpportunities` output, each evaluated against `checkRollLimit`/
 * `checkImagingWindow`) that an operator can add to an ordered draft plan. The draft itself is
 * evaluated with `evaluatePlanDraft` (PR #44) — the first real multi-candidate use of the
 * Validator rules, so storage accumulates across the whole sequence via the real `TruthState`
 * fold rather than each candidate being checked in isolation.
 *
 * Still short of a real, committable plan (docs/design/operator-simulation.md): there's no
 * `CommandSubmitted`/plan data model or commit flow yet, so adding/removing candidates here is
 * local component state, not anything recorded to an event log. Imaging-only, same as
 * `evaluatePlanDraft` itself — no downlink candidates.
 */
export function PlanV2() {
  const { t } = useTranslation();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftIds, setDraftIds] = useState<string[]>([]);

  const context = useMemo<{ evaluated: EvaluatedOpportunity[]; targetId: string | null }>(() => {
    try {
      const { satrec } = tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name);
      const [target] = ASTERIA_1_TARGETS;
      if (!target) throw new Error('Asteria-1 has no imaging targets configured');
      const evaluated = evaluateImagingOpportunities(
        satrec,
        ASTERIA_1_PROFILE,
        target,
        new Date(ASTERIA_1_SCENARIO.startTime),
        SEARCH_DAYS,
      );
      return { evaluated, targetId: target.id };
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
      return { evaluated: [], targetId: null };
    }
  }, []);
  const { evaluated, targetId } = context;

  const opportunityById = useMemo(() => {
    const map = new Map<string, EvaluatedOpportunity>();
    for (const item of evaluated) map.set(item.opportunity.start.toISOString(), item);
    return map;
  }, [evaluated]);

  const draftCandidates = useMemo<ImagingPlanCandidate[]>(() => {
    if (targetId === null) return [];
    const candidates: ImagingPlanCandidate[] = [];
    for (const id of draftIds) {
      const item = opportunityById.get(id);
      if (!item) continue;
      candidates.push({ kind: 'imaging', id, targetId, opportunity: item.opportunity, mode: 'PAN' });
    }
    return candidates;
  }, [draftIds, opportunityById, targetId]);

  const draftEvaluated = useMemo(() => evaluatePlanDraft(ASTERIA_1_PROFILE, draftCandidates), [draftCandidates]);

  const toggleDraft = (id: string) => {
    setDraftIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]));
  };

  const totalStorageGB = usableStorageGB(ASTERIA_1_PROFILE);
  const usedStorageGB = draftEvaluated.at(-1)?.cumulativeStorageUsedGB ?? 0;

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
              const id = opportunity.start.toISOString();
              const blocked = findings.find((finding) => finding.severity === 'HardBlock');
              const inDraft = draftIds.includes(id);
              return (
                <li key={id} className="sl-plan__row">
                  <div className="sl-plan__row-main">
                    <span className="sl-mono sl-tabular sl-plan__row-time">{id}</span>
                    <span className="sl-plan__row-meta">
                      {t('plan.offNadir', { deg: opportunity.offNadirDeg.toFixed(1) })} ·{' '}
                      {opportunity.daylight ? t('plan.daylightYes') : t('plan.daylightNo')}
                    </span>
                  </div>
                  <div className="sl-plan__row-status">
                    <Pill tone={blocked ? 'critical' : 'nominal'}>{blocked ? blocked.code : t('plan.clean')}</Pill>
                    {blocked && <span className="sl-plan__row-reason">{blocked.message}</span>}
                    <Button variant={inDraft ? 'default' : 'ghost'} onClick={() => toggleDraft(id)}>
                      {inDraft ? t('plan.removeFromDraft') : t('plan.addToDraft')}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Surface>

      <Surface className="sl-plan__draft-surface">
        <div className="sl-plan__draft-header">
          <h2>{t('plan.draftTitle')}</h2>
          <span className="sl-mono sl-tabular sl-plan__draft-storage">
            {t('plan.storageUsed', { used: usedStorageGB.toFixed(1), total: totalStorageGB.toFixed(1) })}
          </span>
        </div>
        {draftEvaluated.length === 0 ? (
          <p className="sl-plan__empty">{t('plan.draftEmpty')}</p>
        ) : (
          <ul className="sl-plan__list">
            {draftEvaluated.map(({ candidate, findings, cumulativeStorageUsedGB }, index) => {
              // PlanV2 only ever builds imaging candidates today (see draftCandidates above) — no
              // downlink-candidate selection UI exists yet — so this narrows evaluatePlanDraft's
              // general PlanCandidate union back down for the imaging-specific fields below.
              if (candidate.kind !== 'imaging') return null;
              const blocked = findings.find((finding) => finding.severity === 'HardBlock');
              return (
                <li key={candidate.id} className="sl-plan__row">
                  <div className="sl-plan__row-main">
                    <span className="sl-plan__row-seq">
                      <span className="sl-bidi-isolate">#{index + 1}</span>
                    </span>
                    <span className="sl-mono sl-tabular sl-plan__row-time">
                      {candidate.opportunity.start.toISOString()}
                    </span>
                    <span className="sl-mono sl-tabular sl-plan__row-meta">
                      {t('plan.storageUsed', {
                        used: cumulativeStorageUsedGB.toFixed(1),
                        total: totalStorageGB.toFixed(1),
                      })}
                    </span>
                  </div>
                  <div className="sl-plan__row-status">
                    <Pill tone={blocked ? 'critical' : 'nominal'}>{blocked ? blocked.code : t('plan.clean')}</Pill>
                    {blocked && <span className="sl-plan__row-reason">{blocked.message}</span>}
                    <Button variant="ghost" onClick={() => toggleDraft(candidate.id)}>
                      {t('plan.removeFromDraft')}
                    </Button>
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
