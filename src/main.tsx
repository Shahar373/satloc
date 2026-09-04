import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './styles/global.css';
import './styles/cesium-dark.css';
import { App } from './App';
import { applyUrlOverrides } from './state/overrides';

// Cesium resolves its workers/textures relative to this URL. It is read lazily,
// on first use, so setting it before the first Viewer is created is enough.
window.CESIUM_BASE_URL = new URL('./cesium/', document.baseURI).href;

applyUrlOverrides(new URLSearchParams(window.location.search));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
