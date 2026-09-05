import { create } from 'zustand';
import type { ImagingOpportunity } from '../core/imaging/opportunities';
import type { Pass } from '../core/passes/predict';

/** Forecasts computed by the side panels for the selected satellite, shared with the timeline. */
interface ForecastState {
  passes: Pass[];
  opportunities: ImagingOpportunity[];
  setPasses(passes: Pass[]): void;
  setOpportunities(opportunities: ImagingOpportunity[]): void;
}

export const useForecast = create<ForecastState>()((set) => ({
  passes: [],
  opportunities: [],
  setPasses: (passes) => set({ passes }),
  setOpportunities: (opportunities) => set({ opportunities }),
}));
