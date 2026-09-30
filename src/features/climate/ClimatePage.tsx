import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  CloudRain, 
  Loader2, 
  AlertCircle, 
  BarChart3, 
  TrendingDown, 
  TrendingUp, 
  Sparkles, 
  Calendar, 
  Thermometer, 
  Flame, 
  Snowflake, 
  Info,
  ArrowUpRight,
  ArrowDownRight,
  MapPin,
  Download
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Line, 
  Area, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ReferenceLine 
} from 'recharts';
import { Button } from '@/components/ui/Button';
import { apiFetch } from '@/lib/api';

type ClimateRange = '7d' | '30d' | '90d' | '1y' | '5y' | '10y' | 'custom';

const QUICK_CITIES = ['Pune', 'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata'];

export default function ClimatePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const city = searchParams.get('city') || 'Pune';
  const rangeParam = (searchParams.get('range') as ClimateRange) || '30d';
  
  const [range, setRange] = useState<ClimateRange>(rangeParam);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Custom date range state
  const [customStart, setCustomStart] = useState<string>('2026-08-01');
  const [customEnd, setCustomEnd] = useState<string>('2026-09-30');
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);

  // Active sub-view tab: 'overview' | 'temperature' | 'rainfall' | 'anomalies'
  const [activeChartTab, setActiveChartTab] = useState<'temperature' | 'rainfall' | 'anomalies' | 'cumulative'>('temperature');

  // Sync state to URL
  const handleRangeChange = (newRange: ClimateRange) => {
    setRange(newRange);
    setSearchParams({ city, range: newRange });
  };

  const handleCityChange = (newCity: string) => {
    setSearchParams({ city: newCity, range });
  };

  useEffect(() => {
    let isMounted = true;
    async function fetchClimateIntelligence() {
      setLoading(true);
      setError(null);
      try {
        let url = `/api/climate/intelligence?city=${encodeURIComponent(city)}&range=${range}`;
        if (range === 'custom') {
          url += `&start_date=${customStart}&end_date=${customEnd}`;
        }
        const res = await apiFetch(url);
        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}`);
        }
        const json = await res.json();
        if (isMounted) {
          if (json.status === 'error') {
            setError(json.error || 'Failed to load climate intelligence.');
          } else {
            setData(json);
          }
        }
      } catch (err: any) {
        console.error('Failed to fetch climate intelligence:', err);
        if (isMounted) {
          setError(err.message || 'Error communicating with climate services.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchClimateIntelligence();
    return () => {
      isMounted = false;
    };
  }, [city, range, customStart, customEnd]);

  const summary = data?.summary || {};
  const extremes = data?.extremes || {};
  const seasonal = data?.seasonal || {};
  const aiInsight = data?.aiInsight || {};
  const timeseries = data?.timeseries || [];

  const rainAnomalyPct = summary.rainAnomalyPct;

  // Departure classification
  const rainStatusBadge = useMemo(() => {
    if (rainAnomalyPct == null) return null;
    if (rainAnomalyPct >= 20) return { label: `Excess (+${rainAnomalyPct}%)`, color: 'text-sky-primary bg-sky-primary/10 border-sky-primary/20' };
    if (rainAnomalyPct <= -20) return { label: `Deficient (${rainAnomalyPct}%)`, color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
    return { label: `Normal (${rainAnomalyPct > 0 ? '+' : ''}${rainAnomalyPct}%)`, color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' };
  }, [rainAnomalyPct]);

  return (
    <div className="flex flex-col h-full bg-sky-background p-4 md:p-8 overflow-y-auto">
      
      {/* Top Header & Range Controls */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-sky-primary/10 text-sky-primary">
              <BarChart3 className="h-6 w-6" />
            </span>
            <h1 className="text-2xl md:text-3xl font-bold text-sky-text-primary tracking-tight">
              Climate Intelligence
            </h1>
            <span className="text-xs px-2.5 py-0.5 font-semibold rounded-full bg-sky-ai/10 text-sky-ai border border-sky-ai/20">
              Climatology & Extremes
            </span>
          </div>
          <p className="text-sky-text-secondary mt-1 text-sm flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-sky-primary" />
            <span className="font-semibold text-sky-text-primary">{data?.city || city}</span>
            <span>•</span>
            <span>Historical Baseline Normals & Observed Anomalies</span>
          </p>
        </div>

        {/* Range Selector */}
        <div className="flex flex-wrap items-center gap-1.5 bg-sky-surface-elevated p-1.5 rounded-xl border border-sky-border shadow-sm">
          {(['7d', '30d', '90d', '1y', '5y', '10y'] as ClimateRange[]).map((r) => (
            <Button
              key={r}
              variant="ghost"
              size="sm"
              onClick={() => handleRangeChange(r)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                range === r
                  ? 'bg-sky-primary text-white shadow-sm hover:bg-sky-primary/90 hover:text-white'
                  : 'text-sky-text-secondary hover:text-sky-text-primary hover:bg-sky-surface'
              }`}
            >
              {r.toUpperCase()}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCustomModal(!showCustomModal)}
            className={`px-3 py-1 text-xs font-bold rounded-lg ${
              range === 'custom'
                ? 'bg-sky-primary text-white shadow-sm'
                : 'text-sky-text-secondary hover:text-sky-text-primary'
            }`}
          >
            <Calendar className="h-3 w-3 mr-1" />
            Custom
          </Button>
        </div>
      </div>

      {/* Quick City Selector Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none">
        <span className="text-xs font-bold uppercase tracking-wider text-sky-text-secondary whitespace-nowrap mr-1">
          Quick Explore:
        </span>
        {QUICK_CITIES.map((c) => (
          <button
            key={c}
            onClick={() => handleCityChange(c)}
            className={`text-xs px-3 py-1 rounded-full font-medium transition-colors border ${
              city.toLowerCase() === c.toLowerCase()
                ? 'bg-sky-primary text-white border-sky-primary shadow-xs'
                : 'bg-sky-surface text-sky-text-secondary border-sky-border hover:border-sky-primary/40 hover:text-sky-text-primary'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Custom Date Range Collapsible */}
      {showCustomModal && (
        <Card className="border-sky-border bg-sky-surface mb-6 p-4 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="text-xs font-semibold text-sky-text-secondary block mb-1">Start Date</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-sky-background border border-sky-border rounded-lg px-3 py-1.5 text-xs text-sky-text-primary focus:outline-none focus:ring-1 focus:ring-sky-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-sky-text-secondary block mb-1">End Date</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-sky-background border border-sky-border rounded-lg px-3 py-1.5 text-xs text-sky-text-primary focus:outline-none focus:ring-1 focus:ring-sky-primary"
              />
            </div>
            <div className="self-end">
              <Button
                size="sm"
                onClick={() => {
                  setRange('custom');
                  setShowCustomModal(false);
                }}
                className="bg-sky-primary text-white text-xs font-bold"
              >
                Apply Custom Range
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Loading Skeleton & Error Handlers */}
      {loading && !data && (
        <div className="flex h-64 items-center justify-center bg-sky-surface rounded-2xl border border-sky-border p-8 mb-6">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-sky-primary" />
            <p className="text-sky-text-secondary font-medium text-sm">
              Computing climatological baseline & anomalies for {city}...
            </p>
          </div>
        </div>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20 mb-6 p-5">
          <div className="flex items-start gap-3 text-red-600 dark:text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm">Climate Data Error</h3>
              <p className="text-xs text-red-700/80 dark:text-red-300/80 mt-0.5">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRangeChange(range)}
                className="mt-3 text-xs border-red-300 hover:bg-red-100"
              >
                Retry Request
              </Button>
            </div>
          </div>
        </Card>
      )}

      {data && (
        <>
          {/* 1. SkyCast AI Climate Insight Briefing */}
          <Card className="border-sky-ai/30 bg-gradient-to-r from-sky-ai/5 via-sky-primary/5 to-transparent mb-6 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 right-0 p-3 opacity-15 pointer-events-none">
              <Sparkles className="h-24 w-24 text-sky-ai" />
            </div>
            <CardContent className="p-5 md:p-6">
              <div className="flex items-center gap-2 text-sky-ai font-bold text-xs uppercase tracking-wider mb-2">
                <Sparkles className="h-4 w-4" />
                SkyCast Climatological Intelligence Brief
              </div>
              <h2 className="text-lg md:text-xl font-bold text-sky-text-primary mb-2">
                {aiInsight.headline || `${city} Climate Analysis`}
              </h2>
              <p className="text-sm text-sky-text-secondary leading-relaxed max-w-4xl">
                {aiInsight.narrative}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-sky-text-secondary border-t border-sky-border/40 pt-3">
                <span className="font-semibold text-sky-text-primary">
                  Season: {seasonal.season || 'Current Period'}
                </span>
                <span>•</span>
                <span>Period: {data.startDate} to {data.endDate} ({summary.totalDays} Days)</span>
                <span>•</span>
                <span className="italic text-sky-text-secondary/80">
                  Baseline: 10-Yr Reanalysis Normals (2014-2023)
                </span>
              </div>
            </CardContent>
          </Card>

          {/* 2. Core Climatological KPI Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            
            {/* KPI 1: Temperature & Baseline */}
            <Card className="border-sky-border bg-sky-surface shadow-xs hover:border-sky-primary/40 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-sky-text-secondary uppercase tracking-wider">
                    Average Temperature
                  </span>
                  <Thermometer className="h-4 w-4 text-sky-primary" />
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-3xl font-black text-sky-text-primary">
                    {summary.actualMeanTemp?.toFixed(1) ?? '--'}°C
                  </span>
                  <span className="text-xs font-medium text-sky-text-secondary">
                    Norm: {summary.baselineMeanTemp?.toFixed(1) ?? '--'}°C
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {summary.tempAnomaly >= 0 ? (
                    <span className="inline-flex items-center font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/20">
                      <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" />
                      +{summary.tempAnomaly?.toFixed(1)}°C Anomaly
                    </span>
                  ) : (
                    <span className="inline-flex items-center font-bold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
                      <ArrowDownRight className="h-3.5 w-3.5 mr-0.5" />
                      {summary.tempAnomaly?.toFixed(1)}°C Anomaly
                    </span>
                  )}
                  <span className="text-sky-text-secondary/80 text-[11px]">vs normal</span>
                </div>
              </CardContent>
            </Card>

            {/* KPI 2: Rainfall Accumulation & Departure */}
            <Card className="border-sky-border bg-sky-surface shadow-xs hover:border-sky-primary/40 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-sky-text-secondary uppercase tracking-wider">
                    Total Rainfall
                  </span>
                  <CloudRain className="h-4 w-4 text-blue-500" />
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-3xl font-black text-sky-text-primary">
                    {summary.actualRainTotal?.toFixed(1) ?? '0'}mm
                  </span>
                  <span className="text-xs font-medium text-sky-text-secondary">
                    Norm: {summary.baselineRainTotal?.toFixed(1) ?? '0'}mm
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {rainStatusBadge && (
                    <span className={`inline-flex items-center font-bold px-2 py-0.5 rounded-md border ${rainStatusBadge.color}`}>
                      {rainStatusBadge.label}
                    </span>
                  )}
                  <span className="text-sky-text-secondary/80 text-[11px]">
                    ({summary.rainyDays || 0} wet days)
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* KPI 3: Thermal Extremes (Peak & Low) */}
            <Card className="border-sky-border bg-sky-surface shadow-xs hover:border-sky-primary/40 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-sky-text-secondary uppercase tracking-wider">
                    Observed Extremes
                  </span>
                  <div className="flex gap-1 text-sky-text-secondary">
                    <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                    <TrendingDown className="h-3.5 w-3.5 text-blue-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div>
                    <span className="text-[11px] font-semibold text-sky-text-secondary block">Peak High</span>
                    <span className="text-xl font-bold text-red-500 flex items-center">
                      {summary.peakTemp?.toFixed(1) ?? '--'}°
                    </span>
                    <span className="text-[10px] text-sky-text-secondary truncate block">
                      {summary.peakTempDate ? summary.peakTempDate.slice(5) : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-sky-text-secondary block">Min Low</span>
                    <span className="text-xl font-bold text-blue-500 flex items-center">
                      {summary.lowTemp?.toFixed(1) ?? '--'}°
                    </span>
                    <span className="text-[10px] text-sky-text-secondary truncate block">
                      {summary.lowTempDate ? summary.lowTempDate.slice(5) : ''}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* KPI 4: Unusual Periods & Spells */}
            <Card className="border-sky-border bg-sky-surface shadow-xs hover:border-sky-primary/40 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-sky-text-secondary uppercase tracking-wider">
                    Unusual Events & Spells
                  </span>
                  <Flame className="h-4 w-4 text-amber-500" />
                </div>
                <div className="space-y-1.5 mt-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-sky-text-secondary">Unusually Hot Days:</span>
                    <span className="font-bold text-sky-text-primary px-1.5 py-0.5 rounded bg-sky-surface-elevated">
                      {extremes.unusuallyHotDays || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-sky-text-secondary">Longest Dry Spell:</span>
                    <span className="font-bold text-sky-text-primary px-1.5 py-0.5 rounded bg-sky-surface-elevated">
                      {extremes.longestDrySpellDays || 0} days
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-sky-text-secondary">Heavy Rain Days (&gt;35mm):</span>
                    <span className="font-bold text-sky-text-primary px-1.5 py-0.5 rounded bg-sky-surface-elevated">
                      {extremes.heavyRainDays || 0}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* 3. Main Climatological Visualization Center */}
          <Card className="border-sky-border bg-sky-surface shadow-sm mb-6">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-sky-border/40 gap-3">
              <div>
                <CardTitle className="text-lg font-bold text-sky-text-primary flex items-center gap-2">
                  {activeChartTab === 'temperature' && 'Temperature Climatology: Actual vs 10-Year Normal'}
                  {activeChartTab === 'rainfall' && 'Precipitation: Daily Observations vs Climatological Expectation'}
                  {activeChartTab === 'anomalies' && 'Daily Temperature Anomaly Divergence (ΔT)'}
                  {activeChartTab === 'cumulative' && 'Cumulative Rainfall Progression vs Normal Timeline'}
                </CardTitle>
                <CardDescription className="text-xs text-sky-text-secondary mt-0.5">
                  Synchronized day-by-day meteorological trajectory aligned with historical averages
                </CardDescription>
              </div>

              {/* Chart View Toggle Tabs */}
              <div className="flex items-center gap-1 bg-sky-surface-elevated p-1 rounded-lg border border-sky-border shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveChartTab('temperature')}
                  className={`text-xs px-2.5 py-1 font-semibold rounded-md ${
                    activeChartTab === 'temperature'
                      ? 'bg-sky-surface text-sky-primary shadow-xs'
                      : 'text-sky-text-secondary hover:text-sky-text-primary'
                  }`}
                >
                  Temperature
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveChartTab('rainfall')}
                  className={`text-xs px-2.5 py-1 font-semibold rounded-md ${
                    activeChartTab === 'rainfall'
                      ? 'bg-sky-surface text-sky-primary shadow-xs'
                      : 'text-sky-text-secondary hover:text-sky-text-primary'
                  }`}
                >
                  Rainfall
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveChartTab('anomalies')}
                  className={`text-xs px-2.5 py-1 font-semibold rounded-md ${
                    activeChartTab === 'anomalies'
                      ? 'bg-sky-surface text-sky-primary shadow-xs'
                      : 'text-sky-text-secondary hover:text-sky-text-primary'
                  }`}
                >
                  Anomalies
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveChartTab('cumulative')}
                  className={`text-xs px-2.5 py-1 font-semibold rounded-md ${
                    activeChartTab === 'cumulative'
                      ? 'bg-sky-surface text-sky-primary shadow-xs'
                      : 'text-sky-text-secondary hover:text-sky-text-primary'
                  }`}
                >
                  Cumulative
                </Button>
              </div>
            </CardHeader>

            <CardContent className="pt-6">
              <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  
                  {/* View 1: Temperature Actual vs Normal */}
                  {activeChartTab === 'temperature' && (
                    <ComposedChart data={timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis 
                        dataKey="date" 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        tickFormatter={(val) => val.slice(5)} 
                        minTickGap={25}
                      />
                      <YAxis 
                        domain={['auto', 'auto']}
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        tickFormatter={(val) => `${val}°`}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '10px' }}
                        labelStyle={{ color: 'var(--text-primary)', fontWeight: 'bold' }}
                        formatter={(value: any, name: any) => [`${value}°C`, name]}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      <Area 
                        type="monotone" 
                        dataKey="actualMeanTemp" 
                        name="Observed Mean Temp" 
                        stroke="var(--accent)" 
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#tempGradient)"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="baselineMeanTemp" 
                        name="Historical Normal Baseline" 
                        stroke="#94a3b8" 
                        strokeDasharray="4 4" 
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="actualMaxTemp" 
                        name="Daily Max Peak" 
                        stroke="#ef4444" 
                        strokeWidth={1}
                        strokeOpacity={0.6}
                        dot={false}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="actualMinTemp" 
                        name="Daily Min Low" 
                        stroke="#3b82f6" 
                        strokeWidth={1}
                        strokeOpacity={0.6}
                        dot={false}
                      />
                    </ComposedChart>
                  )}

                  {/* View 2: Rainfall Daily vs Normal */}
                  {activeChartTab === 'rainfall' && (
                    <ComposedChart data={timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis 
                        dataKey="date" 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        tickFormatter={(val) => val.slice(5)} 
                        minTickGap={25}
                      />
                      <YAxis 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        tickFormatter={(val) => `${val}mm`}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '10px' }}
                        formatter={(value: any, name: any) => [`${value} mm`, name]}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      <Bar 
                        dataKey="actualRain" 
                        name="Observed Daily Rain" 
                        fill="var(--accent)" 
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="baselineRain" 
                        name="Historical Normal Rain" 
                        stroke="#f59e0b" 
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        dot={false}
                      />
                    </ComposedChart>
                  )}

                  {/* View 3: Temperature Anomalies Divergence */}
                  {activeChartTab === 'anomalies' && (
                    <ComposedChart data={timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis 
                        dataKey="date" 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        tickFormatter={(val) => val.slice(5)} 
                        minTickGap={25}
                      />
                      <YAxis 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        tickFormatter={(val) => `${val > 0 ? '+' : ''}${val}°`}
                      />
                      <ReferenceLine y={0} stroke="var(--text-secondary)" strokeWidth={1.5} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '10px' }}
                        formatter={(value: any) => [`${value > 0 ? '+' : ''}${value}°C`, 'Temperature Anomaly']}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      <Bar 
                        dataKey="tempAnomaly" 
                        name="Anomaly vs Normal" 
                        shape={(props: any) => {
                          const { x, y, width, height, value } = props;
                          const fill = value >= 0 ? '#ef4444' : '#3b82f6';
                          return <rect x={x} y={y} width={width} height={height} fill={fill} rx={3} />;
                        }}
                        maxBarSize={24}
                      />
                    </ComposedChart>
                  )}

                  {/* View 4: Cumulative Rainfall Progression */}
                  {activeChartTab === 'cumulative' && (
                    <ComposedChart data={timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis 
                        dataKey="date" 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        tickFormatter={(val) => val.slice(5)} 
                        minTickGap={25}
                      />
                      <YAxis 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        tickFormatter={(val) => `${val}mm`}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '10px' }}
                        formatter={(value: any, name: any) => [`${value} mm`, name]}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      <Line 
                        type="monotone" 
                        dataKey="cumActualRain" 
                        name="Cumulative Observed Rain" 
                        stroke="var(--accent)" 
                        strokeWidth={3}
                        dot={false}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="cumBaselineRain" 
                        name="Cumulative Normal Rain" 
                        stroke="#94a3b8" 
                        strokeDasharray="4 4" 
                        strokeWidth={2}
                        dot={false}
                      />
                    </ComposedChart>
                  )}

                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* 4. Extremes & Significant Events Timeline */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
            
            <Card className="lg:col-span-2 border-sky-border bg-sky-surface shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-sky-text-primary flex items-center gap-2">
                  <Flame className="h-4 w-4 text-amber-500" />
                  Detected Climatological Threshold Breaches & Events
                </CardTitle>
                <CardDescription className="text-xs text-sky-text-secondary">
                  Statistically significant deviations from local 10-year normals during this period
                </CardDescription>
              </CardHeader>
              <CardContent>
                {extremes.events && extremes.events.length > 0 ? (
                  <div className="space-y-2.5">
                    {extremes.events.map((evt: any, idx: number) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between p-3 rounded-xl bg-sky-surface-elevated/60 border border-sky-border/40 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`p-1.5 rounded-lg ${
                            evt.type === 'heat_spike' ? 'bg-red-500/10 text-red-500' :
                            evt.type === 'cold_spike' ? 'bg-blue-500/10 text-blue-500' :
                            'bg-blue-500/10 text-blue-500'
                          }`}>
                            {evt.type === 'heat_spike' ? <Flame className="h-4 w-4" /> :
                             evt.type === 'cold_spike' ? <Snowflake className="h-4 w-4" /> :
                             <CloudRain className="h-4 w-4" />}
                          </span>
                          <div>
                            <span className="font-bold text-sky-text-primary block">{evt.title}</span>
                            <span className="text-sky-text-secondary text-[11px]">{evt.detail}</span>
                          </div>
                        </div>
                        <span className="font-mono text-sky-text-secondary font-semibold bg-sky-surface px-2 py-1 rounded-md border border-sky-border/50">
                          {evt.date}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-sky-text-secondary text-xs">
                    <p>No severe climatological threshold breaches recorded during this period.</p>
                    <p className="mt-1 text-sky-text-secondary/70">Temperatures and precipitation remained within standard historical tolerance bounds.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Context & Export Card */}
            <Card className="border-sky-border bg-sky-surface shadow-xs flex flex-col justify-between">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-sky-text-primary flex items-center gap-2">
                  <Info className="h-4 w-4 text-sky-primary" />
                  Meteorological Reference
                </CardTitle>
                <CardDescription className="text-xs text-sky-text-secondary">
                  Standards and baseline methodology
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-xs text-sky-text-secondary">
                <div>
                  <span className="font-semibold text-sky-text-primary block mb-1">Climatological Normal</span>
                  <p className="text-[11px] leading-relaxed">
                    Baselines are computed from ECMWF ERA5 reanalysis over 2014-2023. Daily averages define what is typical for each calendar date.
                  </p>
                </div>
                <div>
                  <span className="font-semibold text-sky-text-primary block mb-1">IMD Anomaly Criteria</span>
                  <p className="text-[11px] leading-relaxed">
                    Unusually hot days are marked when daily maximum exceeds normal by ≥ 4.5°C. Precipitation departures: Normal (±19%), Excess (+20% to +59%), Deficient (-20% to -59%).
                  </p>
                </div>
                <div className="pt-2">
                  <a
                    href={`/api/climate/export?city=${encodeURIComponent(city)}&range=${range}`}
                    download
                    className="inline-flex items-center justify-center w-full gap-2 px-3 py-2 rounded-lg bg-sky-surface-elevated border border-sky-border hover:bg-sky-surface hover:text-sky-primary font-semibold text-xs text-sky-text-primary transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download CSV Dataset
                  </a>
                </div>
              </CardContent>
            </Card>

          </div>
        </>
      )}

    </div>
  );
}
