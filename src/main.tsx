import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './styles/global.css';
import './styles/cesium-dark.css';
import { App } from './App';
import { useCatalog } from './state/catalog';
import { applyUrlOverrides, useOverrides } from './state/overrides';
import { ErrorBoundary } from './ui/ErrorBoundary';

// Cesium resolves its workers/textures relative to this URL. It is read lazily,
// on first use, so setting it before the first Viewer is created is enough.
window.CESIUM_BASE_URL = new URL('./cesium/', document.baseURI).href;

applyUrlOverrides(new URLSearchParams(window.location.search));
void useCatalog.getState().load({ fixture: useOverrides.getState().catalogFixture });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
