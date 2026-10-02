import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  CloudRain, 
  Loader2, 
  AlertCircle, 
  BarChart3, 
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
  Download,
  ChevronDown,
  ChevronUp,
  Clock,
  Droplets,
  Sun
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

type ClimateRange = '30d' | '90d' | '1y' | '5y' | '10y' | 'custom';

const QUICK_CITIES = ['Pune', 'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Jaipur', 'Ahmedabad'];

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

  // Active chart tab: 'temperature' | 'rainfall' | 'anomalies' | 'cumulative'
  const [activeChartTab, setActiveChartTab] = useState<'temperature' | 'rainfall' | 'anomalies' | 'cumulative'>('temperature');

  // Collapsible toggle for secondary recent observations drill-down
  const [showRecentDrilldown, setShowRecentDrilldown] = useState<boolean>(false);

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
  const yearsComparison = data?.yearsComparison || [];
  const recentHourly = data?.recentHourly || [];

  const rainAnomalyPct = summary.rainAnomalyPct;

  // IMD Standard Rainfall Departure classification
  const rainStatusBadge = useMemo(() => {
    if (rainAnomalyPct == null) return null;
    if (rainAnomalyPct >= 20) {
      return { 
        label: `Excess (+${rainAnomalyPct}%)`, 
        color: 'text-sky-primary bg-sky-primary/10 border-sky-primary/20' 
      };
    }
    if (rainAnomalyPct <= -20) {
      return { 
        label: `Deficient (${rainAnomalyPct}%)`, 
        color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' 
      };
    }
    return { 
      label: `Normal (${rainAnomalyPct > 0 ? '+' : ''}${rainAnomalyPct}%)`, 
      color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' 
    };
  }, [rainAnomalyPct]);

  return (
    <div className="flex flex-col h-full bg-sky-background p-4 md:p-8 overflow-y-auto">
      
      {/* ========================================================================= */}
      {/* TOP HEADER & PRIMARY CLIMATE RANGE CONTROLS                               */}
      {/* ========================================================================= */}
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
              Normals, Anomalies & Trends
            </span>
          </div>
          <p className="text-sky-text-secondary mt-1 text-sm flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-sky-primary" />
            <span className="font-semibold text-sky-text-primary">{data?.city || city}</span>
            <span>•</span>
            <span>What is normal, how this period compares, and detected anomalies</span>
          </p>
        </div>

        {/* Primary Climatological Range Selector (30D, 90D, 1Y, 5Y, 10Y, Custom) */}
        <div className="flex flex-wrap items-center gap-1.5 bg-sky-surface-elevated p-1.5 rounded-xl border border-sky-border shadow-xs">
          {(['30d', '90d', '1y', '5y', '10y'] as ClimateRange[]).map((r) => (
            <Button
              key={r}
              variant="ghost"
              size="sm"
              onClick={() => handleRangeChange(r)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                range === r
                  ? 'bg-sky-primary text-white shadow-xs hover:bg-sky-primary/90 hover:text-white'
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
                ? 'bg-sky-primary text-white shadow-xs'
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

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="flex h-64 items-center justify-center bg-sky-surface rounded-2xl border border-sky-border p-8 mb-6">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-sky-primary" />
            <p className="text-sky-text-secondary font-medium text-sm">
              Computing 10-year climatological baselines, anomalies & multi-year comparisons for {city}...
            </p>
          </div>
        </div>
      )}

      {/* Error Banner */}
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
          {/* ========================================================================= */}
          {/* 1. SKYCAST AI CLIMATE INTELLIGENCE BRIEFING                               */}
          {/* ========================================================================= */}
          <Card className="border-sky-ai/30 bg-gradient-to-r from-sky-ai/5 via-sky-primary/5 to-transparent mb-6 shadow-xs overflow-hidden relative">
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
                  Season: {seasonal.currentSeason || seasonal.season || 'Southwest Monsoon'}
                </span>
                <span>•</span>
                <span>Period: {data.startDate} to {data.endDate} ({summary.totalDays} Days)</span>
                <span>•</span>
                <span className="italic text-sky-text-secondary/80">
                  Climatological Baseline: 10-Year ERA5 Reanalysis Normals (2014–2023)
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ========================================================================= */}
          {/* 2. CORE CONTEXTUAL CLIMATOLOGICAL KPIS (WHAT IS NORMAL & DELTAS)           */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            
            {/* KPI 1: Mean Temperature vs Normal */}
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
                      +{summary.tempAnomaly?.toFixed(1)}°C vs normal
                    </span>
                  ) : (
                    <span className="inline-flex items-center font-bold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
                      <ArrowDownRight className="h-3.5 w-3.5 mr-0.5" />
                      {summary.tempAnomaly?.toFixed(1)}°C vs normal
                    </span>
                  )}
                </div>
                <div className="mt-3 pt-2 border-t border-sky-border/40 text-[11px] text-sky-text-secondary flex justify-between">
                  <span>Range: {summary.lowTemp?.toFixed(1)}° to {summary.peakTemp?.toFixed(1)}°</span>
                  <span>Diurnal: {((summary.peakTemp || 0) - (summary.lowTemp || 0)).toFixed(1)}°C</span>
                </div>
              </CardContent>
            </Card>

            {/* KPI 2: Total Rainfall Accumulation vs Normal */}
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
                    vs normal
                  </span>
                </div>
                <div className="mt-3 pt-2 border-t border-sky-border/40 text-[11px] text-sky-text-secondary flex justify-between">
                  <span>Departure: {summary.rainAnomalyMm > 0 ? '+' : ''}{summary.rainAnomalyMm?.toFixed(1)} mm</span>
                  <span>{summary.rainyDays || 0} wet days</span>
                </div>
              </CardContent>
            </Card>

            {/* KPI 3: Hot Days vs Expected Baseline Normal */}
            <Card className="border-sky-border bg-sky-surface shadow-xs hover:border-sky-primary/40 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-sky-text-secondary uppercase tracking-wider">
                    Hot Days (Tmax ≥ 35°C)
                  </span>
                  <Flame className="h-4 w-4 text-amber-500" />
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-3xl font-black text-sky-text-primary">
                    {summary.hotDays ?? 0} <span className="text-sm font-semibold text-sky-text-secondary">days</span>
                  </span>
                  <span className="text-xs font-medium text-sky-text-secondary">
                    Norm: {summary.baselineHotDays ?? 0} days
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className={`inline-flex items-center font-bold px-2 py-0.5 rounded-md border ${
                    (summary.hotDaysAnomaly || 0) > 0 
                      ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' 
                      : 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
                  }`}>
                    {(summary.hotDaysAnomaly || 0) >= 0 ? `+${summary.hotDaysAnomaly || 0}` : summary.hotDaysAnomaly} vs normal
                  </span>
                  <span className="text-sky-text-secondary/80 text-[11px]">
                    in selected window
                  </span>
                </div>
                <div className="mt-3 pt-2 border-t border-sky-border/40 text-[11px] text-sky-text-secondary flex justify-between">
                  <span>Peak: {summary.peakTemp?.toFixed(1)}°C</span>
                  <span>{summary.peakTempDate ? summary.peakTempDate.slice(5) : ''}</span>
                </div>
              </CardContent>
            </Card>

            {/* KPI 4: Rainy Days vs Expected Baseline Normal */}
            <Card className="border-sky-border bg-sky-surface shadow-xs hover:border-sky-primary/40 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-sky-text-secondary uppercase tracking-wider">
                    Rainy Days (≥ 1.0mm)
                  </span>
                  <Droplets className="h-4 w-4 text-sky-primary" />
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-3xl font-black text-sky-text-primary">
                    {summary.rainyDays ?? 0} <span className="text-sm font-semibold text-sky-text-secondary">days</span>
                  </span>
                  <span className="text-xs font-medium text-sky-text-secondary">
                    Norm: {summary.baselineRainyDays ?? 0} days
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className={`inline-flex items-center font-bold px-2 py-0.5 rounded-md border ${
                    (summary.rainyDaysAnomaly || 0) >= 0 
                      ? 'text-sky-primary bg-sky-primary/10 border-sky-primary/20' 
                      : 'text-amber-500 bg-amber-500/10 border-amber-500/20'
                  }`}>
                    {(summary.rainyDaysAnomaly || 0) >= 0 ? `+${summary.rainyDaysAnomaly || 0}` : summary.rainyDaysAnomaly} vs normal
                  </span>
                  <span className="text-sky-text-secondary/80 text-[11px]">
                    active rain days
                  </span>
                </div>
                <div className="mt-3 pt-2 border-t border-sky-border/40 text-[11px] text-sky-text-secondary flex justify-between">
                  <span>Dry Spell: {extremes.longestDrySpellDays || 0} days</span>
                  <span>Wet Spell: {extremes.longestWetSpellDays || 0} days</span>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* ========================================================================= */}
          {/* 3. MAIN CLIMATOLOGICAL VISUALIZATION CENTER (ACTUAL VS BASELINE CHARTS)    */}
          {/* ========================================================================= */}
          <Card className="border-sky-border bg-sky-surface shadow-xs mb-8">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-sky-border/40 gap-3">
              <div>
                <CardTitle className="text-lg font-bold text-sky-text-primary flex items-center gap-2">
                  {activeChartTab === 'temperature' && 'Temperature Climatology: Actual vs 10-Year Normal Baseline'}
                  {activeChartTab === 'rainfall' && 'Precipitation Analysis: Daily Observations vs Normal Expectation'}
                  {activeChartTab === 'anomalies' && 'Daily Temperature Anomaly Divergence (ΔT from Baseline)'}
                  {activeChartTab === 'cumulative' && 'Cumulative Rainfall Progression vs Normal Climatological Timeline'}
                </CardTitle>
                <CardDescription className="text-xs text-sky-text-secondary mt-0.5">
                  Synchronized day-by-day meteorological trajectory aligned with historical averages
                </CardDescription>
              </div>

              {/* View Selection Toggle */}
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
              <div className="h-[380px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  
                  {/* View 1: Temperature Actual vs Baseline Normal with Diurnal Envelope */}
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
                        strokeWidth={1.5}
                        strokeOpacity={0.7}
                        dot={false}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="actualMinTemp" 
                        name="Daily Min Low" 
                        stroke="#3b82f6" 
                        strokeWidth={1.5}
                        strokeOpacity={0.7}
                        dot={false}
                      />
                    </ComposedChart>
                  )}

                  {/* View 2: Rainfall Observations vs Baseline */}
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

                  {/* View 3: Temperature Anomalies Divergence (Red / Blue) */}
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
                        name="Anomaly vs Normal (Red = Warmer, Blue = Cooler)" 
                        shape={(props: any) => {
                          const { x, y, width, height, value } = props;
                          const fill = value >= 0 ? '#ef4444' : '#3b82f6';
                          return <rect x={x} y={y} width={width} height={height} fill={fill} rx={3} />;
                        }}
                        maxBarSize={24}
                      />
                    </ComposedChart>
                  )}

                  {/* View 4: Cumulative Rainfall Progression vs Normal Timeline */}
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

          {/* ========================================================================= */}
          {/* 4. YEAR-OVER-YEAR HISTORICAL COMPARISON MATRIX                            */}
          {/* ========================================================================= */}
          <Card className="border-sky-border bg-sky-surface shadow-xs mb-8">
            <CardHeader className="pb-3 border-b border-sky-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold text-sky-text-primary flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-sky-primary" />
                    Multi-Year Climatological Comparison Matrix
                  </CardTitle>
                  <CardDescription className="text-xs text-sky-text-secondary mt-0.5">
                    Benchmarking the exact calendar window ({data.startDate.slice(5)} to {data.endDate.slice(5)}) across recent years and 10-year normals
                  </CardDescription>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-sky-surface-elevated border border-sky-border text-sky-text-secondary">
                  Same Calendar Dates
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-sky-border/60 text-sky-text-secondary font-bold uppercase tracking-wider">
                      <th className="py-2.5 px-3">Period / Year</th>
                      <th className="py-2.5 px-3">Mean Temp</th>
                      <th className="py-2.5 px-3">Total Rainfall</th>
                      <th className="py-2.5 px-3">Rainy Days</th>
                      <th className="py-2.5 px-3">Hot Days (≥35°)</th>
                      <th className="py-2.5 px-3">Peak Temp</th>
                      <th className="py-2.5 px-3">Climate Departure</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-border/30">
                    {yearsComparison.map((row: any, idx: number) => {
                      const isCurrent = row.isCurrent;
                      return (
                        <tr 
                          key={idx} 
                          className={`transition-colors ${
                            isCurrent 
                              ? 'bg-sky-primary/10 font-bold text-sky-text-primary' 
                              : 'hover:bg-sky-surface-elevated/50 text-sky-text-secondary'
                          }`}
                        >
                          <td className="py-3 px-3 flex items-center gap-2">
                            {isCurrent && (
                              <span className="h-2 w-2 rounded-full bg-sky-primary animate-pulse" />
                            )}
                            <span className={isCurrent ? 'text-sky-primary font-bold' : 'font-medium'}>
                              {row.label}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-semibold text-sky-text-primary">
                            {row.avgTemp != null ? `${row.avgTemp.toFixed(1)}°C` : '--'}
                          </td>
                          <td className="py-3 px-3 font-semibold text-sky-text-primary">
                            {row.totalRain != null ? `${row.totalRain.toFixed(1)} mm` : '--'}
                          </td>
                          <td className="py-3 px-3">
                            {row.rainyDays ?? '--'} days
                          </td>
                          <td className="py-3 px-3">
                            {row.hotDays ?? 0} days
                          </td>
                          <td className="py-3 px-3">
                            {row.peakTemp != null ? `${row.peakTemp.toFixed(1)}°C` : '--'}
                          </td>
                          <td className="py-3 px-3">
                            {row.year === 'Normal' ? (
                              <span className="text-[11px] font-mono text-sky-text-secondary">
                                Reference Baseline
                              </span>
                            ) : row.totalRain != null && summary.baselineRainTotal ? (
                              <span className={`inline-flex items-center text-[11px] font-bold px-1.5 py-0.5 rounded ${
                                row.totalRain >= summary.baselineRainTotal * 1.2
                                  ? 'text-sky-primary bg-sky-primary/10'
                                  : row.totalRain <= summary.baselineRainTotal * 0.8
                                  ? 'text-amber-500 bg-amber-500/10'
                                  : 'text-emerald-500 bg-emerald-500/10'
                              }`}>
                                {row.totalRain >= summary.baselineRainTotal * 1.2 ? 'Excess Rain' :
                                 row.totalRain <= summary.baselineRainTotal * 0.8 ? 'Deficient Rain' : 'Normal'}
                              </span>
                            ) : '--'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* ========================================================================= */}
          {/* 5. SEASONAL PATTERNS & 4 INDIAN METEOROLOGICAL SEASONS                     */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            
            {/* 12-Month Climatological Annual Cycle Chart */}
            <Card className="lg:col-span-2 border-sky-border bg-sky-surface shadow-xs">
              <CardHeader className="pb-2 border-b border-sky-border/40">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold text-sky-text-primary flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-sky-primary" />
                      12-Month Normal Climatological Cycle
                    </CardTitle>
                    <CardDescription className="text-xs text-sky-text-secondary">
                      Long-term average monthly rainfall and temperature distribution across the year
                    </CardDescription>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-surface-elevated text-sky-text-secondary">
                    Annual Rain: {seasonal.annualNormalRain || 0}mm
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={seasonal.months || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis 
                        dataKey="month" 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} 
                      />
                      <YAxis 
                        yAxisId="rain"
                        orientation="left"
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                        tickFormatter={(val) => `${val}mm`}
                      />
                      <YAxis 
                        yAxisId="temp"
                        orientation="right"
                        domain={['dataMin - 3', 'dataMax + 3']}
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                        tickFormatter={(val) => `${val}°`}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '10px' }}
                        formatter={(value: any, name: any) => [
                          name.includes('Rain') ? `${value} mm` : `${value}°C`,
                          name
                        ]}
                      />
                      <Legend verticalAlign="top" height={30} iconType="circle" />
                      <Bar 
                        yAxisId="rain" 
                        dataKey="normalRain" 
                        name="Normal Monthly Rain" 
                        fill="var(--accent)" 
                        radius={[3, 3, 0, 0]} 
                      />
                      <Line 
                        yAxisId="temp" 
                        type="monotone" 
                        dataKey="normalMeanTemp" 
                        name="Normal Mean Temp" 
                        stroke="#ef4444" 
                        strokeWidth={2} 
                        dot={{ r: 3 }} 
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Indian Seasons Grid (4 Meteorological Seasons) */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-sky-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                <Sun className="h-4 w-4 text-amber-500" />
                4 Indian Meteorological Seasons
              </h3>
              
              {(seasonal.seasons || []).map((s: any) => (
                <div 
                  key={s.id}
                  className={`p-3 rounded-xl border text-xs transition-all ${
                    s.isActive 
                      ? 'bg-sky-primary/10 border-sky-primary/40 shadow-xs' 
                      : 'bg-sky-surface border-sky-border/60 hover:border-sky-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sky-text-primary text-sm flex items-center gap-1.5">
                      {s.name}
                      {s.isActive && (
                        <span className="text-[10px] px-2 py-0.2 rounded-full font-bold bg-sky-primary text-white">
                          Current Season
                        </span>
                      )}
                    </span>
                    <span className="text-sky-text-secondary text-[11px] font-mono">
                      {s.months}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sky-text-secondary text-[11px] mb-1.5">
                    <span>Temp: <strong className="text-sky-text-primary">{s.normalMeanTemp}°C</strong></span>
                    <span>•</span>
                    <span>Rain: <strong className="text-sky-text-primary">{s.normalTotalRain}mm</strong></span>
                    <span>•</span>
                    <span>Rainy Days: <strong className="text-sky-text-primary">{s.normalRainyDays}</strong></span>
                  </div>
                  <p className="text-[11px] text-sky-text-secondary leading-snug line-clamp-2">
                    {s.description}
                  </p>
                </div>
              ))}
            </div>

          </div>

          {/* ========================================================================= */}
          {/* 6. DETECTED EXTREME EVENTS & METEOROLOGICAL THRESHOLDS                    */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            
            <Card className="lg:col-span-2 border-sky-border bg-sky-surface shadow-xs">
              <CardHeader className="pb-3 border-b border-sky-border/40">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold text-sky-text-primary flex items-center gap-2">
                      <Flame className="h-4 w-4 text-amber-500" />
                      Detected Climatological Threshold Breaches & Events
                    </CardTitle>
                    <CardDescription className="text-xs text-sky-text-secondary">
                      Statistically significant deviations from local 10-year normals during this period
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs px-2 py-1 rounded bg-sky-surface-elevated font-semibold text-sky-text-secondary border border-sky-border">
                      {extremes.events?.length || 0} Breaches
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
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
              <CardHeader className="pb-3 border-b border-sky-border/40">
                <CardTitle className="text-base font-bold text-sky-text-primary flex items-center gap-2">
                  <Info className="h-4 w-4 text-sky-primary" />
                  Meteorological Reference
                </CardTitle>
                <CardDescription className="text-xs text-sky-text-secondary">
                  Standards and baseline methodology
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-3.5 text-xs text-sky-text-secondary">
                <div>
                  <span className="font-semibold text-sky-text-primary block mb-1">Climatological Normal</span>
                  <p className="text-[11px] leading-relaxed">
                    Baselines are computed from ECMWF ERA5 reanalysis over 2014–2023. Daily averages define what is typical for each calendar date.
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

          {/* ========================================================================= */}
          {/* 7. SECONDARY DRILL-DOWN: RECENT HOURLY SYNOPTIC OBSERVATIONS (48 HOURS)   */}
          {/* ========================================================================= */}
          {recentHourly && recentHourly.length > 0 && (
            <Card className="border-sky-border bg-sky-surface shadow-xs mb-8 overflow-hidden">
              <div 
                onClick={() => setShowRecentDrilldown(!showRecentDrilldown)}
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-sky-surface-elevated/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-lg bg-sky-primary/10 text-sky-primary">
                    <Clock className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="font-bold text-sm text-sky-text-primary flex items-center gap-2">
                      Recent Synoptic Observations (Hourly Drill-Down)
                      <span className="text-[11px] font-normal text-sky-text-secondary">
                        (48 Hours)
                      </span>
                    </h3>
                    <p className="text-xs text-sky-text-secondary">
                      Drill down into recent hourly station records without leaving climate context
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-sky-text-secondary">
                  {showRecentDrilldown ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>

              {showRecentDrilldown && (
                <div className="p-4 border-t border-sky-border/40 animate-in fade-in">
                  <div className="h-[240px] w-full mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={recentHourly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis 
                          dataKey="time" 
                          tickLine={false} 
                          axisLine={false} 
                          tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                          tickFormatter={(val) => val.slice(11, 16)} 
                          minTickGap={20}
                        />
                        <YAxis 
                          tickLine={false} 
                          axisLine={false} 
                          tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                          tickFormatter={(val) => `${val}°`}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '10px' }}
                          formatter={(value: any, name: any) => [`${value}°C`, name]}
                        />
                        <Legend verticalAlign="top" height={30} iconType="circle" />
                        <Line 
                          type="monotone" 
                          dataKey="temperature" 
                          name="Hourly Temperature" 
                          stroke="var(--accent)" 
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="dewpoint" 
                          name="Dewpoint" 
                          stroke="#38bdf8" 
                          strokeWidth={1.5}
                          strokeDasharray="2 2"
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Hourly stats summary chips */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-2.5 rounded-lg bg-sky-surface-elevated border border-sky-border/50">
                      <span className="text-[11px] text-sky-text-secondary block">Latest Hourly Temp</span>
                      <span className="font-bold text-sky-text-primary text-base">
                        {recentHourly[recentHourly.length - 1]?.temperature?.toFixed(1)}°C
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-sky-surface-elevated border border-sky-border/50">
                      <span className="text-[11px] text-sky-text-secondary block">Relative Humidity</span>
                      <span className="font-bold text-sky-text-primary text-base">
                        {recentHourly[recentHourly.length - 1]?.humidity}%
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-sky-surface-elevated border border-sky-border/50">
                      <span className="text-[11px] text-sky-text-secondary block">Wind Speed</span>
                      <span className="font-bold text-sky-text-primary text-base">
                        {recentHourly[recentHourly.length - 1]?.windSpeed?.toFixed(1)} km/h
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-sky-surface-elevated border border-sky-border/50">
                      <span className="text-[11px] text-sky-text-secondary block">Latest Timestamp</span>
                      <span className="font-mono text-[11px] text-sky-text-primary">
                        {recentHourly[recentHourly.length - 1]?.time}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}

        </>
      )}

    </div>
  );
}
