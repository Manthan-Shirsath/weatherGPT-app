import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Sparkles, 
  Loader2, 
  AlertCircle, 
  Info, 
  Clock, 
  LineChart as LineChartIcon,
  Download,
  BookmarkPlus,
  RotateCcw,
  Trash2,
  Layers,
  Flame,
  Calendar,
  Image as ImageIcon,
  ZoomIn
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Brush, ReferenceArea } from 'recharts';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface ForecastValue {
  valid_time: string;
  lead_hours: number;
  variable: string;
  representation?: string;
  value: number;
  unit: string;
}

interface IntelligenceModel {
  id: string;
  name: string;
  methodology?: string;
  forecast_type?: string;
  how_it_forecasts?: string;
  run_time?: string;
  fetched_at?: string;
  age_minutes?: number;
  status: 'fresh' | 'stale' | 'unavailable';
  forecast: ForecastValue[];
}

interface IntelligenceResponse {
  location: string;
  horizon_days: number;
  models: IntelligenceModel[];
  analytics?: Record<string, any>;
}

interface CustomPreset {
  name: string;
  modelIds: string[];
}

// Map known variables to readable names
const VARIABLE_LABELS: Record<string, string> = {
  'temperature_2m': 'Temperature',
  'temperature': 'Temperature',
  'precipitation': 'Precipitation Amount',
  'precipitation_probability': 'Precipitation Probability',
  'wind_speed_10m': 'Wind Speed',
  'wind_speed': 'Wind Speed',
};

// Colors for the charts
const MODEL_COLORS: Record<string, string> = {
  'ecmwf_ifs': '#3b82f6',        // Blue
  'ecmwf_aifs': '#8b5cf6',       // Purple (AI)
  'noaa_gfs': '#f59e0b',         // Amber
  'dwd_icon': '#10b981',         // Green
  'google_weathernext2': '#ec4899', // Pink (AI)
  'blended_consensus': '#06b6d4' // Cyan dashed
};
const FALLBACK_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#6366f1'];

const STORAGE_PRESETS_KEY = 'skycast_forecast_intelligence_presets';

