import React from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { ShieldCheck, ShieldAlert, Sun, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface CurrentRiskProps {
  isLoading: boolean;
  current: any;
  alerts: any[];
}

export function CurrentRisk({ isLoading, current, alerts }: CurrentRiskProps) {
  const { t } = useTranslation();
  if (isLoading) {
    return (
      <section className="space-y-5 h-full">
        <h2 className="text-[18px] font-bold text-sky-text-primary tracking-tight">{t('home.current_risk', 'Current Risk Level')}</h2>
        <Skeleton className="h-85 w-full rounded-4xl" />
      </section>
    );
  }

  const hasAlerts = alerts && alerts.length > 0;
  const riskLevel = hasAlerts ? t('home.high_risk', 'High Risk') : t('home.low_risk', 'Low Risk');
  const RiskIcon = hasAlerts ? ShieldAlert : ShieldCheck;
  const isLow = !hasAlerts;

  const getUILabel = (uv: number) => {
    if (uv < 3) return '(Low)';
    if (uv < 6) return '(Moderate)';
    if (uv < 8) return '(High)';
    if (uv < 11) return '(Very High)';
    return '(Extreme)';
  };
  
  const getUVProgress = (uv: number) => {
    return Math.min(100, (uv / 11) * 100);
  };
  
  const uvValue = current?.uvi ?? 0;
  const visibilityVal = current?.visibility ?? 10000;

  return (
    <section className="h-full flex flex-col space-y-5">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-[18px] font-bold text-sky-text-primary tracking-tight">{t('home.risk_analysis', 'Risk Analysis')}</h2>
      </div>
      
      <div className="bg-sky-surface border border-sky-border rounded-xl p-5 flex flex-col h-full hover:border-sky-primary/30 transition-all shadow-sm">
        
        {/* Top Header: Risk Level */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                {!isLow && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-danger opacity-75"></span>}
                <span className={cn("relative inline-flex rounded-full h-3 w-3 shadow-sm", isLow ? "bg-sky-success" : "bg-sky-danger")}></span>
              </span>
              <h3 className="text-lg font-bold text-sky-text-primary tracking-tight">
                {isLow ? "Low Risk" : "Elevated Risk"}
              </h3>
            </div>
            <p className="text-sm font-medium text-sky-text-secondary leading-relaxed mt-1">
              {isLow 
                ? "Conditions are optimal for outdoor activities."
                : (alerts?.[0]?.event || "Severe weather conditions expected.")}
            </p>
          </div>
          <div className={cn("p-2.5 rounded-xl border shadow-sm", isLow ? "bg-sky-success/10 border-sky-success/20 text-sky-success" : "bg-sky-danger/10 border-sky-danger/20 text-sky-danger")}>
            <RiskIcon className="h-5 w-5" />
          </div>
        </div>
        
        {/* Divider */}
        <div className="h-px w-full bg-sky-border my-2" />
        
        {/* Risk Factors List */}
        <div className="flex flex-col gap-5 mt-4">
          {/* UV Index */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-sky-text-secondary font-bold uppercase tracking-wider flex items-center gap-1.5">
                 UV Index
              </span>
              <span className="font-semibold text-sky-text-primary">
                {uvValue} {getUILabel(uvValue)}
              </span>
            </div>
            <div className="h-1.5 w-full bg-sky-surface-interactive rounded-full overflow-hidden">
              <div 
                className={cn("h-full rounded-full transition-all duration-1000", 
                  uvValue > 7 ? "bg-sky-danger" : uvValue > 4 ? "bg-sky-warning" : "bg-sky-success"
                )}
                style={{ width: `${getUVProgress(uvValue)}%` }}
              />
            </div>
          </div>

          {/* Visibility */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-sky-text-secondary font-bold uppercase tracking-wider flex items-center gap-1.5">
                 Visibility
              </span>
              <span className="font-semibold text-sky-text-primary">
                {visibilityVal !== undefined ? `${(visibilityVal > 1000 ? visibilityVal/1000 : visibilityVal).toFixed(0)} ${visibilityVal > 1000 ? 'km' : 'm'}` : '10 km'}
              </span>
            </div>
            <div className="h-1.5 w-full bg-sky-surface-interactive rounded-full overflow-hidden">
              <div 
                className={cn("h-full rounded-full transition-all duration-1000", visibilityVal < 2000 ? "bg-sky-danger" : visibilityVal < 5000 ? "bg-sky-warning" : "bg-sky-success")}
                style={{ width: `${Math.min(100, (visibilityVal / 10000) * 100)}%` }}
              />
            </div>
          </div>
          
          {/* Wind */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-sky-text-secondary font-bold uppercase tracking-wider flex items-center gap-1.5">
                 Wind
              </span>
              <span className="font-semibold text-sky-text-primary">
                {current?.windSpeedKmh ? Math.round(current.windSpeedKmh) : 0} km/h
              </span>
            </div>
            <div className="h-1.5 w-full bg-sky-surface-interactive rounded-full overflow-hidden">
              <div 
                className={cn("h-full rounded-full transition-all duration-1000", (current?.windSpeedKmh ?? 0) > 40 ? "bg-sky-danger" : (current?.windSpeedKmh ?? 0) > 20 ? "bg-sky-warning" : "bg-sky-success")}
                style={{ width: `${Math.min(100, ((current?.windSpeedKmh ?? 0) / 60) * 100)}%` }}
              />
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
