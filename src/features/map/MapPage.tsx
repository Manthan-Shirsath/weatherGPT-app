import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Map, { NavigationControl, Marker, Popup, Source, Layer, FullscreenControl, ScaleControl, MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { cn } from '@/lib/utils';
import { 
  Map as MapIcon, 
  CloudRain, 
  Cloud, 
  Wind, 
  Thermometer, 
  Gauge, 
  AlertTriangle, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  RefreshCw, 
  Navigation, 
  Sparkles, 
  ExternalLink, 
  Satellite, 
  Radio,
  Eye,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { apiFetch } from '@/lib/api';


export type MapLayerType = 'temperature' | 'radar' | 'satellite' | 'wind' | 'rain' | 'clouds' | 'pressure' | 'alerts';

// Maps frontend layer names to OWM tile layer names (via backend proxy)
const OWM_LAYER_MAP: Record<string, string> = {
  clouds:   'clouds_new',
  rain:     'precipitation_new',
  pressure: 'pressure_new',
  wind:     'wind_new',
  temperature: 'temp_new',
};

interface CityWeather {
  name: string;
  state?: string;
  latitude: number;
  longitude: number;
  temperature: number;
  feelsLike: number;
  condition: string;
  icon: string;
  weather_code: number;
  rainChance: number;
  precipitation: number;
  rain: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  windDirectionDeg: number;
  cloudCover: number;
  pressure: number;
  hasAlert?: boolean;
  alertSeverity?: 'normal' | 'moderate' | 'severe' | 'extreme';
  updatedAt?: string;
}

interface RadarFrame {
  time: number;
  path: string;
}

interface RadarMetadata {
  host: string;
  radar?: {
    past: RadarFrame[];
    nowcast: RadarFrame[];
  };
  satellite?: {
    infrared: RadarFrame[];
  };
}

interface PointWeather {
  latitude: number;
  longitude: number;
  temperature: number;
  feelsLike: number;
  humidity: number;
  precipitation: number;
  rain: number;
  rainChance: number;
  weather_code: number;
  condition: string;
  icon: string;
  cloudCover: number;
  windSpeed: number;
  windDirection: string;
  windDirectionDeg: number;
  pressure: number;
  nwpModel?: string;
  updatedAt?: string;
}

const BASEMAP_STYLES = {
  // OpenStreetMap Standard — always free, no key
  voyager: {
    version: 8 as const,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      'osm-standard': {
        type: 'raster' as const,
        tiles: [
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: 'osm-standard-layer',
        type: 'raster' as const,
        source: 'osm-standard',
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  },
  // OpenStreetMap Germany (slightly more detailed)
  light: {
    version: 8 as const,
    sources: {
      'osm-de': {
        type: 'raster' as const,
        tiles: [
          'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors',
        maxzoom: 18,
      },
    },
    layers: [
      {
        id: 'osm-de-layer',
        type: 'raster' as const,
        source: 'osm-de',
        minzoom: 0,
        maxzoom: 18,
      },
    ],
  },
  // CyclOSM — Detailed open cycle and terrain map
  dark: {
    version: 8 as const,
    sources: {
      'cyclosm': {
        type: 'raster' as const,
        tiles: [
          'https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
          'https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
          'https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; CyclOSM',
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: 'cyclosm-layer',
        type: 'raster' as const,
        source: 'cyclosm',
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  },
  // OpenTopoMap — free topographic tiles
  osm: {
    version: 8 as const,
    sources: {
      'topo': {
        type: 'raster' as const,
        tiles: [
          'https://tile.opentopomap.org/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '&copy; OpenTopoMap contributors &copy; OpenStreetMap',
        maxzoom: 17,
      },
    },
    layers: [
      {
        id: 'topo-layer',
        type: 'raster' as const,
        source: 'topo',
        minzoom: 0,
        maxzoom: 17,
      },
    ],
  },
  // Esri World Imagery — High Resolution Satellite
  satellite: {
    version: 8 as const,
    sources: {
      'esri-satellite': {
        type: 'raster' as const,
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: 'esri-satellite-layer',
        type: 'raster' as const,
        source: 'esri-satellite',
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  },
};

export default function MapPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const mapRef = useRef<MapRef | null>(null);

  // Map View State
  const [viewState, setViewState] = useState({
    longitude: 78.9629,
    latitude: 21.5937, // Centered on India
    zoom: 4.5,
    pitch: 0,
    bearing: 0
  });

  // Layer & Style State
  const [activeLayer, setActiveLayer] = useState<MapLayerType>('temperature');
  const [basemapTheme, setBasemapTheme] = useState<'auto' | 'voyager' | 'dark' | 'light' | 'osm' | 'satellite'>('satellite');
  const [radarOpacity, setRadarOpacity] = useState<number>(0.75);

  // Data States
  const [cities, setCities] = useState<CityWeather[]>([]);
  const [loadingCities, setLoadingCities] = useState<boolean>(true);
  const [radarMeta, setRadarMeta] = useState<RadarMetadata | null>(null);
  const [radarFrames, setRadarFrames] = useState<RadarFrame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [isPlayingRadar, setIsPlayingRadar] = useState<boolean>(false);
  const [radarLoading, setRadarLoading] = useState<boolean>(false);

  // Popups & Interactions
  const [selectedCity, setSelectedCity] = useState<CityWeather | null>(null);
  const [clickedPoint, setClickedPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [pointData, setPointData] = useState<PointWeather | null>(null);
  const [loadingPoint, setLoadingPoint] = useState<boolean>(false);

  // India Sovereign Boundary GeoJSON State
  const [boundaryGeoJSON, setBoundaryGeoJSON] = useState<any>(null);

  // Load official boundary dataset on mount
  useEffect(() => {
    fetch('/india-boundary.json')
      .then(res => res.json())
      .then(data => {
        setBoundaryGeoJSON(data);
      })
      .catch(err => console.error('Failed to load india boundary GeoJSON:', err));
  }, []);

  // Compute Active Basemap Style
  const currentMapStyle = useMemo(() => {
    if (basemapTheme === 'satellite') return BASEMAP_STYLES.satellite;
    if (basemapTheme === 'voyager') return BASEMAP_STYLES.voyager;
    if (basemapTheme === 'dark') return BASEMAP_STYLES.dark;
    if (basemapTheme === 'light') return BASEMAP_STYLES.light;
    if (basemapTheme === 'osm') return BASEMAP_STYLES.osm;
    // Auto mode: default to voyager
    return BASEMAP_STYLES.voyager;
  }, [basemapTheme]);

  // Robustly setup and maintain India Sovereign Boundary Overlay on MapLibre style lifecycle
  const setupIndiaBoundaryOverlay = (map: any) => {
    if (!map) return;
    const mapInstance = typeof map.getMap === 'function' ? map.getMap() : map;
    if (!mapInstance) return;

    const applyLayers = () => {
      try {
        if (!mapInstance.getSource('india-sovereign-boundary-source')) {
          mapInstance.addSource('india-sovereign-boundary-source', {
            type: 'geojson',
            data: boundaryGeoJSON || '/india-boundary.json'
          });
        } else if (boundaryGeoJSON) {
          const src = mapInstance.getSource('india-sovereign-boundary-source');
          if (src && typeof src.setData === 'function') {
            src.setData(boundaryGeoJSON);
          }
        }

        // Keep boundary layer beneath weather overlays if present and valid in current style
        const rawBeforeId = mapInstance.getLayer('rainviewer-layer')
          ? 'rainviewer-layer'
          : mapInstance.getLayer('owm-overlay-layer')
            ? 'owm-overlay-layer'
            : undefined;
        const beforeId = rawBeforeId && mapInstance.getLayer(rawBeforeId) ? rawBeforeId : undefined;

        if (!mapInstance.getLayer('india-boundary-glow')) {
          mapInstance.addLayer({
            id: 'india-boundary-glow',
            type: 'line',
            source: 'india-sovereign-boundary-source',
            paint: {
              'line-color': '#00d2ff',
              'line-width': 8,
              'line-opacity': 0.7,
              'line-blur': 3
            }
          }, beforeId);
        }

        if (!mapInstance.getLayer('india-boundary-stroke')) {
          mapInstance.addLayer({
            id: 'india-boundary-stroke',
            type: 'line',
            source: 'india-sovereign-boundary-source',
            paint: {
              'line-color': '#0284c7',
              'line-width': 3.5,
              'line-opacity': 1.0
            }
          }, beforeId);
        }
      } catch (err) {
        console.error('Failed to configure India sovereign boundary overlay:', err);
      }
    };

    if (typeof mapInstance.isStyleLoaded === 'function' && mapInstance.isStyleLoaded()) {
      applyLayers();
    }
    if (mapInstance.on && !mapInstance._boundaryListenerAttached) {
      mapInstance._boundaryListenerAttached = true;
      mapInstance.on('styledata', applyLayers);
    }
  };

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (map) {
      setupIndiaBoundaryOverlay(map);
    }
  }, [boundaryGeoJSON, basemapTheme, activeLayer]);

  // Fetch Cities Weather Dataset
  const fetchCitiesData = async () => {
    setLoadingCities(true);
    try {
      const res = await apiFetch('/api/map/cities');
      if (res.ok) {
        const json = await res.json();
        if (json.cities && Array.isArray(json.cities)) {
          setCities(json.cities);
        }
      }
    } catch (err) {
      console.error('Failed to load map cities weather:', err);
    } finally {
      setLoadingCities(false);
    }
  };

  // Fetch Radar Metadata
  const fetchRadarData = async () => {
    setRadarLoading(true);
    try {
      const res = await apiFetch('/api/radar');
      if (res.ok) {
        const json: RadarMetadata = await res.json();
        setRadarMeta(json);
      }
    } catch (err) {
      console.error('Failed to fetch radar metadata:', err);
    } finally {
      setRadarLoading(false);
    }
  };

  useEffect(() => {
    fetchCitiesData();
    fetchRadarData();
  }, []);

  // Update Radar Frames when activeLayer changes or metadata is loaded
  useEffect(() => {
    if (!radarMeta) return;

    if (activeLayer === 'radar') {
      const past = radarMeta.radar?.past || [];
      const nowcast = radarMeta.radar?.nowcast || [];
      const allFrames = [...past, ...nowcast];
      setRadarFrames(allFrames);
      // Default to the latest past frame (Live now)
      if (past.length > 0) {
        setCurrentFrameIndex(past.length - 1);
      } else if (allFrames.length > 0) {
        setCurrentFrameIndex(0);
      }
    } else if (activeLayer === 'satellite') {
      const infrared = radarMeta.satellite?.infrared || [];
      setRadarFrames(infrared);
      if (infrared.length > 0) {
        setCurrentFrameIndex(infrared.length - 1);
      }
    }
  }, [activeLayer, radarMeta]);

  // Radar Animation Loop
  useEffect(() => {
    let timer: any;
    if (isPlayingRadar && radarFrames.length > 0) {
      timer = setInterval(() => {
        setCurrentFrameIndex((prev) => (prev + 1) % radarFrames.length);
      }, 700);
    }
    return () => clearInterval(timer);
  }, [isPlayingRadar, radarFrames]);

  // Handle Point Weather Click on Map
  const handleMapClick = async (event: any) => {
    // If clicked on a marker or control, ignore
    if (event.originalEvent && (event.originalEvent.target as HTMLElement).closest('.city-marker')) {
      return;
    }

    const { lng, lat } = event.lngLat;
    setSelectedCity(null);
    setClickedPoint({ lat, lon: lng });
    setLoadingPoint(true);
    setPointData(null);

    try {
      const res = await apiFetch(`/api/map/point?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`);
      if (res.ok) {
        const data = await res.json();
        setPointData(data);
      }
    } catch (e) {
      console.error('Point weather query failed:', e);
    } finally {
      setLoadingPoint(false);
    }
  };

  // Flying to a selected city
  const flyToCity = (city: CityWeather) => {
    setSelectedCity(city);
    setClickedPoint(null);
    mapRef.current?.flyTo({
      center: [city.longitude, city.latitude],
      zoom: 7.5,
      duration: 1200
    });
  };

  // Get current active tile URL for Radar or Satellite (RainViewer)
  const currentTileUrl = useMemo(() => {
    if (!radarMeta || radarFrames.length === 0) return null;
    const frame = radarFrames[currentFrameIndex];
    if (!frame) return null;

    if (activeLayer === 'radar') {
      // Color scheme 2 = universal radar colors, smooth 1, snow 1
      return `${radarMeta.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
    } else if (activeLayer === 'satellite') {
      // Satellite infrared
      return `${radarMeta.host}${frame.path}/256/{z}/{x}/{y}/0/1_1.png`;
    }
    return null;
  }, [radarMeta, radarFrames, currentFrameIndex, activeLayer]);

  // OWM weather overlay tile URL (proxied through backend — API key stays server-side)
  const owmOverlayUrl = useMemo(() => {
    const owmLayer = OWM_LAYER_MAP[activeLayer];
    if (!owmLayer) return null;
    return `/api/tiles/owm/${owmLayer}/{z}/{x}/{y}.png`;
  }, [activeLayer]);

  // Format frame timestamp
  const formatFrameTime = (timestamp?: number) => {
    if (!timestamp) return '--';
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Helper for Temperature Color
  const getTempBadgeColor = (temp: number) => {
    if (temp <= 0) return 'bg-cyan-600 text-white';
    if (temp <= 15) return 'bg-blue-600 text-white';
    if (temp <= 25) return 'bg-emerald-600 text-white';
    if (temp <= 33) return 'bg-amber-500 text-white';
    if (temp <= 38) return 'bg-orange-600 text-white';
    return 'bg-red-600 text-white';
  };

  // Helper to render the map legend based on active layer
  const renderLegend = () => {
    switch (activeLayer) {
      case 'temperature':
        return (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-sky-text-secondary uppercase">Temperature (°C)</span>
            <div className="flex w-full h-2 rounded bg-linear-to-r from-cyan-600 via-emerald-600 to-red-600"></div>
            <div className="flex justify-between text-[10px] text-sky-text-primary font-mono font-bold mt-0.5">
              <span>0°</span><span>20°</span><span>40°+</span>
            </div>
          </div>
        );
      case 'wind':
        return (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-sky-text-secondary uppercase">Wind Speed (km/h)</span>
            <div className="flex w-full h-2 rounded bg-linear-to-r from-green-300 via-yellow-400 to-purple-600"></div>
            <div className="flex justify-between text-[10px] text-sky-text-primary font-mono font-bold mt-0.5">
              <span>0</span><span>20</span><span>100+</span>
            </div>
          </div>
        );
      case 'rain':
        return (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-sky-text-secondary uppercase">Rain Chance (%)</span>
            <div className="flex w-full h-2 rounded bg-linear-to-r from-blue-100 to-blue-800"></div>
            <div className="flex justify-between text-[10px] text-sky-text-primary font-mono font-bold mt-0.5">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>
        );
      case 'radar':
      case 'satellite':
        return (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-sky-text-secondary uppercase">Precipitation Intensity</span>
            <div className="flex w-full h-2 rounded" style={{ background: 'linear-gradient(to right, #60a5fa, #4ade80, #facc15, #dc2626)' }}></div>
            <div className="flex justify-between text-[10px] text-sky-text-primary font-mono font-bold mt-0.5">
              <span>Light</span><span>Heavy</span>
            </div>
          </div>
        );
      default:
        return (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] text-sky-text-secondary italic">No legend needed</span>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-sky-background relative overflow-hidden font-sans">
      
      {/* Top-Left / Bottom Floating Controls */}
      <div className="absolute bottom-20 lg:bottom-auto lg:top-4 left-2 right-2 lg:left-4 lg:right-auto z-20 flex flex-col gap-2 lg:gap-3 pointer-events-none items-center lg:items-start">
        
        {/* Title & Stats */}
        <div className="bg-sky-surface/95 backdrop-blur-xl px-3 py-2.5 rounded-xl border border-sky-border shadow-xl pointer-events-auto flex items-center gap-3 w-full max-w-85 lg:w-[320px]">
          <div className="bg-sky-primary text-white p-2.5 rounded-xl shadow-sm">
            <MapIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sky-text-primary text-[13px] leading-tight tracking-tight">{t('nav.weather_map', 'Meteorological Radar')}</h1>
              <Badge variant="outline" className="text-[8px] px-1 py-0 font-bold border-sky-primary text-sky-primary bg-sky-primary/10">LIVE</Badge>
            </div>
            <p className="text-[10px] text-sky-text-secondary font-medium mt-0.5 leading-snug">
              {cities.length} Monitored Cities • Click for details
            </p>
          </div>
        </div>

        {/* Basemap & City Jump Controls */}
        <div className="bg-sky-surface/95 backdrop-blur-xl p-2 rounded-xl border border-sky-border shadow-xl pointer-events-auto flex flex-col gap-2 w-full max-w-85 lg:w-[320px]">
          <select
            className="w-full bg-sky-background text-sky-text-primary font-medium text-xs rounded-xl px-3 py-2.5 border border-sky-border focus:outline-none focus:ring-2 focus:ring-sky-primary/50 transition-shadow"
            value={basemapTheme}
            onChange={(e) => setBasemapTheme(e.target.value as any)}
          >
            <option value="voyager">🗺️ Standard (OpenStreetMap)</option>
            <option value="satellite">🛰️ Satellite Imagery (Esri)</option>
            <option value="dark">🚲 CyclOSM Detailed</option>
            <option value="light">🏙️ OSM Germany</option>
            <option value="osm">🏔️ Topographic Map</option>
          </select>
          
          <div className="flex gap-2">
            <select 
              className="flex-1 bg-sky-background text-sky-text-primary font-medium text-xs rounded-xl px-3 py-2.5 border border-sky-border focus:outline-none focus:ring-2 focus:ring-sky-primary/50 transition-shadow"
              onChange={(e) => {
                const city = cities.find(c => c.name === e.target.value);
                if (city) flyToCity(city);
              }}
              value={selectedCity ? selectedCity.name : ""}
            >
              <option value="" disabled>Jump to City...</option>
              {cities.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-9.5 w-9.5 bg-sky-background border-sky-border shrink-0 rounded-xl hover:bg-sky-surface-elevated text-sky-text-primary" 
              title="Refresh Map Weather"
              onClick={() => { fetchCitiesData(); fetchRadarData(); }}
            >
              <RefreshCw className={`h-4 w-4 ${loadingCities || radarLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Top-Right / Top Floating Controls (Layer Selectors & Legend) */}
      <div className="absolute top-4 right-2 lg:right-4 z-20 flex flex-col items-end gap-2 lg:gap-3 pointer-events-none">
        
        {/* Layer Selector */}
        <div className="bg-sky-surface/95 backdrop-blur-xl p-2 rounded-xl border border-sky-border shadow-xl pointer-events-auto flex flex-col w-35 lg:w-42.5">
          <span className="text-[9px] lg:text-[10px] font-bold text-sky-text-secondary tracking-widest uppercase px-2 lg:px-3 py-1.5 mb-1 border-b border-sky-border/50">
            Layers
          </span>
          <div className="flex flex-col gap-0.5 mt-1">
            <Button variant={activeLayer === 'temperature' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveLayer('temperature')} className="justify-start h-8 px-3 text-xs rounded-lg text-sky-text-primary">
              <Thermometer className="h-3.5 w-3.5 mr-2" /> Temperature
            </Button>
            <Button variant={activeLayer === 'radar' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveLayer('radar')} className="justify-start h-8 px-3 text-xs rounded-lg text-sky-text-primary">
              <Radio className={cn("h-3.5 w-3.5 mr-2", activeLayer !== 'radar' && "text-sky-ai")} /> Doppler Radar
            </Button>
            <Button variant={activeLayer === 'satellite' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveLayer('satellite')} className="justify-start h-8 px-3 text-xs rounded-lg text-sky-text-primary">
              <Satellite className="h-3.5 w-3.5 mr-2" /> Satellite IR
            </Button>
            <Button variant={activeLayer === 'wind' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveLayer('wind')} className="justify-start h-8 px-3 text-xs rounded-lg text-sky-text-primary">
              <Wind className="h-3.5 w-3.5 mr-2" /> Wind
            </Button>
            <Button variant={activeLayer === 'rain' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveLayer('rain')} className="justify-start h-8 px-3 text-xs rounded-lg text-sky-text-primary">
              <CloudRain className="h-3.5 w-3.5 mr-2" /> Rain Chance
            </Button>
            <Button variant={activeLayer === 'clouds' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveLayer('clouds')} className="justify-start h-8 px-3 text-xs rounded-lg text-sky-text-primary">
              <Cloud className="h-3.5 w-3.5 mr-2" /> Clouds
            </Button>
            <Button variant={activeLayer === 'pressure' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveLayer('pressure')} className="justify-start h-8 px-3 text-xs rounded-lg text-sky-text-primary">
              <Gauge className="h-3.5 w-3.5 mr-2" /> Pressure
            </Button>
            <div className="h-px bg-sky-border my-1 mx-2" />
            <Button variant={activeLayer === 'alerts' ? 'destructive' : 'ghost'} size="sm" onClick={() => setActiveLayer('alerts')} className="justify-start h-8 px-3 text-xs rounded-lg text-sky-text-primary hover:text-sky-danger hover:bg-sky-danger/10">
              <AlertTriangle className="h-3.5 w-3.5 mr-2" /> Alerts
            </Button>
          </div>
        </div>

        {/* Dynamic Legend */}
        <div className="bg-sky-surface/95 backdrop-blur-xl p-3.5 rounded-2xl border border-sky-border shadow-xl pointer-events-auto w-42.5">
          {renderLegend()}
        </div>
      </div>

      {/* Main Map Canvas */}
      <div className="flex-1 w-full h-full relative">
        <Map
          ref={mapRef}
          {...viewState}
          onMove={evt => setViewState(evt.viewState)}
          mapStyle={currentMapStyle}
          attributionControl={false}
          style={{ width: '100%', height: '100%' }}
          onClick={handleMapClick}
          cursor="crosshair"
          cooperativeGestures={true}
          onLoad={(evt) => setupIndiaBoundaryOverlay(evt.target)}
          onStyleData={(evt) => setupIndiaBoundaryOverlay(evt.target)}
        >
          <NavigationControl position="bottom-right" />
          <FullscreenControl position="bottom-right" />

          {/* RainViewer Radar / Satellite IR overlay */}
          {currentTileUrl && (activeLayer === 'radar' || activeLayer === 'satellite') && (
            <Source
              key={currentTileUrl}
              id="rainviewer-source"
              type="raster"
              tiles={[currentTileUrl]}
              tileSize={256}
            >
              <Layer
                id="rainviewer-layer"
                type="raster"
                paint={{
                  'raster-opacity': radarOpacity,
                  'raster-fade-duration': 150
                }}
              />
            </Source>
          )}

          {/* OWM Weather Overlays: clouds, rain, wind, pressure, temperature */}
          {owmOverlayUrl && !['radar','satellite'].includes(activeLayer) && (
            <Source
              key={owmOverlayUrl}
              id="owm-overlay-source"
              type="raster"
              tiles={[owmOverlayUrl]}
              tileSize={256}
            >
              <Layer
                id="owm-overlay-layer"
                type="raster"
                paint={{
                  'raster-opacity': radarOpacity,
                  'raster-fade-duration': 200
                }}
              />
            </Source>
          )}

          {/* Render All 20+ Monitored City Markers */}
          {cities.map((city) => {
            const isSelected = selectedCity?.name === city.name;
            const hasActiveAlert = city.hasAlert || (city.alertSeverity && city.alertSeverity !== 'normal');

            return (
              <Marker
                key={city.name}
                longitude={city.longitude}
                latitude={city.latitude}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setSelectedCity(city);
                  setClickedPoint(null);
                }}
              >
                <div className="city-marker cursor-pointer group flex flex-col items-center select-none">
                  
                  {/* Severe Alert Pulsing Ring */}
                  {hasActiveAlert && (
                    <span className="absolute -inset-1 rounded-full bg-red-500/40 animate-ping" />
                  )}

                  {/* Marker Content based on Active Layer */}
                  {activeLayer === 'temperature' && (
                    <div className={`px-2 py-0.5 rounded-full shadow-md text-xs font-bold flex items-center gap-1 transition-transform group-hover:scale-110 border ${isSelected ? 'ring-2 ring-sky-primary border-white' : 'border-black/10'} ${getTempBadgeColor(city.temperature)}`}>
                      <span>{city.temperature}°</span>
                    </div>
                  )}

                  {activeLayer === 'wind' && (
                    <div className="bg-sky-surface text-sky-text-primary px-2 py-0.5 rounded-full shadow-md text-xs font-bold flex items-center gap-1 border border-sky-border group-hover:scale-110 transition-transform">
                      <Navigation 
                        className="h-3 w-3 text-sky-primary" 
                        style={{ transform: `rotate(${city.windDirectionDeg}deg)` }} 
                      />
                      <span>{city.windSpeed}k</span>
                    </div>
                  )}

                  {activeLayer === 'rain' && (
                    <div className={`px-2 py-0.5 rounded-full shadow-md text-xs font-bold flex items-center gap-1 border border-sky-border group-hover:scale-110 transition-transform ${city.rainChance > 50 ? 'bg-blue-600 text-white' : 'bg-sky-surface text-sky-text-primary'}`}>
                      <CloudRain className="h-3 w-3" />
                      <span>{city.rainChance}%</span>
                    </div>
                  )}

                  {activeLayer === 'clouds' && (
                    <div className="bg-sky-surface text-sky-text-primary px-2 py-0.5 rounded-full shadow-md text-xs font-bold flex items-center gap-1 border border-sky-border group-hover:scale-110 transition-transform">
                      <Cloud className="h-3 w-3 text-sky-text-secondary" />
                      <span>{city.cloudCover}%</span>
                    </div>
                  )}

                  {activeLayer === 'pressure' && (
                    <div className="bg-sky-surface text-sky-text-primary px-2 py-0.5 rounded-full shadow-md text-xs font-mono font-bold flex items-center gap-1 border border-sky-border group-hover:scale-110 transition-transform">
                      <span>{city.pressure}</span>
                    </div>
                  )}

                  {activeLayer === 'alerts' && (
                    <div className={`px-2 py-0.5 rounded-full shadow-md text-xs font-bold flex items-center gap-1 border ${hasActiveAlert ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'} group-hover:scale-110 transition-transform`}>
                      {hasActiveAlert ? <AlertTriangle className="h-3 w-3" /> : <span>Safe</span>}
                      <span>{city.name}</span>
                    </div>
                  )}

                  {(activeLayer === 'radar' || activeLayer === 'satellite') && (
                    <div className="bg-sky-surface/90 backdrop-blur-sm text-sky-text-primary px-2 py-0.5 rounded-full shadow-md text-[11px] font-bold border border-sky-border group-hover:scale-110 transition-transform">
                      {city.name}
                    </div>
                  )}

                  {/* Subtitle label for Temperature & Wind layers */}
                  {activeLayer !== 'alerts' && activeLayer !== 'radar' && activeLayer !== 'satellite' && (
                    <span className="text-[10px] font-semibold text-sky-text-primary drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)] dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] mt-0.5">
                      {city.name}
                    </span>
                  )}
                </div>
              </Marker>
            );
          })}

          {/* City Weather Detailed Inspection Popup */}
          {selectedCity && (
            <Popup
              longitude={selectedCity.longitude}
              latitude={selectedCity.latitude}
              anchor="bottom"
              offset={16}
              onClose={() => setSelectedCity(null)}
              className="weather-popup rounded-2xl z-30"
              closeButton={false}
              maxWidth="300px"
            >
              <Card className="border-0 shadow-xl bg-sky-surface/95 backdrop-blur-md rounded-2xl overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  
                  {/* City Header */}
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-lg text-sky-text-primary leading-none">
                        {selectedCity.name}
                      </h3>
                      {selectedCity.state && (
                        <p className="text-xs text-sky-text-secondary mt-0.5">{selectedCity.state}</p>
                      )}
                    </div>
                    {selectedCity.hasAlert ? (
                      <Badge variant="destructive" className="text-[10px] uppercase">
                        {selectedCity.alertSeverity || 'Alert'}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Normal
                      </Badge>
                    )}
                  </div>

                  {/* Main Metrics */}
                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <div className="text-3xl font-black text-sky-text-primary tracking-tight">
                        {selectedCity.temperature}°C
                      </div>
                      <div className="text-xs text-sky-text-secondary font-medium">
                        Feels like {selectedCity.feelsLike}°C
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-sky-text-primary">
                        {selectedCity.condition}
                      </div>
                      <div className="text-xs text-sky-text-secondary">
                        Rain: {selectedCity.rainChance}%
                      </div>
                    </div>
                  </div>

                  {/* Detailed Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-sky-surface-elevated/60 p-2.5 rounded-xl border border-sky-border/50">
                    <div className="flex items-center gap-1.5 text-sky-text-secondary">
                      <Wind className="h-3.5 w-3.5 text-sky-primary" />
                      <span>Wind: <strong className="text-sky-text-primary">{selectedCity.windSpeed} km/h</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sky-text-secondary">
                      <Eye className="h-3.5 w-3.5 text-sky-ai" />
                      <span>Humidity: <strong className="text-sky-text-primary">{selectedCity.humidity}%</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sky-text-secondary">
                      <Gauge className="h-3.5 w-3.5 text-amber-500" />
                      <span>Pressure: <strong className="text-sky-text-primary">{selectedCity.pressure} hPa</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sky-text-secondary">
                      <Cloud className="h-3.5 w-3.5 text-slate-500" />
                      <span>Clouds: <strong className="text-sky-text-primary">{selectedCity.cloudCover}%</strong></span>
                    </div>
                  </div>

                  {/* Quick Action Links */}
                  <div className="flex gap-2 pt-1">
                    <Button 
                      size="sm" 
                      className="flex-1 text-xs h-8 bg-sky-primary hover:bg-sky-primary-hover text-white"
                      onClick={() => navigate(`/forecast?city=${encodeURIComponent(selectedCity.name)}`)}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Forecast
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="flex-1 text-xs h-8"
                      onClick={() => navigate(`/weathergpt?q=${encodeURIComponent(`What is the weather outlook for ${selectedCity.name}?`)}`)}
                    >
                      <Sparkles className="h-3 w-3 mr-1 text-sky-ai" />
                      Ask AI
                    </Button>
                  </div>

                </CardContent>
              </Card>
            </Popup>
          )}

          {/* Coordinate Point Click Inspector Popup */}
          {clickedPoint && (
            <Popup
              longitude={clickedPoint.lon}
              latitude={clickedPoint.lat}
              anchor="bottom"
              offset={14}
              onClose={() => setClickedPoint(null)}
              className="weather-popup rounded-2xl z-30"
              closeButton={false}
              maxWidth="280px"
            >
              <Card className="border-0 shadow-xl bg-sky-surface/95 backdrop-blur-md rounded-2xl overflow-hidden">
                <CardContent className="p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-sky-text-primary flex items-center gap-1">
                        <Navigation className="h-3 w-3 text-sky-primary" />
                        Point Weather
                      </div>
                      <div className="text-[11px] font-mono text-sky-text-secondary">
                        {clickedPoint.lat.toFixed(4)}°N, {clickedPoint.lon.toFixed(4)}°E
                      </div>
                    </div>
                    {pointData?.nwpModel && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-sky-ai text-sky-ai">
                        GFS NWP
                      </Badge>
                    )}
                  </div>

                  {loadingPoint ? (
                    <div className="flex items-center justify-center py-6 gap-2 text-sky-text-secondary text-xs">
                      <Loader2 className="h-4 w-4 animate-spin text-sky-primary" />
                      <span>Querying Open-Meteo...</span>
                    </div>
                  ) : pointData ? (
                    <>
                      <div className="flex items-baseline justify-between pt-1">
                        <span className="text-2xl font-black text-sky-text-primary">
                          {pointData.temperature}°C
                        </span>
                        <span className="text-xs font-medium text-sky-text-secondary">
                          {pointData.condition}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-sky-surface-elevated/70 p-2 rounded-lg text-sky-text-secondary">
                        <div>Feels: <strong className="text-sky-text-primary">{pointData.feelsLike}°C</strong></div>
                        <div>Rain: <strong className="text-sky-text-primary">{pointData.rainChance}%</strong></div>
                        <div>Wind: <strong className="text-sky-text-primary">{pointData.windSpeed} km/h</strong></div>
                        <div>Humidity: <strong className="text-sky-text-primary">{pointData.humidity}%</strong></div>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-sky-danger py-2 text-center">
                      Failed to fetch point data
                    </div>
                  )}
                </CardContent>
              </Card>
            </Popup>
          )}

        </Map>

        {/* Radar & Satellite Animation Controls (Bottom Floating Bar) */}
        {(activeLayer === 'radar' || activeLayer === 'satellite') && radarFrames.length > 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-11/12 max-w-xl bg-sky-surface/95 backdrop-blur-md p-3.5 rounded-2xl border border-sky-border shadow-2xl flex flex-col gap-2.5">
            
            {/* Top Info Header */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="font-bold text-sky-text-primary">
                  {activeLayer === 'radar' ? 'Doppler Radar Imagery' : 'Satellite Infrared Loop'}
                </span>
                <span className="text-sky-text-secondary font-mono text-[11px]">
                  Frame {currentFrameIndex + 1}/{radarFrames.length} ({formatFrameTime(radarFrames[currentFrameIndex]?.time)})
                </span>
              </div>

              {/* Opacity Control */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-sky-text-secondary">Opacity</span>
                <input 
                  type="range" 
                  min="0.2" 
                  max="1.0" 
                  step="0.05" 
                  value={radarOpacity}
                  onChange={(e) => setRadarOpacity(parseFloat(e.target.value))}
                  className="w-16 h-1.5 accent-sky-primary cursor-pointer"
                />
              </div>
            </div>

            {/* Timeline Scrubber Slider */}
            <input 
              type="range"
              min="0"
              max={radarFrames.length - 1}
              value={currentFrameIndex}
              onChange={(e) => {
                setIsPlayingRadar(false);
                setCurrentFrameIndex(parseInt(e.target.value, 10));
              }}
              className="w-full h-2 bg-sky-surface-elevated rounded-lg accent-sky-primary cursor-pointer"
            />

            {/* Playback Buttons */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1.5">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    setIsPlayingRadar(false);
                    setCurrentFrameIndex((prev) => (prev > 0 ? prev - 1 : radarFrames.length - 1));
                  }}
                >
                  <SkipBack className="h-3.5 w-3.5" />
                </Button>

                <Button 
                  size="sm" 
                  className="h-8 px-3 text-xs bg-sky-primary hover:bg-sky-primary-hover text-white font-semibold"
                  onClick={() => setIsPlayingRadar(!isPlayingRadar)}
                >
                  {isPlayingRadar ? (
                    <>
                      <Pause className="h-3.5 w-3.5 mr-1" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 mr-1" /> Play Loop
                    </>
                  )}
                </Button>

                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    setIsPlayingRadar(false);
                    setCurrentFrameIndex((prev) => (prev + 1) % radarFrames.length);
                  }}
                >
                  <SkipForward className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="flex items-center gap-1 text-[11px] text-sky-text-secondary">
                <span className="px-1.5 py-0.5 rounded bg-sky-surface-elevated font-mono">
                  {currentFrameIndex >= (radarMeta?.radar?.past.length || 0) ? 'NOWCAST' : 'PAST'}
                </span>
                <span>RainViewer Cache</span>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
