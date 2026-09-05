import {
  Credit,
  GeographicTilingScheme,
  ImageryLayer,
  Ion,
  TileMapServiceImageryProvider,
  UrlTemplateImageryProvider,
  WebMapTileServiceImageryProvider,
  buildModuleUrl,
} from 'cesium';

/** What the user can choose in settings. */
export const IMAGERY_SOURCES = ['auto', 'esri', 'gibs-bluemarble', 'ion', 'offline'] as const;
export type ImagerySource = (typeof IMAGERY_SOURCES)[number];
/** What actually ended up on the globe. */
export type ImageryResolved = Exclude<ImagerySource, 'auto'>;

// Esri World Imagery, no key required at this endpoint. Attribution is mandatory.
const ESRI_WORLD_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_PROBE_TILE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/0/0/0';

// NASA GIBS, Blue Marble shaded relief with bathymetry (static layer, EPSG:4326, "500m" matrix set).
// Not yet verified from a live network; see docs/DESIGN.md §4.2.
const GIBS_BLUE_MARBLE =
  'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/{TileMatrix}/{TileRow}/{TileCol}.jpeg';

const PROBE_TIMEOUT_MS = 6000;

export function createEsriLayer(): ImageryLayer {
  const provider = new UrlTemplateImageryProvider({
    url: ESRI_WORLD_IMAGERY,
    maximumLevel: 19,
    credit: new Credit(
      'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      true,
    ),
  });
  return new ImageryLayer(provider);
}

export function createGibsBlueMarbleLayer(): ImageryLayer {
  const provider = new WebMapTileServiceImageryProvider({
    url: GIBS_BLUE_MARBLE,
    layer: 'BlueMarble_ShadedRelief_Bathymetry',
    style: 'default',
    format: 'image/jpeg',
    tileMatrixSetID: '500m',
    maximumLevel: 7,
    tileWidth: 512,
    tileHeight: 512,
    tilingScheme: new GeographicTilingScheme({
      numberOfLevelZeroTilesX: 2,
      numberOfLevelZeroTilesY: 1,
    }),
    credit: new Credit('NASA Global Imagery Browse Services (GIBS)', true),
  });
  return new ImageryLayer(provider);
}

/** Natural Earth II tiles bundled with Cesium: low resolution, but works with no network at all. */
export async function createOfflineLayer(): Promise<ImageryLayer> {
  const provider = await TileMapServiceImageryProvider.fromUrl(
    buildModuleUrl('Assets/Textures/NaturalEarthII'),
  );
  return new ImageryLayer(provider);
}

/** Loads one tile through an <img> (no CORS needed) to see whether the online imagery is reachable. */
export function probeImage(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => finish(false), timeoutMs);
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  });
}

/** Cesium Ion (Bing imagery + world terrain) needs a personal access token from cesium.com/ion. */
export async function createIonLayer(token: string): Promise<ImageryLayer> {
  Ion.defaultAccessToken = token;
  return ImageryLayer.fromWorldImagery({});
}

export async function resolveImagerySource(source: ImagerySource, ionToken = ''): Promise<ImageryResolved> {
  if (source === 'ion' && !ionToken) source = 'auto';
  if (source !== 'auto') return source;
  return (await probeImage(ESRI_PROBE_TILE)) ? 'esri' : 'offline';
}

export async function createImageryLayer(resolved: ImageryResolved, ionToken = ''): Promise<ImageryLayer> {
  switch (resolved) {
    case 'esri':
      return createEsriLayer();
    case 'gibs-bluemarble':
      return createGibsBlueMarbleLayer();
    case 'ion':
      return createIonLayer(ionToken);
    case 'offline':
      return createOfflineLayer();
  }
}

export const IMAGERY_LABELS: Record<ImagerySource, string> = {
  auto: 'Automatic (Esri, offline fallback)',
  esri: 'Esri World Imagery',
  'gibs-bluemarble': 'NASA Blue Marble (GIBS)',
  ion: 'Cesium Ion: Bing imagery + terrain (token)',
  offline: 'Offline (bundled Natural Earth II)',
};
