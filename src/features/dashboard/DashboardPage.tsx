import React from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useDashboard } from '@/lib/query/hooks';
import { Button } from '@/components/ui/Button';
import { MapPin, CloudOff, TrendingUp, CalendarDays, ThermometerSun, Wind, CloudRain } from 'lucide-react';
import { WeatherHero } from './WeatherHero';
import { HourlyForecast } from './HourlyForecast';
import { CurrentRisk } from './CurrentRisk';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const navigate = useNavigate();
  const city = searchParams.get('city') || 'Pune';
  
  const { data: dashboard, isLoading, isError } = useDashboard(city);

  if (isError) {
    return (
      <div className="h-62.5 flex items-center justify-center">
        <div className="flex flex-col items-center justify-center h-full space-y-4 p-8 bg-sky-surface border border-sky-border rounded-xl shadow-sm">
          <CloudOff className="h-12 w-12 text-sky-text-secondary opacity-50" />
          <p className="text-sky-danger text-lg font-semibold">{t('home.unavailable', 'Weather data unavailable')}</p>
          <p className="text-sky-text-secondary text-sm max-w-sm text-center">
            {t('home.errorDescription', 'We couldn\'t retrieve the latest data for {{city}}. Please check your connection or try again.', { city })}
          </p>
          <Button onClick={() => window.location.reload()} variant="outline">{t('home.retry', 'Retry')}</Button>
        </div>
      </div>
    );
  }

  const { location: locationData, current, hourly = [], daily = [], alerts, sun } = dashboard || {};

  // Format hourly data for the chart (next 24 hours)
  const chartData = hourly.slice(0, 24).map((h: any) => {
     const timeParts = h.time.split('T');
     const hourStr = timeParts.length > 1 ? timeParts[1].substring(0, 5) : h.time;
     return {
        time: hourStr,
        temp: h.tempC,
        rain: h.rainChance
     }
  });

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto">
      {/* Top Search / Location Bar (Mobile only, Desktop is in AppLayout) */}
      <div className="lg:hidden sticky top-0 z-50 bg-sky-background/80 backdrop-blur-md border-b border-sky-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-sky-text-primary font-medium">
          <MapPin className="h-4 w-4 text-sky-primary" />
          <span className="text-sm">{locationData?.displayLocation || city}</span>
        </div>
      </div>

      <div className="w-full max-w-350 mx-auto px-4 sm:px-6 lg:px-6 py-4 space-y-4 pb-16">
        
        {/* 1. Hero / Current Weather */}
        <WeatherHero 
          isLoading={isLoading} 
          location={locationData} 
          current={current} 
          sun={sun} 
          hourly={hourly} 
          onOpenWeatherGPT={() => navigate('/weathergpt')} 
        />

        {/* 2 & 3. Grid for Forecast and Risk */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <HourlyForecast isLoading={isLoading} hourly={hourly} />
          </div>
          <div className="lg:col-span-1">
            <CurrentRisk isLoading={isLoading} current={current} alerts={alerts} />
          </div>
        </div>

        {/* 4. Forecast Charts */}
        {!isLoading && hourly.length > 0 && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 mt-8">
              <div className="col-span-full">
                <h2 className="text-xl font-bold text-sky-text-primary flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-sky-primary" />
                  {t('forecast.extended', 'Extended Forecast')}
                </h2>
              </div>
              {/* Main Chart */}
              <div className="lg:col-span-2 flex flex-col bg-sky-surface p-5 rounded-xl border border-sky-border shadow-sm">
                <div className="mb-5">
                  <h3 className="text-lg font-bold text-sky-text-primary">{t('forecast.temp_trend', '24-Hour Temperature Trend')}</h3>
                  <p className="text-[13px] text-sky-text-secondary">{t('forecast.expected_vars', 'Expected temperature variations')}</p>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                      <XAxis 
                        dataKey="time" 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} 
                        dy={10}
                        minTickGap={30}
                        tickFormatter={(val) => {
                          const d = new Date(val);
                          if (isNaN(d.getTime())) return val;
                          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        }}
                      />
                      <YAxis 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                        domain={['dataMin - 2', 'dataMax + 2']}
                        tickFormatter={(val) => `${val}°`}
                      />
                      <Tooltip 
                        labelFormatter={(val) => {
                          const d = new Date(val);
                          if (isNaN(d.getTime())) return val;
                          return d.toLocaleString();
                        }}
                        contentStyle={{ backgroundColor: 'var(--surface-elevated)', borderColor: 'var(--border)', borderRadius: '12px', boxShadow: 'var(--shadow-md)', color: 'var(--text-primary)' }}
                        itemStyle={{ color: 'var(--text-primary)' }}
                      />
                      <Area type="monotone" dataKey="temp" stroke="var(--accent)" strokeWidth={3} fillOpacity={1} fill="url(#colorTemp)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Rain Probability Chart */}
              <div className="flex flex-col bg-sky-surface p-5 rounded-xl border border-sky-border shadow-sm">
                <div className="mb-5">
                  <h3 className="text-lg font-bold text-sky-text-primary">{t('forecast.precip_forecast', 'Precipitation')}</h3>
                  <p className="text-[13px] text-sky-text-secondary">Hourly rain probability</p>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                      <XAxis 
                        dataKey="time" 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} 
                        dy={10}
                        minTickGap={30}
                        tickFormatter={(val) => {
                          const d = new Date(val);
                          if (isNaN(d.getTime())) return val;
                          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        }}
                      />
                      <YAxis 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                        domain={[0, 100]}
                        tickFormatter={(val) => `${val}%`}
                      />
                      <Tooltip 
                        labelFormatter={(val) => {
                          const d = new Date(val);
                          if (isNaN(d.getTime())) return val;
                          return d.toLocaleString();
                        }}
                        contentStyle={{ backgroundColor: 'var(--surface-elevated)', borderColor: 'var(--border)', borderRadius: '12px', boxShadow: 'var(--shadow-md)', color: 'var(--text-primary)' }}
                      />
                      <Bar dataKey="rain" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 5. 7-Day Outlook */}
        {!isLoading && daily.length > 0 && (
          <>
            <h2 className="text-xl font-bold text-sky-text-primary mb-4 mt-8 flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-sky-primary" />
              {t('forecast.7_day_outlook', '7-Day Outlook')}
            </h2>
            
            <div className="flex flex-col gap-2 pb-12 max-w-3xl">
              {daily.slice(0, 7).map((day: any, i: number) => {
                const dateObj = new Date(day.date);
                const dayName = i === 0 ? t('common.today', 'Today') : dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                const dateString = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const isToday = i === 0;

                // For a dynamic range bar visualization (mocked range 0-40 degrees for the full scale)
                const minTempGlobal = 0;
                const maxTempGlobal = 40;
                const rangeWidth = maxTempGlobal - minTempGlobal;
                const leftPercent = Math.max(0, ((day.lowC - minTempGlobal) / rangeWidth) * 100);
                const widthPercent = Math.max(5, (((day.highC - day.lowC) / rangeWidth) * 100));

                let iconCode = '01d';
                const cond = (day.condition || '').toLowerCase();
                if (cond.includes('cloud')) iconCode = '03d';
                if (cond.includes('rain')) iconCode = '09d';
                if (cond.includes('storm')) iconCode = '11d';

                return (
                  <div key={i} className={cn(
                    "flex items-center justify-between p-3 rounded-xl transition-all duration-300",
                    isToday ? "bg-sky-surface-elevated border border-sky-primary/20 shadow-sm" : "hover:bg-sky-surface/50 border border-transparent hover:border-sky-border"
                  )}>
                    <div className="w-24 shrink-0 flex flex-col">
                      <span className={cn("font-bold", isToday ? "text-sky-primary" : "text-sky-text-primary")}>{dayName}</span>
                      <span className="text-xs text-sky-text-secondary">{dateString}</span>
                    </div>

                    <div className="flex items-center justify-center w-16 shrink-0">
                      <img 
                         src={`https://openweathermap.org/img/wn/${iconCode}.png`} 
                         alt="Weather Icon" 
                         className="h-8 w-8 object-contain"
                       />
                    </div>

                    <div className="flex-1 flex items-center gap-4 px-4">
                      <span className="w-8 text-right font-medium text-sky-text-secondary text-sm">{Math.round(day.lowC)}°</span>
                      <div className="flex-1 h-1.5 bg-sky-surface-interactive rounded-full overflow-hidden relative">
                         <div 
                           className="absolute top-0 bottom-0 rounded-full bg-linear-to-r from-sky-primary/50 to-sky-danger/80" 
                           style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }} 
                         />
                      </div>
                      <span className="w-8 text-left font-bold text-sky-text-primary text-sm">{Math.round(day.highC)}°</span>
                    </div>

                    <div className="w-20 shrink-0 text-right flex flex-col items-end">
                      {day.rainChance > 0 ? (
                        <span className="text-xs font-bold text-sky-primary flex items-center gap-1">
                          <CloudRain className="h-3 w-3"/> {day.rainChance}%
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-sky-text-muted">Dry</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
