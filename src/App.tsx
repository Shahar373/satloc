import { GlobeView } from './viewer/GlobeView';
import { TopBar } from './ui/TopBar';

export function App() {
  return (
    <div className="app">
      <TopBar />
      <GlobeView />
    </div>
  );
}
