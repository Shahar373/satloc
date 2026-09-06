import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { JulianDate } from 'cesium';
import { useForecast } from '../state/forecast';
import { useViewerStore } from '../state/viewer';
import { jumpToNow, setSimulationTime } from '../viewer/createViewer';
import { computeTicks } from './timelineTicks';

const HOUR = 3_600_000;
const MINUTE = 60_000;
const MIN_SPAN = 10 * MINUTE;
const MAX_SPAN = 14 * 86_400_000;
const HEIGHT = 44;

interface Window {
  startMs: number;
  endMs: number;
}

/**
 * Our own timeline: drag or click to set the simulation time, wheel to zoom (horizontal wheel
 * pans), arrow keys to step; follows the clock when it leaves the visible window. Shows passes
 * (yellow) and imaging opportunities (green) of the selected satellite.
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

  const setTime = (ms: number) => {
    if (viewer) setSimulationTime(viewer, JulianDate.fromDate(new Date(ms)));
  };

  const scrubTo = (clientX: number) => {
    const el = containerRef.current;
    if (!el || !viewer || !window) return;
    const x = Math.max(0, Math.min(width, clientX - el.getBoundingClientRect().left));
    setTime(timeAt(x));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    scrubTo(e.clientX);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current) scrubTo(e.clientX);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (!window || width === 0) return;
    const el = containerRef.current;
    if (!el) return;
    const span = window.endMs - window.startMs;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      // Horizontal wheel / trackpad swipe pans the window instead of zooming.
      const shift = (e.deltaX / width) * span;
      setWindow({ startMs: window.startMs + shift, endMs: window.endMs + shift });
      return;
    }
    if (e.deltaY === 0) return;
    const x = e.clientX - el.getBoundingClientRect().left;
    const pivot = timeAt(x);
    const factor = e.deltaY > 0 ? 1.25 : 0.8;
    const next = Math.max(MIN_SPAN, Math.min(MAX_SPAN, span * factor));
    const frac = x / width;
    setWindow({ startMs: pivot - next * frac, endMs: pivot + next * (1 - frac) });
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!viewer || !simTime) return;
    const now = simTime.getTime();
    const step = e.shiftKey ? 10 * MINUTE : MINUTE;
    switch (e.key) {
      case 'ArrowLeft':
        setTime(now - step);
        break;
      case 'ArrowRight':
        setTime(now + step);
        break;
      case 'PageDown':
        setTime(now - HOUR);
        break;
      case 'PageUp':
        setTime(now + HOUR);
        break;
      case 'Home':
        jumpToNow(viewer);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const nowX = simTime ? xOf(simTime.getTime()) : null;

  return (
    <div
      ref={containerRef}
      className="timeline"
      data-testid="timeline"
      role="slider"
      tabIndex={0}
      aria-label="Simulation time"
      aria-valuetext={simTime ? simTime.toISOString() : ''}
      aria-valuemin={window ? Math.round(window.startMs / 1000) : undefined}
      aria-valuemax={window ? Math.round(window.endMs / 1000) : undefined}
      aria-valuenow={simTime ? Math.round(simTime.getTime() / 1000) : undefined}
      title="Timeline: click or drag to set the time · wheel to zoom · ← → step a minute (Shift: 10), PgUp/PgDn an hour, Home = now"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
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
      {(passes.length > 0 || opportunities.length > 0) && (
        <div className="timeline__legend" aria-hidden="true">
          {passes.length > 0 && (
            <span>
              <i className="timeline__swatch timeline__swatch--pass" /> passes
            </span>
          )}
          {opportunities.length > 0 && (
            <span>
              <i className="timeline__swatch timeline__swatch--imaging" /> imaging
            </span>
          )}
        </div>
      )}
    </div>
  );
}
