/**
 * Road Sync — Configuration & OpenStreetMap / Leaflet Settings
 * 
 * Free, open-source geospatial configuration for Road Sync:
 * - Powered by Leaflet + OpenStreetMap tiles (no Google billing or API key required)
 * - On-demand geocoding & reverse geocoding adhering to Nominatim usage policies
 *   (Strictly no autocomplete/as-you-type querying, compliant User-Agent, request rate-limiting)
 * - Focused on the State of Tamil Nadu, India
 */

window.ROADSYNC_CONFIG = {
  // Leaflet & OpenStreetMap Settings
  map: {
    provider: 'OpenFreeMap',
    // OpenFreeMap Liberty style: 100% free open-source vector tile service powered by OpenStreetMap & OpenMapTiles.
    // Requires NO API key, NO registration, and NO paid account.
    styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    // Fallback raster tile provider (OpenStreetMap France mirror) if WebGL is unavailable
    rasterFallbackUrl: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
    attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> Data from &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    fallbackAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &copy; OpenStreetMap France',
    maxZoom: 19,
    minZoom: 6,
    defaultCenter: [11.1271, 78.6569], // Central Tamil Nadu
    defaultZoom: 8,
    // Tamil Nadu Geographic Bounding Box [[south, west], [north, east]]
    boundsTamilNadu: [
      [8.0800, 76.2300],
      [13.5500, 80.3500]
    ]
  },

  // On-Demand Geocoding Settings (Adheres strictly to Nominatim Usage Policy)
  geocoding: {
    provider: 'Nominatim',
    endpointSearch: 'https://nominatim.openstreetmap.org/search',
    endpointReverse: 'https://nominatim.openstreetmap.org/reverse',
    contactEmail: 'roadsync.project@gmail.com',
    userAgent: 'RoadSync-Municipal-RoadMaintenance-CollegeProject/1.0',
    minIntervalMs: 1000 // Enforce minimum 1000ms between calls
  },

  // App Metadata
  app: {
    version: '3.1.0',
    state: 'Tamil Nadu, India',
    jurisdiction: 'Tamil Nadu Highways & Municipal Corporations'
  }
};
