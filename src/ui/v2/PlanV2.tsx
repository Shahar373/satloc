import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ASTERIA_1_SCENARIO as scenario, downlinkGB, usableStorageGB } from '../../contracts';
import type { ImagingMode } from '../../contracts/domain';
import type { ValidationFinding } from '../../contracts/validation';
import {
  candidateStart,
  evaluateExecutablePlan,
  waiverKey,
  type ExecutableCandidate,
  type PlanWaiver,
} from '../../core/scenario/executablePlan';
import type { ImagingPlanCandidate } from '../../core/scenario/planDraft';
import { usePlanDraft } from '../../state/planDraft';
import { useTraining } from '../../state/training';
import { usePlanForecast } from './usePlanForecast';
import { Button } from './primitives/Button';
import { Pill } from './primitives/Pill';
import { Surface } from './primitives/Surface';

const utc = (date: Date) => `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`;

/** The complete capture → downlink → validated snapshot → Train handoff. */
export function PlanV2({ onTrain }: { onTrain: () => void }) {
  const { t } = useTranslation();
  const forecast = usePlanForecast();
  const draft = usePlanDraft();
  const hasRun = useTraining((s) => s.status !== 'idle');
  const loadPlan = useTraining((s) => s.loadPlan);
  const [tab, setTab] = useState<'imaging' | 'contacts'>('imaging');
  const [mode, setMode] = useState<ImagingMode>('PAN');
  const [visibleContacts, setVisibleContacts] = useState(20);
  const [confirmRevision, setConfirmRevision] = useState<number | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const confirming = hasRun && confirmRevision === draft.revision;

  const images = useMemo<ImagingPlanCandidate[]>(
    () =>
      forecast.imaging
        .filter((item) => draft.ids.includes(item.opportunity.start.toISOString()))
        .map((item) => ({
          kind: 'imaging',
          id: item.opportunity.start.toISOString(),
          targetId: scenario.targets[0].id,
          opportunity: item.opportunity,
          mode: draft.modes[item.opportunity.start.toISOString()] ?? 'PAN',
          elementSetAgeDays: 0, // The executable-plan validator derives age from the scenario TLE.
        })),
    [forecast.imaging, draft.ids, draft.modes],
  );
  const candidates = useMemo<ExecutableCandidate[]>(() => [...images, ...draft.downlinks], [images, draft.downlinks]);
  const validation = useMemo(() => evaluateExecutablePlan(scenario, candidates), [candidates]);
  const missingGeometry = images.length !== draft.ids.length;
  const acceptedWaivers: PlanWaiver[] = validation.warnings.flatMap(({ candidateId, finding }) => {
    const reason = draft.waivers[waiverKey(candidateId, finding.code)];
    return reason?.trim() ? [{ candidateId, code: finding.code, reason }] : [];
  });
  const ready =
    !forecast.loading &&
    !forecast.error &&
    !missingGeometry &&
    !validation.hardBlocked &&
    acceptedWaivers.length === validation.warnings.length;
  const assigned = new Set(draft.downlinks.flatMap((d) => d.dataProductCandidateIds));
  const contacts = forecast.contacts.flatMap((contact) => {
    const selected = draft.downlinks.find((d) => d.id === contact.id);
    const available = images.filter((image) => image.opportunity.end <= contact.pass.aos && !assigned.has(image.id));
    if (!selected && !available.length) return [];
    const candidate = selected ?? { ...contact, dataProductCandidateIds: available.map((image) => image.id) };
    const sizeGB = candidate.dataProductCandidateIds.reduce(
      (sum, id) => sum + scenario.satellite.storage.productGB[draft.modes[id] ?? 'PAN'],
      0,
    );
    return [{ candidate, selected: !!selected, sizeGB, capacityGB: downlinkGB(scenario.satellite, contact.durationS) }];
  });
  const totalStorageGB = usableStorageGB(scenario.satellite);
  const findingLabel = (f: ValidationFinding) => t(`plan.findings.${f.code}`, { defaultValue: f.message });
  const taskLabel = (c: ExecutableCandidate) =>
    c.kind === 'imaging'
      ? t('plan.captureLabel', { mode: c.mode })
      : t('plan.downlinkLabel', {
          station: scenario.groundStations.find((s) => s.id === c.stationId)?.name ?? c.stationId,
        });

  const commit = () => {
    if (!ready) return;
    if (hasRun && !confirming) {
      setConfirmRevision(draft.revision);
      return;
    }
    try {
      setCommitError(null);
      loadPlan(candidates, acceptedWaivers);
      onTrain();
    } catch (error) {
      setCommitError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="sl-plan">
      <header className="sl-plan__header">
        <h1>{t('plan.title')}</h1>
        <p className="sl-plan__disclaimer">{t('plan.disclaimer')}</p>
        <p className="sl-plan__note">{t('plan.note')}</p>
      </header>
      {forecast.error && (
        <p className="sl-plan__error" role="alert">
          {t('plan.loadError', { message: forecast.error })}
        </p>
      )}
      <div className="sl-plan__columns">
        <Surface className="sl-plan__list-surface">
          <div className="sl-plan__tabs" role="group" aria-label={t('plan.browse')}>
            <Button
              variant={tab === 'imaging' ? 'primary' : 'ghost'}
              aria-pressed={tab === 'imaging'}
              onClick={() => setTab('imaging')}
            >
              {t('plan.captures')}
            </Button>
            <Button
              variant={tab === 'contacts' ? 'primary' : 'ghost'}
              aria-pressed={tab === 'contacts'}
              onClick={() => setTab('contacts')}
            >
              {t('plan.contacts')}
            </Button>
          </div>
          {forecast.loading ? (
            <p role="status">{t('plan.loading')}</p>
          ) : tab === 'imaging' ? (
            <>
              <div className="sl-plan__toolbar">
                <h2>{t('plan.opportunities', { count: forecast.imaging.length })}</h2>
                <label>
                  {t('plan.mode')}{' '}
                  <select
                    className="sl-plan__input"
                    aria-label={t('plan.mode')}
                    value={mode}
                    onChange={(e) => setMode(e.target.value as ImagingMode)}
                  >
                    <option value="PAN">PAN · 1.2 GB</option>
                    <option value="MS">MS · 0.4 GB</option>
                  </select>
                </label>
              </div>
              {!forecast.imaging.length && !forecast.error && <p className="sl-plan__empty">{t('plan.empty')}</p>}
              <ul className="sl-plan__list">
                {forecast.imaging.map(({ opportunity, findings }) => {
                  const id = opportunity.start.toISOString();
                  const inDraft = draft.ids.includes(id);
                  const headline = findings.find((f) => f.severity === 'HardBlock') ?? findings[0];
                  return (
                    <li key={id} className="sl-plan__row" data-testid="imaging-opportunity">
                      <div className="sl-plan__row-main">
                        <span className="sl-mono sl-tabular sl-plan__row-time">{utc(opportunity.time)}</span>
                        <span className="sl-plan__row-meta">
                          {t('plan.offNadir', { deg: opportunity.offNadirDeg.toFixed(1) })} ·{' '}
                          {t('plan.sunElevation', { deg: opportunity.sunElevationDeg.toFixed(1) })}
                        </span>
                        {inDraft && <span>{t('plan.captureLabel', { mode: draft.modes[id] })}</span>}
                      </div>
                      <div className="sl-plan__row-status">
                        <Pill tone={!headline ? 'nominal' : headline.severity === 'HardBlock' ? 'critical' : 'warning'}>
                          {headline ? findingLabel(headline) : t('plan.clean')}
                        </Pill>
                        <Button
                          variant={inDraft ? 'default' : 'ghost'}
                          disabled={!inDraft && findings.some((f) => f.severity === 'HardBlock')}
                          onClick={() => draft.toggle(id, mode)}
                        >
                          {t(inDraft ? 'plan.removeFromDraft' : 'plan.addToDraft')}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <>
              <h2>{t('plan.contacts')}</h2>
              <p className="sl-plan__note">{t('plan.contactHint')}</p>
              {!contacts.length && <p className="sl-plan__empty">{t('plan.noContacts')}</p>}
              <ul className="sl-plan__list">
                {contacts.slice(0, visibleContacts).map(({ candidate, selected, sizeGB, capacityGB }) => (
                  <li key={candidate.id} className="sl-plan__row" data-testid="contact-opportunity">
                    <div className="sl-plan__row-main">
                      <strong>{taskLabel(candidate)}</strong>
                      <span className="sl-mono sl-tabular sl-plan__row-time">{utc(candidate.pass.aos)}</span>
                      <span className="sl-plan__row-meta">
                        {t('plan.contactDuration', {
                          seconds: candidate.durationS.toFixed(0),
                          deg: candidate.pass.maxElevationDeg.toFixed(0),
                        })}
                      </span>
                      <span className="sl-plan__row-meta">
                        {t('plan.contactLoad', {
                          count: candidate.dataProductCandidateIds.length,
                          used: sizeGB.toFixed(1),
                          capacity: capacityGB.toFixed(2),
                        })}
                      </span>
                    </div>
                    <div className="sl-plan__row-status">
                      <Pill tone={sizeGB <= capacityGB ? 'nominal' : 'critical'}>
                        {t(sizeGB <= capacityGB ? 'plan.capacityFits' : 'plan.capacityShort')}
                      </Pill>
                      <Button
                        disabled={!selected && sizeGB > capacityGB}
                        onClick={() => draft.toggleDownlink(candidate)}
                      >
                        {t(selected ? 'plan.removeFromDraft' : 'plan.addDownlink')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              {contacts.length > visibleContacts && (
                <Button onClick={() => setVisibleContacts((n) => n + 20)}>{t('plan.moreContacts')}</Button>
              )}
            </>
          )}
        </Surface>
        <Surface className="sl-plan__draft-surface">
          <div className="sl-plan__draft-header">
            <h2>{t('plan.draftTitle')}</h2>
            <Pill tone={ready ? 'nominal' : 'info'}>{t(ready ? 'plan.ready' : 'plan.needsReview')}</Pill>
          </div>
          <div className="sl-plan__summary">
            <span>{t('plan.peakStorage')}</span>
            <span className="sl-mono sl-tabular sl-plan__draft-storage">
              {t('plan.storageUsed', { used: validation.peakStorageGB.toFixed(1), total: totalStorageGB.toFixed(1) })}
            </span>
            <span>{t('plan.remainingStorage')}</span>
            <span className="sl-mono sl-tabular">{validation.remainingStorageGB.toFixed(1)} GB</span>
          </div>
          {forecast.loading ? (
            <p role="status">{t('plan.loading')}</p>
          ) : !validation.rows.length ? (
            <p className="sl-plan__empty">{t('plan.draftEmpty')}</p>
          ) : (
            <ul className="sl-plan__list">
              {validation.rows.map(({ candidate, findings }, index) => (
                <li key={candidate.id} className="sl-plan__row" data-testid="draft-task">
                  <div className="sl-plan__row-main">
                    <strong className="sl-plan__row-seq">
                      <span className="sl-bidi-isolate">#{index + 1}</span> · {taskLabel(candidate)}
                    </strong>
                    <span className="sl-mono sl-tabular sl-plan__row-time">{utc(candidateStart(candidate))}</span>
                    {candidate.kind === 'downlink' && (
                      <span className="sl-plan__row-meta">
                        {t('plan.assignedCaptures', {
                          numbers: candidate.dataProductCandidateIds
                            .map((id) => `#${validation.rows.findIndex((r) => r.candidate.id === id) + 1}`)
                            .join(', '),
                        })}
                      </span>
                    )}
                  </div>
                  <div className="sl-plan__row-status">
                    {findings.length === 0 && <Pill tone="nominal">{t('plan.clean')}</Pill>}
                    {findings.map((finding, i) => {
                      const key = waiverKey(candidate.id, finding.code);
                      const checked = draft.waivers[key] !== undefined;
                      return (
                        <div className="sl-plan__finding" key={`${finding.code}-${i}`}>
                          <Pill tone={finding.severity === 'HardBlock' ? 'critical' : 'warning'}>
                            {findingLabel(finding)}
                          </Pill>
                          {finding.severity === 'WaivableWarning' && (
                            <div className="sl-plan__waiver" data-testid="plan-waiver">
                              <p className="sl-plan__row-reason">{finding.message}</p>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => draft.setWaiver(key, e.target.checked ? '' : null)}
                                />{' '}
                                {t('plan.acceptWarning')}
                              </label>
                              {checked && (
                                <label>
                                  {t('plan.waiverReason')}
                                  <input
                                    className="sl-plan__input"
                                    value={draft.waivers[key]}
                                    onChange={(e) => draft.setWaiver(key, e.target.value)}
                                    maxLength={500}
                                  />
                                </label>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <Button
                      variant="ghost"
                      onClick={() =>
                        candidate.kind === 'imaging' ? draft.toggle(candidate.id) : draft.toggleDownlink(candidate)
                      }
                    >
                      {t('plan.removeFromDraft')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {missingGeometry && !forecast.loading && <p role="alert">{t('plan.missingGeometry')}</p>}
          {draft.ids.length > 0 && !draft.downlinks.length && (
            <Button onClick={() => setTab('contacts')}>{t('plan.chooseDownlink')}</Button>
          )}
          <div className="sl-plan__commit">
            {confirming && <p role="alert">{t('plan.replaceHint')}</p>}
            {commitError && (
              <p role="alert" className="sl-plan__error">
                {commitError}
              </p>
            )}
            <Button variant="primary" disabled={!ready} onClick={commit} data-testid="plan-commit">
              {t(confirming ? 'plan.confirmReplace' : 'plan.run')}
            </Button>
            {confirming && (
              <Button variant="ghost" onClick={() => setConfirmRevision(null)}>
                {t('train.cancel')}
              </Button>
            )}
            <p className="sl-plan__note">{t('plan.runHint')}</p>
          </div>
        </Surface>
      </div>
    </div>
  );
}
