/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
}

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
    /** The live Cesium viewer, exposed for smoke tests and console debugging. */
    __satlocViewer?: import('cesium').Viewer;
  }
}

export {};