export default function ForecastIntelligencePage() {
  const [searchParams] = useSearchParams();
  const locationName = searchParams.get('city') || 'Pune';
  
  const [data, setData] = useState<IntelligenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  
  const [enabledModels, setEnabledModels] = useState<Set<string>>(new Set());
  const [selectedVariable, setSelectedVariable] = useState<string>('');

  // Phase 1 Features State
  const [isolatedModel, setIsolatedModel] = useState<string | null>(null);
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  const [showBlendedConsensus, setShowBlendedConsensus] = useState<boolean>(true);
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [showPresetDialog, setShowPresetDialog] = useState<boolean>(false);
  const [activePreset, setActivePreset] = useState<string>('all');

  // Phase 2 Features State
  const [viewMode, setViewMode] = useState<'lines' | 'envelope'>('lines'); // Feature #3
  const [highlightDisagreements, setHighlightDisagreements] = useState<boolean>(true); // Feature #10
  const [selectedDayFilter, setSelectedDayFilter] = useState<string | null>(null); // Feature #6
  const [brushRange, setBrushRange] = useState<{ startIndex?: number; endIndex?: number } | null>(null); // Feature #4
  const chartContainerRef = useRef<HTMLDivElement>(null); // Feature #8 (PNG export)

  // Load saved custom presets from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PRESETS_KEY);
      if (saved) {
        setCustomPresets(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load custom presets:", e);
    }
  }, []);

  const saveCustomPresetsToStorage = (presets: CustomPreset[]) => {
    setCustomPresets(presets);
    try {
      localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(presets));
    } catch (e) {
      console.error("Failed to save custom presets:", e);
    }
  };

  const fetchAiAnalysis = async (loc: string) => {
    setAiLoading(true);
    setAiSummary(null);
    try {
      const res = await apiFetch(`/api/forecast-intelligence/${encodeURIComponent(loc)}/analysis`);
      if (res.ok) {
        const json = await res.json();
        setAiSummary(json.analysis);
      } else {
        setAiSummary("SkyCast analysis unavailable.");
      }
    } catch (err) {
      console.error(err);
      setAiSummary("SkyCast analysis unavailable.");
    } finally {
      setAiLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await apiFetch(`/api/forecast-intelligence/${encodeURIComponent(locationName)}`);
      if (!res.ok) throw new Error('API Error');
      const json: IntelligenceResponse = await res.json();
      setData(json);
      
      // Auto-enable available models
      const availableModels = json.models.filter(m => m.status !== 'unavailable').map(m => m.id);
      setEnabledModels(new Set(availableModels));
      
      // Trigger AI fetch independently without blocking
      fetchAiAnalysis(locationName);
      
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [locationName]);

  // Extract all available variables from the payload
  const availableVariables = useMemo(() => {
    if (!data) return [];
    const vars = new Set<string>();
    data.models.forEach(model => {
      model.forecast?.forEach(f => vars.add(f.variable));
    });
    return Array.from(vars);
  }, [data]);

  // Set default variable when data loads
  useEffect(() => {
    if (availableVariables.length > 0 && !selectedVariable) {
      if (availableVariables.includes('temperature_2m')) {
        setSelectedVariable('temperature_2m');
      } else if (availableVariables.includes('temperature')) {
        setSelectedVariable('temperature');
      } else {
        setSelectedVariable(availableVariables[0]);
      }
    }
  }, [availableVariables, selectedVariable]);

  // Group models by methodology
  const modelsByMethodology = useMemo(() => {
    if (!data) return {};
    const grouped: Record<string, IntelligenceModel[]> = {};
    data.models.forEach(m => {
      const method = m.methodology || 'unknown';
      if (!grouped[method]) grouped[method] = [];
      grouped[method].push(m);
    });
    return grouped;
  }, [data]);

  // Process data for the chart (Time aligned + Blended Consensus computation)
  const chartData = useMemo(() => {
    if (!data || !selectedVariable) return [];
    
    // Map: valid_time -> { timestamp: string, [model_id]: value, [`${model_id}_spread`]: value }
    const timeMap = new Map<string, any>();
    
    data.models.forEach(model => {
      if (!enabledModels.has(model.id)) return;
      
      model.forecast?.forEach(f => {
        if (f.variable !== selectedVariable) return;
        
        const vt = f.valid_time;
        if (!timeMap.has(vt)) {
          timeMap.set(vt, { timestamp: vt });
        }
        const entry = timeMap.get(vt);
        
        if (f.representation === 'ensemble_spread') {
          entry[`${model.id}_spread`] = f.value;
        } else {
          entry[model.id] = f.value; // deterministic or ensemble_mean
        }
      });
    });
    
    // Compute blended consensus & area ranges
    Array.from(timeMap.values()).forEach(entry => {
      const valuesForConsensus: number[] = [];
      
      data.models.forEach(model => {
        if (enabledModels.has(model.id) && entry[model.id] !== undefined) {
          valuesForConsensus.push(entry[model.id]);
        }
        
        if (entry[model.id] !== undefined && entry[`${model.id}_spread`] !== undefined) {
          entry[`${model.id}_range`] = [
            Number((entry[model.id] - entry[`${model.id}_spread`]).toFixed(2)),
            Number((entry[model.id] + entry[`${model.id}_spread`]).toFixed(2))
          ];
        }
      });

      // Feature #9 & Feature #3: Blended Consensus average & min/max envelope
      if (valuesForConsensus.length > 0) {
        const sum = valuesForConsensus.reduce((acc, v) => acc + v, 0);
        entry['blended_consensus'] = Number((sum / valuesForConsensus.length).toFixed(2));
        entry['_spread_min'] = Math.min(...valuesForConsensus);
        entry['_spread_max'] = Math.max(...valuesForConsensus);
        entry['_spread_diff'] = Number((entry['_spread_max'] - entry['_spread_min']).toFixed(2));
        entry['_envelope_range'] = [entry['_spread_min'], entry['_spread_max']];
      }
    });
    
    const sorted = Array.from(timeMap.values()).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    return sorted;
  }, [data, selectedVariable, enabledModels]);

  // Feature #10: Compute time windows where models diverge most
  const divergenceWindows = useMemo(() => {
    if (!chartData || chartData.length === 0 || !highlightDisagreements) return [];
    
    // Threshold based on variable: temp >= 3.0°C, wind >= 15 km/h, precip >= 3.0mm
    let threshold = 3.0;
    if (selectedVariable.includes('wind')) threshold = 15.0;
    else if (selectedVariable.includes('prob')) threshold = 30.0;
    
    const windows: Array<{ start: string; end: string; maxDiff: number }> = [];
    let currentWindow: { start: string; end: string; maxDiff: number } | null = null;

    chartData.forEach(entry => {
      const diff = entry._spread_diff || 0;
      if (diff >= threshold) {
        if (!currentWindow) {
          currentWindow = { start: entry.timestamp, end: entry.timestamp, maxDiff: diff };
        } else {
          currentWindow.end = entry.timestamp;
          currentWindow.maxDiff = Math.max(currentWindow.maxDiff, diff);
        }
      } else {
        if (currentWindow) {
          windows.push(currentWindow);
          currentWindow = null;
        }
      }
    });
    if (currentWindow) windows.push(currentWindow);
    return windows;
  }, [chartData, highlightDisagreements, selectedVariable]);

  // Get Backend Analytics for selected variable
  const variableAnalytics = useMemo(() => {
    if (!data || !data.analytics || !selectedVariable) return null;
    return data.analytics[selectedVariable];
  }, [data, selectedVariable]);

  const activeUnit = data?.models.flatMap(m => m.forecast).find(f => f.variable === selectedVariable)?.unit || '';

  // Model Map for quick title lookups
  const modelMap = useMemo(() => {
    const map = new Map<string, IntelligenceModel>();
    data?.models.forEach(m => map.set(m.id, m));
    return map;
  }, [data]);

  // Feature #6: Jump to specific day window in timeline
  const handleJumpToDay = (dateStr: string) => {
    if (!chartData || chartData.length === 0) return;
    
    if (selectedDayFilter === dateStr) {
      // Toggle off -> reset to full horizon
      setSelectedDayFilter(null);
      setBrushRange(null);
      return;
    }

    setSelectedDayFilter(dateStr);
    const targetDate = new Date(dateStr).toISOString().slice(0, 10);
    const matchingIndices: number[] = [];
    chartData.forEach((entry, idx) => {
      const entryDate = new Date(entry.timestamp).toISOString().slice(0, 10);
      if (entryDate === targetDate) {
        matchingIndices.push(idx);
      }
    });

    if (matchingIndices.length > 0) {
      setBrushRange({
        startIndex: matchingIndices[0],
        endIndex: matchingIndices[matchingIndices.length - 1]
      });
    }
  };

  // Feature #2: Toggle model isolation
  const handleModelIsolation = (id: string) => {
    if (isolatedModel === id) {
      setIsolatedModel(null); // Un-isolate
    } else {
      setIsolatedModel(id);
      if (!enabledModels.has(id)) {
        const next = new Set(enabledModels);
        next.add(id);
        setEnabledModels(next);
      }
    }
  };

  const toggleModel = (id: string) => {
    const newSet = new Set(enabledModels);
    if (newSet.has(id)) {
      newSet.delete(id);
      if (isolatedModel === id) setIsolatedModel(null);
    } else {
      newSet.add(id);
    }
    setEnabledModels(newSet);
    setActivePreset('custom');
  };

  // Feature #11: Preset Selection Handlers
  const applyPreset = (presetKey: string) => {
    if (!data) return;
    setActivePreset(presetKey);
    setIsolatedModel(null);

    if (presetKey === 'all') {
      const allAvail = data.models.filter(m => m.status !== 'unavailable').map(m => m.id);
      setEnabledModels(new Set(allAvail));
    } else if (presetKey === 'physics') {
      const physics = data.models.filter(m => m.methodology === 'physics_nwp' && m.status !== 'unavailable').map(m => m.id);
      setEnabledModels(new Set(physics));
    } else if (presetKey === 'ai') {
      const ai = data.models.filter(m => (m.methodology === 'machine_learning' || m.methodology === 'generative_ai') && m.status !== 'unavailable').map(m => m.id);
      setEnabledModels(new Set(ai));
    } else if (presetKey === 'top2') {
      setEnabledModels(new Set(['ecmwf_ifs', 'ecmwf_aifs']));
    } else {
      // Check custom presets
      const found = customPresets.find(p => p.name === presetKey);
      if (found) {
        setEnabledModels(new Set(found.modelIds));
      }
    }
  };

  const handleSaveCustomPreset = () => {
    if (!newPresetName.trim() || enabledModels.size === 0) return;
    const updated = [
      ...customPresets.filter(p => p.name !== newPresetName.trim()),
      { name: newPresetName.trim(), modelIds: Array.from(enabledModels) }
    ];
    saveCustomPresetsToStorage(updated);
    setActivePreset(newPresetName.trim());
    setNewPresetName('');
    setShowPresetDialog(false);
  };

  const handleDeleteCustomPreset = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customPresets.filter(p => p.name !== name);
    saveCustomPresetsToStorage(updated);
    if (activePreset === name) setActivePreset('all');
  };

  // Feature #7: Export Chart Data as CSV
  const handleExportCsv = useCallback(() => {
    if (!chartData || chartData.length === 0 || !data) return;
    
    const activeModelList = data.models.filter(m => enabledModels.has(m.id));
    const headers = [
      'Timestamp UTC',
      'Local Time',
      ...activeModelList.map(m => `"${m.name} (${activeUnit})"`),
      ...(showBlendedConsensus ? [`"Blended Consensus (${activeUnit})"`] : []),
      `"Model Spread Range (${activeUnit})"`
    ];

    const rows = chartData.map(entry => {
      const localTime = new Date(entry.timestamp).toLocaleString();
      const modelCols = activeModelList.map(m => entry[m.id] !== undefined ? entry[m.id] : '');
      const consensusCol = showBlendedConsensus ? [entry['blended_consensus'] ?? ''] : [];
      const spreadCol = entry['_spread_diff'] !== undefined ? `${entry['_spread_diff']}` : '';
      
      return [
        `"${entry.timestamp}"`,
        `"${localTime}"`,
        ...modelCols,
        ...consensusCol,
        `"${spreadCol}"`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${locationName}_${selectedVariable}_forecast_intelligence_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [chartData, data, enabledModels, activeUnit, locationName, selectedVariable, showBlendedConsensus]);

  // Feature #8: Export Chart as PNG Image (2x HD Snapshot)
  const handleExportPng = useCallback(() => {
    if (!chartContainerRef.current) return;
    const svg = chartContainerRef.current.querySelector('svg');
    if (!svg) return;

    try {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const svgSize = svg.getBoundingClientRect();
      const scale = 2; // 2x Retina resolution
      canvas.width = (svgSize.width || 800) * scale;
      canvas.height = ((svgSize.height || 420) + 60) * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(scale, scale);

      // Dark background matching SkyCast design system
      ctx.fillStyle = '#0b132b';
      ctx.fillRect(0, 0, svgSize.width || 800, (svgSize.height || 420) + 60);

      // Header watermark
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(`SkyCast Forecast Intelligence · ${locationName}`, 20, 28);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.fillText(`${VARIABLE_LABELS[selectedVariable] || selectedVariable} (${activeUnit}) · Generated ${new Date().toLocaleString()}`, 20, 46);

      const img = new Image();
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        ctx.drawImage(img, 0, 60, svgSize.width || 800, svgSize.height || 420);
        URL.revokeObjectURL(url);
        const pngUrl = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.href = pngUrl;
        downloadLink.download = `skycast-${locationName}-${selectedVariable}-forecast-chart.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      };
      img.src = url;
    } catch (e) {
      console.error("PNG export error:", e);
    }
  }, [locationName, selectedVariable, activeUnit]);

  // Feature #5: Overall Consensus Status
  const consensusLevel = useMemo(() => {
    if (!variableAnalytics) return null;
    const spread = variableAnalytics.overall_max_spread || 0;
    if (selectedVariable.includes('temp')) {
      if (spread <= 2.5) return { label: 'High Consensus', variant: 'success', color: 'text-sky-success bg-sky-success/10 border-sky-success/30' };
      if (spread <= 5.0) return { label: 'Moderate Spread', variant: 'warning', color: 'text-sky-warning bg-sky-warning/10 border-sky-warning/30' };
      return { label: 'High Divergence', variant: 'danger', color: 'text-sky-danger bg-sky-danger/10 border-sky-danger/30' };
    }
    if (selectedVariable.includes('precip')) {
      if (spread <= 2.0) return { label: 'High Consensus', variant: 'success', color: 'text-sky-success bg-sky-success/10 border-sky-success/30' };
      if (spread <= 6.0) return { label: 'Moderate Spread', variant: 'warning', color: 'text-sky-warning bg-sky-warning/10 border-sky-warning/30' };
      return { label: 'High Divergence', variant: 'danger', color: 'text-sky-danger bg-sky-danger/10 border-sky-danger/30' };
    }
    return { label: 'Active Comparison', variant: 'info', color: 'text-sky-primary bg-sky-primary/10 border-sky-primary/30' };
  }, [variableAnalytics, selectedVariable]);

  // Feature #1: Custom Enhanced Recharts Tooltip
  const CustomForecastTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const date = new Date(label);
    const formattedDate = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Extract valid model values and sort descending
    const modelEntries = payload
      .filter((p: any) => !p.dataKey.endsWith('_range') && p.dataKey !== 'blended_consensus' && p.value !== undefined)
      .map((p: any) => {
        const model = modelMap.get(p.dataKey);
        return {
          id: p.dataKey,
          name: model?.name || p.name,
          value: p.value,
          color: p.color,
          methodology: model?.methodology,
          isIsolated: isolatedModel === p.dataKey
        };
      })
      .sort((a: any, b: any) => b.value - a.value);

    const blendedEntry = payload.find((p: any) => p.dataKey === 'blended_consensus');
    const spreadMin = payload[0]?.payload?._spread_min;
    const spreadMax = payload[0]?.payload?._spread_max;
    const spreadDiff = payload[0]?.payload?._spread_diff;

    return (
      <div className="bg-sky-surface/95 backdrop-blur-md border border-sky-border p-3.5 rounded-lg shadow-xl min-w-60 text-xs flex flex-col gap-2.5">
        <div className="border-b border-sky-border pb-1.5 flex justify-between items-center">
          <span className="font-bold text-sky-text-primary">{formattedDate} · {formattedTime}</span>
          {spreadDiff !== undefined && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-surface-elevated text-sky-text-secondary">
              Δ {spreadDiff} {activeUnit}
            </span>
          )}
        </div>

        {/* Model Rows */}
        <div className="flex flex-col gap-1.5">
          {modelEntries.map((m: any) => (
            <div 
              key={m.id} 
              className={cn(
                "flex items-center justify-between gap-3 px-1.5 py-1 rounded transition-colors",
                m.isIsolated ? "bg-sky-primary/15 font-bold" : "hover:bg-sky-surface-elevated/50"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }}></span>
                <span className={cn("text-sky-text-primary truncate max-w-32.5", m.isIsolated && "text-sky-primary")}>
                  {m.name}
                </span>
                {m.methodology === 'machine_learning' || m.methodology === 'generative_ai' ? (
                  <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-purple-500/20 text-purple-400">AI</span>
                ) : null}
              </div>
              <span className="font-mono font-bold text-sky-text-primary">
                {m.value} {activeUnit}
              </span>
            </div>
          ))}
        </div>

        {/* Blended Consensus summary */}
        {blendedEntry && blendedEntry.value !== undefined && (
          <div className="border-t border-sky-border/70 pt-2 flex items-center justify-between text-cyan-400 font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-0.5 bg-cyan-400"></span>
              Blended Consensus
            </span>
            <span className="font-mono font-bold">{blendedEntry.value} {activeUnit}</span>
          </div>
        )}

        {/* Spread breakdown */}
        {spreadMin !== undefined && spreadMax !== undefined && (
          <div className="text-[10px] text-sky-text-secondary flex justify-between bg-sky-surface-elevated/40 p-1 rounded">
            <span>Range:</span>
            <span className="font-mono">{spreadMin} - {spreadMax} {activeUnit}</span>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-sky-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-sky-primary" />
          <p className="text-sky-text-secondary font-medium">Fetching Multi-Model Forecast Data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-sky-background p-4">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <AlertCircle className="h-10 w-10 text-sky-danger" />
          <h2 className="text-xl font-bold text-sky-text-primary">Forecast Intelligence is temporarily unavailable.</h2>
          <p className="text-sky-text-secondary">We could not retrieve the multi-model data at this time.</p>
          <Button onClick={fetchData} variant="outline" className="mt-2 border-sky-border text-sky-text-primary">
            Retry Connection
          </Button>
        </div>
      </div>
    );
  }

  if (data.models.length === 0 || availableVariables.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-sky-background p-4">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <Info className="h-10 w-10 text-sky-text-secondary" />
          <h2 className="text-xl font-bold text-sky-text-primary">No forecast intelligence data is currently available for this location.</h2>
          <p className="text-sky-text-secondary">The backend has not yet ingested multi-model forecasts for {locationName}.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-sky-background p-4 md:p-6 overflow-y-auto">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-sky-text-primary flex items-center gap-3">
            <LineChartIcon className="h-6 w-6 text-sky-primary" />
            Forecast Intelligence
          </h1>
          <p className="text-sky-text-secondary flex items-center gap-2 font-medium">
            {locationName} · {data.horizon_days}-Day Comparative Horizon
          </p>
        </div>

        {/* Header Action Bar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {consensusLevel && (
            <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold shadow-sm", consensusLevel.color)}>
              <span className="w-2 h-2 rounded-full animate-pulse bg-current"></span>
              {consensusLevel.label}
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="border-sky-border text-sky-text-primary hover:bg-sky-surface-elevated gap-1.5 text-xs font-semibold"
            title="Download timeseries comparison table as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>

          {/* Feature #8: Export Chart as PNG */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPng}
            className="border-sky-border text-sky-text-primary hover:bg-sky-surface-elevated gap-1.5 text-xs font-semibold"
            title="Download high-resolution chart snapshot as PNG"
          >
            <ImageIcon className="w-3.5 h-3.5 text-sky-ai" />
            Export PNG
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 pb-12">
        
        {/* Left Sidebar controls */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          
          {/* Analysis Variable Selector */}
          <Card className="border-sky-border bg-sky-surface shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-wider text-sky-text-secondary">Analysis Variable</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {availableVariables.map(v => (
                <Button 
                  key={v}
                  variant={selectedVariable === v ? 'default' : 'outline'}
                  className={cn("justify-start", selectedVariable === v ? "bg-sky-primary text-white font-bold" : "border-sky-border text-sky-text-primary hover:bg-sky-surface-elevated")}
                  onClick={() => setSelectedVariable(v)}
                >
                  {VARIABLE_LABELS[v] || v}
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* Model Selection & Presets */}
          <Card className="border-sky-border bg-sky-surface shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm uppercase tracking-wider text-sky-text-secondary">Forecasting Models</CardTitle>
              {isolatedModel && (
                <button 
                  onClick={() => setIsolatedModel(null)}
                  className="text-[11px] text-sky-primary hover:underline flex items-center gap-1 font-bold"
                >
                  <RotateCcw className="w-3 h-3" /> Reset View
                </button>
              )}
            </CardHeader>
            
            <CardContent className="flex flex-col gap-5">
              
              {/* Feature #11: Quick Selection Presets */}
              <div className="flex flex-col gap-2 border-b border-sky-border pb-4">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-sky-text-secondary">Presets</span>
                  <button 
                    onClick={() => setShowPresetDialog(!showPresetDialog)}
                    className="text-[11px] text-sky-primary hover:underline flex items-center gap-1 font-semibold"
                  >
                    <BookmarkPlus className="w-3 h-3" /> Save Preset
                  </button>
                </div>

                {showPresetDialog && (
                  <div className="flex gap-2 mt-1 bg-sky-surface-elevated/60 p-2 rounded-md border border-sky-border">
                    <input 
                      type="text" 
                      placeholder="Preset name (e.g. My Top 3)..." 
                      value={newPresetName}
                      onChange={e => setNewPresetName(e.target.value)}
                      className="text-xs bg-sky-background border border-sky-border rounded px-2 py-1 flex-1 text-sky-text-primary focus:outline-none focus:ring-1 focus:ring-sky-primary"
                    />
                    <Button size="sm" className="h-7 text-xs px-2.5 bg-sky-primary text-white" onClick={handleSaveCustomPreset}>
                      Save
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 mt-1">
                  <button
                    onClick={() => applyPreset('all')}
                    className={cn(
                      "text-[10px] font-bold px-2 py-1 rounded transition-colors",
                      activePreset === 'all' ? "bg-sky-primary text-white" : "bg-sky-surface-elevated text-sky-text-secondary hover:text-sky-text-primary"
                    )}
                  >
                    All Models
                  </button>
                  <button
                    onClick={() => applyPreset('physics')}
                    className={cn(
                      "text-[10px] font-bold px-2 py-1 rounded transition-colors",
                      activePreset === 'physics' ? "bg-sky-primary text-white" : "bg-sky-surface-elevated text-sky-text-secondary hover:text-sky-text-primary"
                    )}
                  >
                    Physics NWP
                  </button>
                  <button
                    onClick={() => applyPreset('ai')}
                    className={cn(
                      "text-[10px] font-bold px-2 py-1 rounded transition-colors",
                      activePreset === 'ai' ? "bg-sky-primary text-white" : "bg-sky-surface-elevated text-sky-text-secondary hover:text-sky-text-primary"
                    )}
                  >
                    AI / ML Only
                  </button>
                  <button
                    onClick={() => applyPreset('top2')}
                    className={cn(
                      "text-[10px] font-bold px-2 py-1 rounded transition-colors",
                      activePreset === 'top2' ? "bg-sky-primary text-white" : "bg-sky-surface-elevated text-sky-text-secondary hover:text-sky-text-primary"
                    )}
                  >
                    ECMWF Duo
                  </button>

                  {customPresets.map(preset => (
                    <div 
                      key={preset.name}
                      onClick={() => applyPreset(preset.name)}
                      className={cn(
                        "text-[10px] font-bold px-2 py-1 rounded transition-colors flex items-center gap-1.5 cursor-pointer group",
                        activePreset === preset.name ? "bg-sky-primary text-white" : "bg-sky-surface-elevated text-sky-text-secondary hover:text-sky-text-primary"
                      )}
                    >
                      <span>{preset.name}</span>
                      <Trash2 
                        className="w-2.5 h-2.5 opacity-60 hover:opacity-100 hover:text-sky-danger" 
                        onClick={(e) => handleDeleteCustomPreset(preset.name, e)} 
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Feature #9: Blended Consensus Switch */}
              <div className="flex items-center justify-between border-b border-sky-border pb-3">
                <label className="flex items-center gap-2.5 text-xs font-bold text-sky-text-primary cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={showBlendedConsensus}
                    onChange={e => setShowBlendedConsensus(e.target.checked)}
                    className="rounded border-sky-border text-cyan-500 focus:ring-cyan-500 w-4 h-4"
                    style={{ accentColor: '#06b6d4' }}
                  />
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
                    Blended Consensus Line
                  </span>
                </label>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-bold">AVG</span>
              </div>

              {/* Model Checkboxes & Isolation Clickers */}
              {Object.entries(modelsByMethodology).map(([methodology, models]) => (
                <div key={methodology} className="flex flex-col gap-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-sky-text-secondary border-b border-sky-border/40 pb-1 mb-1">
                    {methodology.replace('_', ' ')}
                  </h4>
                  <div className="flex flex-col gap-2.5">
                    {models.map((model, idx) => {
                      const color = MODEL_COLORS[model.id] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
                      const isUnavailable = model.status === 'unavailable';
                      const isIsolated = isolatedModel === model.id;
                      
                      return (
                        <div 
                          key={model.id} 
                          className={cn(
                            "flex items-center justify-between p-1.5 rounded transition-all",
                            isIsolated ? "bg-sky-surface-elevated border border-sky-primary/50 shadow-sm" : "hover:bg-sky-surface-elevated/40"
                          )}
                          onMouseEnter={() => setHoveredModel(model.id)}
                          onMouseLeave={() => setHoveredModel(null)}
                        >
                          <label className={cn("flex items-center gap-2.5 text-xs font-medium select-none flex-1", isUnavailable ? "opacity-50 cursor-not-allowed" : "cursor-pointer")}>
                            <input 
                              type="checkbox" 
                              disabled={isUnavailable}
                              checked={enabledModels.has(model.id)}
                              onChange={() => toggleModel(model.id)}
                              className="rounded border-sky-border text-sky-primary focus:ring-sky-primary w-4 h-4"
                              style={{ accentColor: color }}
                            />
                            <span className="flex items-center gap-2 text-sky-text-primary">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: isUnavailable ? 'gray' : color }}></span>
                              <span className={cn(isIsolated && "font-bold text-sky-primary")}>{model.name}</span>
                            </span>
                          </label>

                          <div className="flex items-center gap-1.5">
                            {!isUnavailable && (
                              <button
                                onClick={() => handleModelIsolation(model.id)}
                                className={cn(
                                  "text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors",
                                  isIsolated 
                                    ? "bg-sky-primary text-white" 
                                    : "text-sky-text-secondary hover:text-sky-text-primary hover:bg-sky-surface-elevated"
                                )}
                                title={isIsolated ? "Show all models" : "Isolate this model line"}
                              >
                                {isIsolated ? "Isolated" : "Focus"}
                              </button>
                            )}
                            {isUnavailable && <span className="text-[9px] uppercase font-bold text-sky-danger bg-sky-danger/10 px-1.5 py-0.5 rounded">Unavailable</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Model Consensus Card with Feature #5 Colored Indicators */}
          {variableAnalytics && (
            <Card className="border-sky-border bg-sky-surface shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm uppercase tracking-wider text-sky-text-secondary">Model Consensus</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4">
                  <div>
                    <span className="text-xs text-sky-text-secondary uppercase tracking-wider font-bold block mb-1">Max Overall Disagreement</span>
                    <span className="text-xl font-mono font-bold text-sky-text-primary">
                      {variableAnalytics.overall_max_spread} {variableAnalytics.unit}
                    </span>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-sky-text-secondary uppercase tracking-wider font-bold">Daily Agreement</span>
                      <span className="text-[10px] text-sky-primary font-semibold">Click day to jump</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {variableAnalytics.periods?.map((p: any) => {
                        const isSelected = selectedDayFilter === p.date;
                        return (
                          <div 
                            key={p.date} 
                            onClick={() => handleJumpToDay(p.date)}
                            className={cn(
                              "flex flex-col items-center p-2 rounded-md border text-center cursor-pointer transition-all hover:scale-105 select-none", 
                              isSelected 
                                ? "bg-sky-primary/20 border-sky-primary ring-2 ring-sky-primary/50 shadow-sm" 
                                : "bg-sky-surface-elevated/60 border-sky-border/70 hover:border-sky-ai/40 hover:bg-sky-surface-elevated"
                            )}
                            title={`Click to focus chart on ${p.date} | Max spread: ${p.max_spread} ${variableAnalytics.unit}`}
                          >
                            <span className={cn("text-[10px] font-bold", isSelected ? "text-sky-primary" : "text-sky-text-secondary")}>
                              {new Date(p.date).toLocaleDateString([], { weekday: 'short' })}
                            </span>
                            <span className={cn(
                              "w-2.5 h-2.5 rounded-full my-1.5 transition-transform",
                              p.agreement === 'high' ? 'bg-sky-success ring-4 ring-sky-success/20' : 
                              p.agreement === 'moderate' ? 'bg-sky-warning ring-4 ring-sky-warning/20' : 
                              'bg-sky-danger ring-4 ring-sky-danger/20',
                              isSelected && "scale-125"
                            )}></span>
                            <span className="text-[9px] font-mono font-bold text-sky-text-primary">
                              {p.max_spread}{variableAnalytics.unit}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex flex-col gap-6 lg:col-span-3">
          
          {/* SkyCast AI Analysis */}
          <Card className="border-sky-border bg-sky-surface shadow-sm relative overflow-hidden">
             <div className="absolute top-0 left-0 w-1.5 h-full bg-accent-ai"></div>
             <CardContent className="p-4 md:p-6 pl-6 md:pl-8 flex flex-col gap-3">
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <Sparkles className="w-5 h-5 text-accent-ai" />
                   <h3 className="font-bold text-sky-text-primary text-lg">SkyCast AI Analysis</h3>
                 </div>
                 {aiLoading && (
                   <span className="text-xs font-semibold text-sky-text-secondary flex items-center gap-1.5">
                     <Loader2 className="w-3.5 h-3.5 animate-spin" /> Synthesizing...
                   </span>
                 )}
               </div>
               
               <p className="text-sm text-sky-text-primary leading-relaxed">
                 {aiSummary || (aiLoading ? "Analyzing model consensus and atmospheric variance..." : "Analysis not available.")}
               </p>
             </CardContent>
          </Card>

          {/* Main Chart Card */}
          <Card className="border-sky-border bg-sky-surface shadow-sm overflow-hidden">
             <CardHeader className="border-b border-sky-border/50 bg-sky-surface-elevated/30 py-3.5">
               <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                 <div>
                   <CardTitle className="text-lg flex items-center gap-2">
                     {VARIABLE_LABELS[selectedVariable] || selectedVariable}
                     {isolatedModel && (
                       <span className="text-xs font-normal text-sky-primary bg-sky-primary/10 px-2 py-0.5 rounded-full border border-sky-primary/20">
                         Isolating {modelMap.get(isolatedModel)?.name || isolatedModel}
                       </span>
                     )}
                     {selectedDayFilter && (
                       <span className="text-xs font-normal text-sky-ai bg-sky-ai/10 px-2 py-0.5 rounded-full border border-sky-ai/20">
                         Day: {new Date(selectedDayFilter).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                       </span>
                     )}
                   </CardTitle>
                   <CardDescription>Multi-model comparison over {data.horizon_days} days</CardDescription>
                 </div>

                 {/* Phase 2 Interactive Controls */}
                 <div className="flex items-center gap-3 flex-wrap">
                   {/* Feature #3: View Mode Toggle (Lines vs Spread Envelope) */}
                   <div className="flex items-center gap-1 bg-sky-surface-elevated p-0.5 rounded-lg border border-sky-border shadow-xs">
                     <button
                       onClick={() => setViewMode('lines')}
                       className={cn(
                         "px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5",
                         viewMode === 'lines' ? "bg-sky-primary text-white shadow-xs" : "text-sky-text-secondary hover:text-sky-text-primary"
                       )}
                       title="Individual model lines view"
                     >
                       <LineChartIcon className="w-3.5 h-3.5" />
                       <span>Lines</span>
                     </button>
                     <button
                       onClick={() => setViewMode('envelope')}
                       className={cn(
                         "px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5",
                         viewMode === 'envelope' ? "bg-sky-primary text-white shadow-xs" : "text-sky-text-secondary hover:text-sky-text-primary"
                       )}
                       title="Min/Max spread-band envelope view across all models"
                     >
                       <Layers className="w-3.5 h-3.5" />
                       <span>Spread Band</span>
                     </button>
                   </div>

                   {/* Feature #10: Toggle Divergence Shading */}
                   <label className="flex items-center gap-1.5 text-xs text-sky-text-secondary cursor-pointer hover:text-sky-text-primary select-none">
                     <input
                       type="checkbox"
                       checked={highlightDisagreements}
                       onChange={e => setHighlightDisagreements(e.target.checked)}
                       className="rounded border-sky-border text-amber-500 focus:ring-amber-500 w-3.5 h-3.5"
                       style={{ accentColor: '#f59e0b' }}
                     />
                     <span className="flex items-center gap-1 font-medium">
                       <Flame className="w-3.5 h-3.5 text-amber-400" />
                       <span className="hidden sm:inline">Divergence Shading</span>
                     </span>
                   </label>

                   {/* Feature #4 & #6: Reset Zoom/Brush filter */}
                   {(brushRange || selectedDayFilter) && (
                     <button
                       onClick={() => { setBrushRange(null); setSelectedDayFilter(null); }}
                       className="text-xs text-sky-primary hover:underline flex items-center gap-1 font-bold"
                     >
                       <RotateCcw className="w-3 h-3" /> Reset Zoom
                     </button>
                   )}

                   {/* Active Line Count */}
                   <span className="font-mono bg-sky-surface-elevated px-2 py-1 rounded border border-sky-border text-xs text-sky-text-secondary font-bold">
                     {enabledModels.size} Models Active
                   </span>
                 </div>
               </div>
             </CardHeader>

             <CardContent className="p-4 md:p-6">
               {/* Feature #8: Attached Ref for PNG export snapshot */}
               <div ref={chartContainerRef} className="h-115 w-full">
                 <ResponsiveContainer width="100%" height="100%">
                   <ComposedChart data={chartData} margin={{ top: 20, right: 15, left: -20, bottom: 10 }}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                     
                     {/* Feature #10: Disagreement / Divergence Windows Shading */}
                     {highlightDisagreements && divergenceWindows.map((w, idx) => (
                       <ReferenceArea
                         key={`divergence-area-${idx}`}
                         x1={w.start}
                         x2={w.end}
                         fill="#ef4444"
                         fillOpacity={0.09}
                         stroke="#ef4444"
                         strokeDasharray="3 3"
                         strokeOpacity={0.4}
                       />
                     ))}

                     <XAxis 
                       dataKey="timestamp" 
                       tickLine={false} 
                       axisLine={false} 
                       tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} 
                       dy={10}
                       minTickGap={45}
                       tickFormatter={(val) => {
                         const d = new Date(val);
                         return d.toLocaleDateString([], { weekday: 'short', hour: '2-digit' });
                       }}
                     />
                     <YAxis 
                       tickLine={false} 
                       axisLine={false} 
                       tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} 
                       domain={['auto', 'auto']}
                       tickFormatter={(val) => `${val}${activeUnit}`}
                     />
                     
                     {/* Feature #1: Rich Custom Tooltip */}
                     <Tooltip content={<CustomForecastTooltip />} />

                     <Legend 
                       iconType="circle" 
                       wrapperStyle={{ paddingTop: '10px' }}
                       onClick={(e: any) => {
                         if (e && e.dataKey && e.dataKey !== 'blended_consensus' && e.dataKey !== '_envelope_range') {
                           handleModelIsolation(e.dataKey);
                         }
                       }}
                     />

                     {/* Feature #3: Spread Band Envelope Area (Min-Max Shading) */}
                     {viewMode === 'envelope' && (
                       <Area 
                         key="spread-envelope-area"
                         type="monotone"
                         dataKey="_envelope_range"
                         stroke="#3b82f6"
                         strokeWidth={1.5}
                         fill="#3b82f6"
                         fillOpacity={0.16}
                         name="Spread Envelope (Min-Max)"
                         connectNulls
                       />
                     )}
                     
                     {/* Model Lines & Uncertainty Area Bands */}
                     {data.models.map((model, idx) => {
                       if (!enabledModels.has(model.id)) return null;
                       const color = MODEL_COLORS[model.id] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
                       const isIsolated = isolatedModel === model.id;
                       const isDimmed = (isolatedModel && !isIsolated) || (hoveredModel && hoveredModel !== model.id && !isolatedModel);
                       
                       const elements = [];
                       
                       // Uncertainty area band for probabilistic models in lines mode
                       if (viewMode === 'lines' && model.forecast_type === 'probabilistic') {
                          elements.push(
                            <Area 
                               key={`${model.id}-area`}
                               type="monotone"
                               dataKey={`${model.id}_range`}
                               stroke="none"
                               fill={color}
                               fillOpacity={isDimmed ? 0.03 : 0.18}
                               name={`${model.name} Spread`}
                               connectNulls
                            />
                          );
                       }
                       
                       // Model Line (thinner in envelope mode so envelope stands out)
                       elements.push(
                         <Line 
                           key={`${model.id}-line`}
                           type="monotone" 
                           dataKey={model.id} 
                           name={model.name}
                           stroke={color} 
                           strokeWidth={isIsolated ? 3.5 : (viewMode === 'envelope' ? 1.5 : (hoveredModel === model.id ? 3.0 : 2.2))} 
                           strokeOpacity={isDimmed ? 0.2 : (viewMode === 'envelope' && !isIsolated ? 0.6 : 1.0)}
                           dot={false}
                           activeDot={{ r: isIsolated ? 6 : 4 }}
                           connectNulls
                         />
                       );
                       
                       return elements;
                     })}

                     {/* Feature #9: Blended Consensus Dashed Line */}
                     {showBlendedConsensus && (
                       <Line 
                         key="blended-consensus-line"
                         type="monotone"
                         dataKey="blended_consensus"
                         name="Blended Consensus"
                         stroke={MODEL_COLORS['blended_consensus']}
                         strokeWidth={viewMode === 'envelope' ? 3.0 : 2.5}
                         strokeDasharray="4 4"
                         dot={false}
                         activeDot={{ r: 5 }}
                         connectNulls
                       />
                     )}

                     {/* Feature #4 & #6: Timeline Zoom/Pan Interactive Brush Slider */}
                     <Brush 
                       dataKey="timestamp" 
                       height={28} 
                       stroke="#3b82f6" 
                       fill="var(--surface-elevated)" 
                       startIndex={brushRange?.startIndex}
                       endIndex={brushRange?.endIndex}
                       onChange={(r) => setBrushRange(r)}
                       tickFormatter={(val) => {
                         const d = new Date(val);
                         return d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
                       }}
                     />

                   </ComposedChart>
                 </ResponsiveContainer>
               </div>
             </CardContent>
          </Card>

          {/* Model Information & Freshness Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.models.map(model => (
              <Card 
                key={model.id} 
                className={cn(
                  "border-sky-border shadow-sm transition-all", 
                  model.status === 'unavailable' 
                    ? "bg-sky-surface-elevated/30 opacity-70" 
                    : "bg-sky-surface",
                  isolatedModel === model.id && "border-sky-primary ring-1 ring-sky-primary"
                )}
              >
                <CardContent className="p-5 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: MODEL_COLORS[model.id] || '#3b82f6' }}
                        ></span>
                        <h3 className="font-bold text-sky-text-primary text-base">{model.name}</h3>
                      </div>
                      <div className="mt-1.5 flex gap-1.5 flex-wrap">
                        {model.methodology && (
                          <span className="text-[9px] uppercase tracking-wider font-bold text-sky-text-primary bg-sky-surface-elevated px-2 py-0.5 rounded border border-sky-border/60">
                            {model.methodology.replace('_', ' ')}
                          </span>
                        )}
                        {model.forecast_type && (
                          <span className="text-[9px] uppercase tracking-wider font-bold text-sky-text-primary bg-sky-surface-elevated px-2 py-0.5 rounded border border-sky-border/60">
                            {model.forecast_type}
                          </span>
                        )}
                      </div>
                    </div>

                    {model.status === 'unavailable' ? (
                       <span className="text-[10px] uppercase font-bold text-sky-danger bg-sky-danger/10 px-2 py-1 rounded">Unavailable</span>
                    ) : (
                       <span className={cn(
                         "text-[10px] uppercase font-bold px-2 py-1 rounded flex items-center gap-1",
                         model.status === 'stale' ? "text-sky-warning bg-sky-warning/10" : "text-sky-success bg-sky-success/10"
                       )}>
                         <Clock className="w-3 h-3" />
                         {model.status === 'stale' ? 'Stale' : 'Fresh'}
                       </span>
                    )}
                  </div>
                  
                  <p className="text-xs text-sky-text-secondary leading-relaxed mt-1">
                    {model.how_it_forecasts || "Description not available."}
                  </p>
                  
                  {model.status !== 'unavailable' && (
                    <div className="mt-2 flex flex-col gap-1.5 text-[11px] text-sky-text-secondary border-t border-sky-border pt-3 font-mono">
                      <div className="flex justify-between">
                        <span>Model Run Time:</span>
                        <span className="font-semibold text-sky-text-primary">{model.run_time ? new Date(model.run_time).toLocaleString() : '--'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Data Freshness:</span>
                        <span className="font-semibold text-sky-text-primary">{model.age_minutes !== undefined ? `${model.age_minutes} min ago` : '--'}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
