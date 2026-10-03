import React, { useRef } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Droplets, ChevronRight, ChevronLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface HourlyForecastProps {
  isLoading: boolean;
  hourly: any[];
}

export function HourlyForecast({ isLoading, hourly }: HourlyForecastProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -400, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 400, behavior: 'smooth' });
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-[18px] font-bold text-sky-text-primary tracking-tight">Next Hours</h2>
        <Link to="/forecast">
          <Button variant="ghost" size="sm" className="text-sky-primary text-sm font-semibold hover:bg-sky-surface-elevated/80 rounded-xl px-4 py-2 group transition-all">
            View Details 
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </Link>
      </div>
      
      <div className="relative group/scroll">
        <button 
          onClick={scrollLeft}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-sky-surface/90 backdrop-blur-md border border-sky-border shadow-md hover:shadow-lg hover:scale-110 p-2.5 rounded-full opacity-0 group-hover/scroll:opacity-100 transition-all hidden md:flex items-center justify-center text-sky-text-primary"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        {/* Fading Edges for scroll */}
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-linear-to-r from-sky-background to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-12 bg-linear-to-l from-sky-background to-transparent z-10 pointer-events-none" />

        <div 
          ref={scrollRef}
          className="flex space-x-3 overflow-x-auto pb-4 pt-2 hide-scrollbar snap-x snap-mandatory px-2"
        >
          {isLoading ? (
            Array.from({length: 8}).map((_, i) => (
              <Skeleton key={i} className="min-w-25 h-40 rounded-2xl shrink-0" />
            ))
          ) : !hourly || hourly.length === 0 ? (
            <div className="w-full text-center py-10 text-sky-text-secondary bg-sky-surface/50 border border-sky-border rounded-2xl">
              No hourly data available
            </div>
          ) : (
            hourly.slice(0, 24).map((hour: any, idx: number) => {
              const timeDisplay = hour.time || `${hour.hour}:00`;
              const pop = Math.round(hour.precipitation_probability || hour.pop || 0);
              const isNow = idx === 0;

              let iconCode = '01d';
              const cond = (hour.icon || '').toLowerCase();
              if (cond.includes('cloud')) iconCode = '03d';
              if (cond.includes('rain')) iconCode = '09d';
              if (cond.includes('storm')) iconCode = '11d';
              if (cond.includes('snow')) iconCode = '13d';
              if (cond.includes('moon')) iconCode = '01n';

              return (
                <div key={idx} className={cn(
                  "relative min-w-25 shrink-0 text-center snap-start transition-all duration-300 hover:-translate-y-1 rounded-2xl cursor-default group/card overflow-hidden", 
                  isNow 
                    ? "bg-sky-surface-elevated border border-sky-primary/30 shadow-md shadow-sky-primary/5" 
                    : "bg-sky-surface border border-sky-border hover:bg-sky-surface-interactive/50"
                )}>
                  
                  {isNow && (
                    <div className="absolute top-0 left-0 right-0 h-0.75 bg-sky-primary shadow-[0_0_8px_rgba(79,140,255,0.8)]" />
                  )}

                  <div className="p-4 flex flex-col items-center justify-between h-40 space-y-3">
                    <span className={cn("text-[11px] font-bold tracking-wider uppercase", isNow ? "text-sky-primary" : "text-sky-text-secondary")}>
                      {isNow ? 'Now' : timeDisplay}
                    </span>
                    
                    <div className="flex items-center justify-center h-10 w-10 transition-transform group-hover/card:scale-110 duration-300">
                       <img 
                         src={`https://openweathermap.org/img/wn/${iconCode}@2x.png`} 
                         alt="Weather Icon" 
                         className="h-12 w-12 object-contain drop-shadow-md"
                       />
                    </div>
                    
                    <span className={cn("text-xl font-black tracking-tighter", isNow ? "text-sky-text-primary" : "text-sky-text-primary")}>
                      {hour.tempC !== undefined 
                        ? `${Math.round(hour.tempC)}°` 
                        : hour.temp !== undefined && !isNaN(hour.temp) ? `${Math.round(hour.temp)}°` : '--°'}
                    </span>
                    
                    <div className="h-5 flex items-center justify-center w-full">
                      {pop > 0 && (
                        <div className={cn("flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md w-full justify-center transition-colors", 
                          isNow ? "bg-sky-primary/15 text-sky-primary" : "bg-sky-surface-interactive text-sky-primary group-hover/card:bg-sky-primary/10"
                        )}>
                          <Droplets className="h-3 w-3 mr-1" />
                          {pop}%
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}

        </div>

        <button 
          onClick={scrollRight}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-sky-surface/90 backdrop-blur-md border border-sky-border shadow-md hover:shadow-lg hover:scale-110 p-2.5 rounded-full opacity-0 group-hover/scroll:opacity-100 transition-all hidden md:flex items-center justify-center text-sky-text-primary"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>
    </section>
  );
}
