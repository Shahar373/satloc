import type { TleRecord } from '../core/catalog/tleapi';
import type { TargetPoint } from '../core/imaging/geometry';
import type { ImagingOpportunity, ImagingOptions } from '../core/imaging/opportunities';
import type { Observer, Pass, PredictOptions } from '../core/passes/predict';
import type { OmmRecord } from '../core/tle/omm';

/** How to reconstruct the SatRec inside the worker — mirrors propagation.worker.ts's LoadMessage inputs. */
export type ElementSetInput = { source: 'omm'; record: OmmRecord } | { source: 'tle'; tle: TleRecord };

export interface PassesForecastRequest {
  type: 'passes';
  requestId: number;
  element: ElementSetInput;
  observer: Observer;
  startMs: number;
  hours?: number;
  options?: PredictOptions;
}

export interface ImagingForecastRequest {
  type: 'imaging';
  requestId: number;
  element: ElementSetInput;
  target: TargetPoint;
  startMs: number;
  days?: number;
  options?: ImagingOptions;
}

export type ForecastRequest = PassesForecastRequest | ImagingForecastRequest;

export interface PassesForecastResult {
  type: 'passes';
  requestId: number;
  passes: Pass[];
}

export interface ImagingForecastResult {
  type: 'imaging';
  requestId: number;
  opportunities: ImagingOpportunity[];
}

export interface ForecastErrorResult {
  type: 'error';
  requestId: number;
  message: string;
}

export type ForecastResponse = PassesForecastResult | ImagingForecastResult | ForecastErrorResult;
