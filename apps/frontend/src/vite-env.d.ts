/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional raster XYZ tile template for a reference basemap under the 3D twin. */
  readonly VITE_TWIN_BASEMAP_TILES?: string;
}
