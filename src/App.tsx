import { GlobeView } from './viewer/GlobeView';
import { ObserverLayer } from './viewer/ObserverLayer';
import { SatelliteLayerBridge } from './viewer/SatelliteLayerBridge';
import { TargetLayer } from './viewer/TargetLayer';
import { SettingsPanel } from './ui/SettingsPanel';
import { useKeyboardShortcuts } from './ui/useKeyboardShortcuts';
import { useEffect } from 'react';
import { isTauri } from './platform/env';
import { startAutoRefresh } from './state/catalog';
import { useUpdates } from './state/updates';
import { Sidebar } from './ui/Sidebar';
import { TopBar } from './ui/TopBar';

const UPDATE_CHECK_DELAY_MS = 8_000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function App() {
  useKeyboardShortcuts();
  useEffect(() => startAutoRefresh(), []);
  useEffect(() => {
    if (!isTauri()) return;
    const timer = setTimeout(() => void useUpdates.getState().check(), UPDATE_CHECK_DELAY_MS);
    const interval = setInterval(() => void useUpdates.getState().check(), UPDATE_CHECK_INTERVAL_MS);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);
  return (
    <div className="app">
      <TopBar />
      <div className="app__body">
        <Sidebar />
        <GlobeView />
        <SettingsPanel />
      </div>
      <SatelliteLayerBridge />
      <ObserverLayer />
      <TargetLayer />
    </div>
  );
}
