import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';

// Raw OpenStreetMap raster tiles — free and keyless, but OSM's tile usage policy
// is meant for light/prototype use only, not production-scale traffic. If this
// project ever moves past prototype, switch to a dedicated tile provider (or
// self-hosted tiles) instead of hitting tile.openstreetmap.org directly.
export const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

// Beirut fallback center, used until GPS resolves (or if permission is denied).
export const DEFAULT_CENTER: [number, number] = [35.5018, 33.8938];
