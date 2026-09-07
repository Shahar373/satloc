/// <reference lib="webworker" />
import { findImagingOpportunities } from '../core/imaging/opportunities';
import { predictPasses } from '../core/passes/predict';
import { ommToElementSet, tleToElementSet } from '../core/tle/omm';
import type { ElementSetInput, ForecastRequest, ForecastResponse } from './forecastProtocol';

function buildSatrec(element: ElementSetInput) {
  return element.source === 'omm'
    ? ommToElementSet(element.record).satrec
    : tleToElementSet(element.tle.line1, element.tle.line2, element.tle.name).satrec;
}

self.onmessage = (event: MessageEvent<ForecastRequest>) => {
  const req = event.data;
  try {
    const satrec = buildSatrec(req.element);
    if (req.type === 'passes') {
      const passes = predictPasses(satrec, req.observer, new Date(req.startMs), req.hours, req.options);
      const message: ForecastResponse = { type: 'passes', requestId: req.requestId, passes };
      self.postMessage(message);
    } else {
      const opportunities = findImagingOpportunities(satrec, req.target, new Date(req.startMs), req.days, req.options);
      const message: ForecastResponse = { type: 'imaging', requestId: req.requestId, opportunities };
      self.postMessage(message);
    }
  } catch (err) {
    const message: ForecastResponse = {
      type: 'error',
      requestId: req.requestId,
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(message);
  }
};
