import { GlobeView } from './viewer/GlobeView';
import { ObserverLayer } from './viewer/ObserverLayer';
import { SatelliteLayerBridge } from './viewer/SatelliteLayerBridge';
import { Sidebar } from './ui/Sidebar';
import { TopBar } from './ui/TopBar';

export function App() {
  return (
    <div className="app">
      <TopBar />
      <div className="app__body">
        <Sidebar />
        <GlobeView />
      </div>
      <SatelliteLayerBridge />
      <ObserverLayer />
    </div>
  );
}
