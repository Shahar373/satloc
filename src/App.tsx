import { GlobeView } from './viewer/GlobeView';
import { ObserverLayer } from './viewer/ObserverLayer';
import { SatelliteLayerBridge } from './viewer/SatelliteLayerBridge';
import { TargetLayer } from './viewer/TargetLayer';
import { SettingsPanel } from './ui/SettingsPanel';
import { useKeyboardShortcuts } from './ui/useKeyboardShortcuts';
import { Sidebar } from './ui/Sidebar';
import { TopBar } from './ui/TopBar';

export function App() {
  useKeyboardShortcuts();
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
