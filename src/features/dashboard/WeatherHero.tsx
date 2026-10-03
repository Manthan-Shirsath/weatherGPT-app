import React, { useMemo } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Sparkles, MapPin, Droplets, Wind, Thermometer, Navigation, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getTimeOfDay } from '@/lib/weather-visuals';
import { WeatherBackground } from './WeatherBackground';
import { cn } from '@/lib/utils';

interface WeatherHeroProps {
  isLoading: boolean;
  location: any;
  current: any;
  sun: any;
  hourly: any[];
  onOpenWeatherGPT: () => void;
}

export function WeatherHero({ isLoading, location, current, sun, hourly, onOpenWeatherGPT }: WeatherHeroProps) {
  const { t } = useTranslation();
  // Determine date and time to display
  const currentDate = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    }).format(new Date());
  }, []);

  const localTime = useMemo(() => {
    if (hourly && hourly.length > 0 && hourly[0].time) {
      const d = new Date(hourly[0].time);
      if (!isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
      }
    }
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date());
  }, [hourly]);

  // Determine time of day for dynamic background
  const timeOfDay = useMemo(() => {
    const localHour = hourly && hourly.length > 0 ? hourly[0].hour : undefined;
    return getTimeOfDay(localHour, sun?.sunrise, sun?.sunset);
  }, [hourly, sun]);

  // Generate dynamic brief for AI insight
  const aiBrief = useMemo(() => {
    if (!hourly || hourly.length === 0) return t('weathergpt.analyzing', 'Analyzing weather data...');
    const rainChance = hourly.find((h: any) => h.rainChance > 10)?.rainChance || 0;
    const isRaining = rainChance > 20;
    const isWindy = current?.windSpeedKmh > 20;
    
    let brief = "Mostly dry tonight. ";
    if (isWindy) brief += "Breezy conditions. ";
    else brief += "Light winds. ";
    
    if (isRaining) {
      brief += `Expected rain later (${rainChance}% chance).`;
    } else if (current?.condition?.toLowerCase().includes('cloud')) {
      brief += "Cloudy skies. A low chance of rain (20%).";
    } else {
      brief += "Clear skies tonight.";
    }
    return brief;
  }, [hourly, current, t]);

  if (isLoading) {
    return <Skeleton className="w-full h-95 rounded-4xl" />;
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      <section className="relative w-full overflow-hidden rounded-4xl shadow-sm border border-sky-border isolate transition-all duration-700 bg-sky-surface">
        {/* Dynamic Animated CSS Background - subtle now */}
        <div className="absolute inset-0 z-0 opacity-40 mix-blend-overlay">
          <WeatherBackground condition={current?.condition} timeOfDay={timeOfDay} />
        </div>
        
        {/* Layered Gradients */}
        <div className="absolute inset-0 z-0 bg-linear-to-t from-sky-background/90 via-sky-surface/40 to-transparent" />
        <div className="absolute inset-0 z-0 bg-sky-surface/20 backdrop-blur-[2px]" />
        
        <div className="relative z-10 p-5 md:p-8 h-full flex flex-col justify-between">
          
          {/* Top: Location & Date */}
          <div className="flex flex-col gap-1 mb-6">
            <div className="inline-flex items-center space-x-2 w-max">
              <MapPin className="h-5 w-5 text-sky-primary" />
              <h1 className="text-xl font-bold tracking-tight text-sky-text-primary">
                {location?.displayLocation || location?.city || 'Unknown Location'}
              </h1>
            </div>
            <p className="text-sky-text-secondary font-medium text-sm ml-7">
              {currentDate} &bull; {localTime}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
            {/* Left side: Main Temp & Condition */}
            <div>
              <div className="flex items-end gap-3 mb-4">
                <div className="text-[4rem] font-black tracking-tighter leading-none text-sky-text-primary">
                  {current?.tempC !== undefined ? Math.round(current.tempC) : '--'}°
                </div>
                <div className="flex flex-col pb-2">
                  <span className="text-2xl font-bold tracking-tight text-sky-text-primary">
                    {current?.weather_code !== undefined ? t(`weather_codes.${current.weather_code}`) : current?.condition || '--'}
                  </span>
                  <span className="text-sm font-medium text-sky-text-secondary">
                    {t('weather.feels_like')} {current?.feelsLikeC ? Math.round(current.feelsLikeC) : '--'}° &bull; {current?.humidity || 0}% Humidity &bull; {current?.windSpeedKmh ? Math.round(current.windSpeedKmh) : 0} km/h Wind
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px w-full bg-sky-border/60 my-6" />

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div className="flex flex-col gap-1">
                   <span className="text-sky-text-secondary">Sunset</span>
                   <span className="font-semibold text-sky-text-primary">{sun?.sunset ? new Date(sun.sunset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</span>
                </div>
                <div className="flex flex-col gap-1">
                   <span className="text-sky-text-secondary">Visibility</span>
                   <span className="font-semibold text-sky-text-primary">{current?.visibility !== undefined ? `${(current.visibility / 1000).toFixed(1)} km` : '--'}</span>
                </div>
                <div className="flex flex-col gap-1">
                   <span className="text-sky-text-secondary">Pressure</span>
                   <span className="font-semibold text-sky-text-primary">{current?.pressure !== undefined ? `${Math.round(current.pressure)} hPa` : '--'}</span>
                </div>
                <div className="flex flex-col gap-1">
                   <span className="text-sky-text-secondary">UV Index</span>
                   <span className="font-semibold text-sky-text-primary">{current?.uvIndex !== undefined ? current.uvIndex : '0'} Low</span>
                </div>
              </div>
            </div>

            {/* Right side: AI Insight Integration */}
            <div className="flex flex-col justify-end lg:pl-12">
               <div 
                 onClick={onOpenWeatherGPT}
                 className="group/insight cursor-pointer bg-sky-surface-interactive/40 border-l-[3px] border-sky-ai rounded-r-xl p-4 hover:bg-sky-surface-interactive/70 transition-colors"
               >
                 <div className="flex items-center gap-2 mb-2">
                   <Sparkles className="h-4 w-4 text-sky-ai" />
                   <h3 className="text-sky-text-primary font-bold text-sm">SkyCast Intelligence</h3>
                 </div>
                 <p className="text-sm font-medium leading-relaxed text-sky-text-primary line-clamp-3 mb-2">
                   {aiBrief}
                 </p>
                 <span className="text-xs font-semibold text-sky-ai group-hover/insight:underline underline-offset-2 flex items-center gap-1">
                   View analysis <ChevronRight className="h-3 w-3" />
                 </span>
               </div>
            </div>
          </div>
          
        </div>
      </section>
      
      {/* Today at a glance strip */}
      <div className="w-full bg-sky-surface rounded-xl border border-sky-border p-4 flex flex-wrap items-center justify-between sm:justify-start sm:gap-12 md:gap-24">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-sky-text-secondary uppercase tracking-widest mb-1">High</span>
          <span className="text-lg font-black text-sky-text-primary">{hourly && hourly.length > 0 ? Math.max(...hourly.slice(0,24).map(h => h.tempC || 0)) : '--'}°</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-sky-text-secondary uppercase tracking-widest mb-1">Low</span>
          <span className="text-lg font-black text-sky-text-primary">{hourly && hourly.length > 0 ? Math.min(...hourly.slice(0,24).map(h => h.tempC || 0)) : '--'}°</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-sky-text-secondary uppercase tracking-widest mb-1">Rain</span>
          <span className="text-lg font-black text-sky-text-primary">{hourly && hourly.length > 0 ? Math.max(...hourly.slice(0,24).map(h => h.rainChance || 0)) : 0}%</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-sky-text-secondary uppercase tracking-widest mb-1">Wind</span>
          <span className="text-lg font-black text-sky-text-primary">{current?.windSpeedKmh ? Math.round(current.windSpeedKmh) : '--'} km/h</span>
        </div>
      </div>
    </div>
  );
}

