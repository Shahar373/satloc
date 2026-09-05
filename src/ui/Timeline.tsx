import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { JulianDate } from 'cesium';
import { useForecast } from '../state/forecast';
import { useViewerStore } from '../state/viewer';
import { setSimulationTime } from '../viewer/createViewer';
import { computeTicks } from './timelineTicks';

const HOUR = 3_600_000;
const MIN_SPAN = 10 * 60_000;
const MAX_SPAN = 14 * 86_400_000;
const HEIGHT = 44;

interface Window {
  startMs: number;
  endMs: number;
}

/**
 * Our own timeline: drag or click to set the simulation time, wheel to zoom, follows the clock
 * when it leaves the visible window. Shows passes (yellow) and imaging opportunities (green) of
 * the selected satellite.
 */
export function Timeline() {
  const viewer = useViewerStore((s) => s.viewer);
  const simTime = useViewerStore((s) => s.simTime);
  const passes = useForecast((s) => s.passes);
  const opportunities = useForecast((s) => s.opportunities);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [window, setWindow] = useState<Window | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Follow the clock: initialise around it, and re-centre when it leaves the window.
  useEffect(() => {
    if (!simTime) return;
    const t = simTime.getTime();
    setWindow((w) => {
      if (!w) return { startMs: t - HOUR, endMs: t + 3 * HOUR };
      if (t >= w.startMs && t <= w.endMs) return w;
      const span = w.endMs - w.startMs;
      return { startMs: t - span * 0.25, endMs: t + span * 0.75 };
    });
  }, [simTime]);

  const xOf = useCallback(
    (ms: number) => (window ? ((ms - window.startMs) / (window.endMs - window.startMs)) * width : 0),
    [window, width],
  );
  const timeAt = useCallback(
    (x: number) => (window ? window.startMs + (x / width) * (window.endMs - window.startMs) : 0),
    [window, width],
  );

  const ticks = useMemo(() => (window && width > 0 ? computeTicks(window.startMs, window.endMs, width) : null), [window, width]);

  const scrubTo = (clientX: number) => {
    const el = containerRef.current;
    if (!el || !viewer || !window) return;
    const x = Math.max(0, Math.min(width, clientX - el.getBoundingClientRect().left));
    setSimulationTime(viewer, JulianDate.fromDate(new Date(timeAt(x))));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubTo(e.clientX);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current) scrubTo(e.clientX);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (!window || width === 0) return;
    const el = containerRef.current;
    if (!el) return;
    const x = e.clientX - el.getBoundingClientRect().left;
    const pivot = timeAt(x);
    const factor = e.deltaY > 0 ? 1.25 : 0.8;
    const span = Math.max(MIN_SPAN, Math.min(MAX_SPAN, (window.endMs - window.startMs) * factor));
    const frac = x / width;
    setWindow({ startMs: pivot - span * frac, endMs: pivot + span * (1 - frac) });
  };

  const nowX = simTime ? xOf(simTime.getTime()) : null;

  return (
    <div
      ref={containerRef}
      className="timeline"
      data-testid="timeline"
      role="slider"
      aria-label="Simulation time"
      aria-valuetext={simTime ? simTime.toISOString() : ''}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      {window && width > 0 && ticks && (
        <svg width={width} height={HEIGHT} className="timeline__svg">
          {/* pass windows and imaging opportunities */}
          {passes.map((p) => (
            <rect
              key={`p${p.aos.getTime()}`}
              x={xOf(p.aos.getTime())}
              y={26}
              width={Math.max(2, xOf(p.los.getTime()) - xOf(p.aos.getTime()))}
              height={6}
              className="timeline__pass"
            >
              <title>{`Pass ${p.aos.toISOString().slice(11, 16)}–${p.los.toISOString().slice(11, 16)} UTC, max ${p.maxElevationDeg.toFixed(0)}°`}</title>
            </rect>
          ))}
          {opportunities.map((o) => (
            <rect
              key={`o${o.time.getTime()}`}
              x={xOf(o.start.getTime())}
              y={34}
              width={Math.max(2, xOf(o.end.getTime()) - xOf(o.start.getTime()))}
              height={6}
              className={`timeline__opportunity${o.daylight ? '' : ' timeline__opportunity--night'}`}
            >
              <title>{`Imaging ${o.time.toISOString().slice(11, 16)} UTC, roll ${o.offNadirDeg.toFixed(0)}°, ${o.daylight ? 'daylight' : 'night'}`}</title>
            </rect>
          ))}
          {/* ticks */}
          {ticks.ticks.map((t) => (
            <g key={t.timeMs} transform={`translate(${xOf(t.timeMs)},0)`}>
              <line y1={t.major ? 0 : 6} y2={24} className={`timeline__tick${t.major ? ' timeline__tick--major' : ''}`} />
              <text y={20} x={3} className="timeline__label">
                {t.label}
              </text>
            </g>
          ))}
          {/* current time */}
          {nowX !== null && (
            <g transform={`translate(${nowX},0)`}>
              <line y1={0} y2={HEIGHT} className="timeline__needle" />
              <polygon points="-5,0 5,0 0,6" className="timeline__needle-head" />
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
