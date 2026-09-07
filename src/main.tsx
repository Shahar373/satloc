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

const urlParams = new URLSearchParams(window.location.search);
applyUrlOverrides(urlParams);
void useCatalog.getState().load({ fixture: useOverrides.getState().catalogFixture });

const root = createRoot(document.getElementById('root')!);

// Dynamically imported so Shell V1's bundle and load path are completely unaffected when the
// flag isn't present — only `?shell=v2` visitors pay for Shell V2's code, tokens, and fonts.
if (urlParams.get('shell') === 'v2') {
  void import('./ui/v2/AppV2').then(({ AppV2 }) => {
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <AppV2 />
        </ErrorBoundary>
      </StrictMode>,
    );
  });
} else {
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
