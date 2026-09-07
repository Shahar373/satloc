import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './styles/global.css';
import './styles/cesium-dark.css';
import { AppV2 } from './ui/v2/AppV2';
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

// Shell V2 (docs/design/gate-01/DECISION.md) is now the default shell. Shell V1 — the original
// UI — is kept available behind `?shell=v1` for one transition PR before removal, dynamically
// imported so its bundle and load path cost nothing for the now-default V2 path.
if (urlParams.get('shell') === 'v1') {
  void import('./App').then(({ App }) => {
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    );
  });
} else {
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <AppV2 />
      </ErrorBoundary>
    </StrictMode>,
  );
}
