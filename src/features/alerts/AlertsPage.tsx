import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  AlertTriangle, 
  AlertCircle, 
  Loader2, 
  CheckCircle2, 
  Info, 
  Bell, 
  BellOff, 
  Plus, 
  Trash2, 
  Sliders, 
  Clock, 
  Activity, 
  ShieldCheck, 
  RotateCcw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTranslation } from 'react-i18next';
import { 
  useMonitors, 
  useTriggeredAlerts, 
  useCreateMonitor, 
  useUpdateMonitor, 
  useDeleteMonitor,
  useAlerts
} from '@/lib/query/hooks';

export default function AlertsPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const city = searchParams.get('city') || 'Pune';

  // Sub-tabs: 'monitors' | 'triggered' | 'history' | 'official'
  const [activeTab, setActiveTab] = useState<'monitors' | 'triggered' | 'history' | 'official'>('monitors');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Form State
  const [formLocation, setFormLocation] = useState(city);
  const [formRuleType, setFormRuleType] = useState('rain_probability');
  const [formOperator, setFormOperator] = useState('>');
  const [formThreshold, setFormThreshold] = useState('70');
  const [formTimeWindow, setFormTimeWindow] = useState('tomorrow');
  const [formSeverity, setFormSeverity] = useState('warning');
  const [formError, setFormError] = useState<string | null>(null);

  // Queries & Mutations
  const { data: monitorsData, isLoading: monitorsLoading } = useMonitors(city);
  const { data: activeAlertsData, isLoading: activeAlertsLoading } = useTriggeredAlerts(city, 'active');
  const { data: resolvedAlertsData, isLoading: resolvedAlertsLoading } = useTriggeredAlerts(city, 'resolved');
  const { data: officialAlertsData, isLoading: officialLoading } = useAlerts(city);

  const createMutation = useCreateMonitor();
  const updateMutation = useUpdateMonitor();
  const deleteMutation = useDeleteMonitor();

  const monitors = monitorsData?.monitors || [];
  const triggeredAlerts = activeAlertsData?.alerts || [];
  const resolvedAlerts = resolvedAlertsData?.alerts || [];
  
  const officialAlertsList = Array.isArray(officialAlertsData) 
    ? officialAlertsData 
    : (Array.isArray(officialAlertsData?.alerts) ? officialAlertsData.alerts : []);

  // Sync form rule change
  const handleRuleTypeChange = (ruleType: string) => {
    setFormRuleType(ruleType);
    if (ruleType === 'rain_probability') {
      setFormOperator('>');
      setFormThreshold('70');
    } else if (ruleType === 'temperature') {
      setFormOperator('>');
      setFormThreshold('40');
    } else if (ruleType === 'wind') {
      setFormOperator('>');
      setFormThreshold('30');
    } else if (ruleType === 'precipitation') {
      setFormOperator('>');
      setFormThreshold('10');
    } else if (ruleType === 'weather_alert') {
      setFormOperator('==');
      setFormThreshold('1');
    } else if (ruleType === 'forecast_change') {
      setFormOperator('change_gt');
      setFormThreshold('20');
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const thresh = parseFloat(formThreshold);
    if (isNaN(thresh)) {
      setFormError("Threshold must be a valid number.");
      return;
    }

    const metricMap: Record<string, string> = {
      rain_probability: "rain_probability",
      temperature: "temperature_c",
      wind: "wind_speed_kmh",
      precipitation: "precipitation_mm",
      weather_alert: "active_alert",
      forecast_change: "forecast_change"
    };

    try {
      await createMutation.mutateAsync({
        location: formLocation.trim() || city,
        rule_type: formRuleType,
        metric: metricMap[formRuleType],
        operator: formOperator,
        threshold: thresh,
        time_window: formTimeWindow,
        severity: formSeverity as any,
      });
      setShowCreateForm(false);
    } catch (err: any) {
      setFormError(err?.message || "Failed to create monitor rule.");
    }
  };

  return (
    <div className="flex flex-col h-full bg-sky-background p-4 md:p-8 overflow-y-auto">
      
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-sky-text-primary flex items-center gap-3">
            <Activity className="h-8 w-8 text-sky-primary" />
            Weather Intelligence & Monitoring
          </h1>
          <p className="text-sky-text-secondary mt-1">
            Continuous deterministic weather evaluation, active standing rules, and explainable alerts for {city}
          </p>
        </div>

        <Button
          onClick={() => setShowCreateForm(prev => !prev)}
          className="flex items-center gap-2 bg-sky-primary hover:bg-sky-primary/90 text-white shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Create Monitor
        </Button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-sky-border pb-3">
        <button
          onClick={() => setActiveTab('monitors')}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
            activeTab === 'monitors'
              ? "bg-sky-surface-elevated text-sky-text-primary border border-sky-border shadow-xs"
              : "text-sky-text-secondary hover:text-sky-text-primary hover:bg-sky-surface/50"
          )}
        >
          <Sliders className="h-4 w-4 text-sky-primary" />
          Active Monitors ({monitors.length})
        </button>

        <button
          onClick={() => setActiveTab('triggered')}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
            activeTab === 'triggered'
              ? "bg-amber-500/15 text-amber-500 border border-amber-500/30 shadow-xs"
              : "text-sky-text-secondary hover:text-sky-text-primary hover:bg-sky-surface/50"
          )}
        >
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Triggered Alerts ({triggeredAlerts.length})
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
            activeTab === 'history'
              ? "bg-sky-surface-elevated text-sky-text-primary border border-sky-border shadow-xs"
              : "text-sky-text-secondary hover:text-sky-text-primary hover:bg-sky-surface/50"
          )}
        >
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          Resolved History ({resolvedAlerts.length})
        </button>

        <button
          onClick={() => setActiveTab('official')}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
            activeTab === 'official'
              ? "bg-sky-surface-elevated text-sky-text-primary border border-sky-border shadow-xs"
              : "text-sky-text-secondary hover:text-sky-text-primary hover:bg-sky-surface/50"
          )}
        >
          <Bell className="h-4 w-4 text-sky-accent" />
          Meteorological Advisories ({officialAlertsList.length})
        </button>
      </div>

      {/* Create Monitor Form Box */}
      {showCreateForm && (
        <Card className="mb-6 border border-sky-primary/30 bg-sky-surface/95 backdrop-blur shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-sky-text-primary">
              <Plus className="h-5 w-5 text-sky-primary" />
              Create Persistent Weather Monitor
            </CardTitle>
            <CardDescription className="text-sky-text-secondary">
              Standing rules are continuously evaluated against fresh forecasts. No duplicate alerts are spammed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-sm">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-sky-text-secondary mb-1 block">Location</label>
                  <Input
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="e.g. Pune, Nashik"
                    className="bg-sky-surface-elevated text-sky-text-primary"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-sky-text-secondary mb-1 block">Rule Type</label>
                  <select
                    value={formRuleType}
                    onChange={(e) => handleRuleTypeChange(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-sky-surface-elevated border border-sky-border text-sky-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-sky-primary"
                  >
                    <option value="rain_probability">Rain Probability (%)</option>
                    <option value="temperature">Temperature (°C)</option>
                    <option value="wind">Wind Speed (km/h)</option>
                    <option value="precipitation">Precipitation (mm)</option>
                    <option value="weather_alert">Official Alert Exists</option>
                    <option value="forecast_change">Meaningful Forecast Change</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-sky-text-secondary mb-1 block">Operator & Threshold</label>
                  <div className="flex gap-2">
                    <select
                      value={formOperator}
                      onChange={(e) => setFormOperator(e.target.value)}
                      className="w-20 h-10 px-2 rounded-xl bg-sky-surface-elevated border border-sky-border text-sky-text-primary text-sm focus:outline-none"
                    >
                      {formRuleType === 'temperature' ? (
                        <>
                          <option value=">">&gt;</option>
                          <option value="<">&lt;</option>
                        </>
                      ) : formRuleType === 'weather_alert' ? (
                        <option value="==">==</option>
                      ) : formRuleType === 'forecast_change' ? (
                        <option value="change_gt">&gt;</option>
                      ) : (
                        <option value=">">&gt;</option>
                      )}
                    </select>
                    <Input
                      type="number"
                      step="any"
                      value={formThreshold}
                      onChange={(e) => setFormThreshold(e.target.value)}
                      className="bg-sky-surface-elevated text-sky-text-primary flex-1"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-sky-text-secondary mb-1 block">Time Window</label>
                  <select
                    value={formTimeWindow}
                    onChange={(e) => setFormTimeWindow(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-sky-surface-elevated border border-sky-border text-sky-text-primary text-sm focus:outline-none"
                  >
                    <option value="all_day">All Day</option>
                    <option value="today">Today</option>
                    <option value="tomorrow">Tomorrow</option>
                    <option value="morning">Morning (06:00 - 12:00)</option>
                    <option value="afternoon">Afternoon (12:00 - 18:00)</option>
                    <option value="evening">Evening (18:00 - 24:00)</option>
                    <option value="next_24h">Next 24 Hours</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-sky-text-secondary mb-1 block">Severity</label>
                  <select
                    value={formSeverity}
                    onChange={(e) => setFormSeverity(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-sky-surface-elevated border border-sky-border text-sky-text-primary text-sm focus:outline-none"
                  >
                    <option value="info">Info</option>
                    <option value="caution">Caution</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="bg-sky-primary text-white"
                >
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Standing Rule"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* TAB CONTENT */}
      <div className="max-w-5xl">

        {/* 1. ACTIVE MONITORS (Standing Rules) */}
        {activeTab === 'monitors' && (
          <div>
            {monitorsLoading ? (
              <div className="flex py-16 justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-sky-primary" />
              </div>
            ) : monitors.length === 0 ? (
              <Card className="text-center py-12 border-dashed border-sky-border">
                <CardContent className="flex flex-col items-center">
                  <Sliders className="h-10 w-10 text-sky-text-secondary mb-3 opacity-60" />
                  <h3 className="text-lg font-bold text-sky-text-primary mb-1">No Active Weather Monitors</h3>
                  <p className="text-sm text-sky-text-secondary max-w-sm mb-4">
                    Create standing rules like &quot;Alert me if rain probability tomorrow &gt; 70%&quot; to continuously monitor conditions.
                  </p>
                  <Button onClick={() => setShowCreateForm(true)} className="bg-sky-primary text-white">
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Monitor
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {monitors.map((mon: any) => {
                  const isTriggered = mon.state === 'triggered';
                  const isDisabled = !mon.enabled || mon.state === 'disabled';

                  return (
                    <Card 
                      key={mon.id}
                      className={cn(
                        "transition-all border-l-4",
                        isTriggered ? "border-l-amber-500 bg-amber-500/5" :
                        isDisabled ? "border-l-gray-400 bg-gray-500/5 opacity-70" :
                        "border-l-emerald-500 bg-sky-surface"
                      )}
                    >
                      <CardHeader className="pb-2 flex flex-row items-start justify-between">
                        <div>
                          <CardTitle className="text-base font-bold text-sky-text-primary flex items-center gap-2">
                            {mon.rule_type.replace('_', ' ').toUpperCase()}
                            <Badge 
                              variant={isTriggered ? 'destructive' : isDisabled ? 'secondary' : 'default'}
                              className="text-[10px] uppercase font-semibold"
                            >
                              {mon.state}
                            </Badge>
                          </CardTitle>
                          <CardDescription className="text-xs text-sky-text-secondary mt-0.5">
                            {mon.location} • Window: {mon.time_window || 'All day'}
                          </CardDescription>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => updateMutation.mutate({ id: mon.id, updates: { enabled: !mon.enabled } })}
                            title={mon.enabled ? "Disable monitor" : "Enable monitor"}
                            className="p-1.5 rounded-lg hover:bg-sky-surface-elevated text-sky-text-secondary hover:text-sky-text-primary transition-colors"
                          >
                            {mon.enabled ? <Bell className="h-4 w-4 text-emerald-500" /> : <BellOff className="h-4 w-4 text-gray-400" />}
                          </button>

                          <button
                            onClick={() => deleteMutation.mutate(mon.id)}
                            title="Delete monitor"
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-sky-text-secondary hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-2 text-sm">
                        <div className="flex items-center justify-between text-xs py-1 border-t border-sky-border/40">
                          <span className="text-sky-text-secondary">Condition</span>
                          <span className="font-mono font-semibold text-sky-text-primary">
                            {mon.metric} {mon.operator} {mon.threshold}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs py-1">
                          <span className="text-sky-text-secondary">Severity</span>
                          <span className="uppercase text-[10px] font-semibold text-sky-text-primary">{mon.severity}</span>
                        </div>
                        {mon.last_evaluated_at && (
                          <div className="text-[11px] text-sky-text-secondary/80 mt-2 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Evaluated: {new Date(mon.last_evaluated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 2. TRIGGERED ALERTS (Active Events) */}
        {activeTab === 'triggered' && (
          <div>
            {activeAlertsLoading ? (
              <div className="flex py-16 justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-sky-primary" />
              </div>
            ) : triggeredAlerts.length === 0 ? (
              <Card className="text-center py-12 border-dashed border-sky-border">
                <CardContent className="flex flex-col items-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2 opacity-80" />
                  <h3 className="text-lg font-bold text-sky-text-primary mb-1">No Active Triggered Alerts</h3>
                  <p className="text-sm text-sky-text-secondary max-w-sm">
                    Conditions monitored by your standing rules are currently within safe thresholds.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {triggeredAlerts.map((alt: any) => (
                  <Card key={alt.id} className="border-l-4 border-l-amber-500 bg-amber-500/5 shadow-sm">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-base font-bold text-sky-text-primary flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-amber-500" />
                          {alt.rule_type.replace('_', ' ').toUpperCase()} ALERT — {alt.location}
                        </CardTitle>
                        <Badge variant="destructive" className="uppercase text-[10px]">
                          {alt.severity || 'WARNING'}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs text-sky-text-secondary">
                        Triggered at {new Date(alt.triggered_at).toLocaleString()} • Window: {alt.time_window || 'All day'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="p-3 bg-sky-surface-elevated/80 rounded-xl border border-sky-border/60">
                        <div className="text-xs font-semibold text-sky-primary uppercase tracking-wide mb-1 flex items-center gap-1.5">
                          <Info className="h-3.5 w-3.5" />
                          Why did I get this alert?
                        </div>
                        <p className="text-sm text-sky-text-primary leading-relaxed font-medium">
                          {alt.explanation}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-4 text-xs">
                        <div className="bg-sky-surface px-3 py-1.5 rounded-lg border border-sky-border">
                          <span className="text-sky-text-secondary">Observed Value: </span>
                          <span className="font-bold text-amber-500">{alt.actual_value}</span>
                        </div>
                        <div className="bg-sky-surface px-3 py-1.5 rounded-lg border border-sky-border">
                          <span className="text-sky-text-secondary">Threshold: </span>
                          <span className="font-bold text-sky-text-primary">{alt.threshold}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. RESOLVED HISTORY */}
        {activeTab === 'history' && (
          <div>
            {resolvedAlertsLoading ? (
              <div className="flex py-16 justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-sky-primary" />
              </div>
            ) : resolvedAlerts.length === 0 ? (
              <Card className="text-center py-12 border-dashed border-sky-border">
                <CardContent className="flex flex-col items-center">
                  <RotateCcw className="h-10 w-10 text-sky-text-secondary mb-2 opacity-60" />
                  <h3 className="text-lg font-bold text-sky-text-primary mb-1">No Resolved Alert History</h3>
                  <p className="text-sm text-sky-text-secondary max-w-sm">
                    When active triggered alerts subside below safe hysteresis margins, their auditable resolution history appears here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {resolvedAlerts.map((alt: any) => (
                  <Card key={alt.id} className="border-l-4 border-l-emerald-500 bg-sky-surface/80">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-sm font-semibold text-sky-text-primary flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          Resolved: {alt.rule_type.replace('_', ' ').toUpperCase()} — {alt.location}
                        </CardTitle>
                        <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
                          RESOLVED
                        </Badge>
                      </div>
                      <CardDescription className="text-xs text-sky-text-secondary">
                        Triggered {new Date(alt.triggered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Resolved {alt.resolved_at ? new Date(alt.resolved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-xs space-y-1.5">
                      <p className="text-sky-text-primary">
                        {alt.resolution_explanation || `Condition resolved. Observed value dropped to ${alt.resolution_value}.`}
                      </p>
                      <div className="text-[11px] text-sky-text-secondary">
                        Trigger value: {alt.actual_value} | Threshold: {alt.threshold} | Resolution value: {alt.resolution_value}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. METEOROLOGICAL ADVISORIES (Official IMD / Hub Warnings) */}
        {activeTab === 'official' && (
          <div>
            {officialLoading ? (
              <div className="flex py-16 justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-sky-primary" />
              </div>
            ) : officialAlertsList.length === 0 ? (
              <Card className="text-center py-12 border-dashed border-sky-border">
                <CardContent className="flex flex-col items-center">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-4" />
                  <h3 className="text-xl font-bold text-sky-text-primary mb-2">No Active Advisories</h3>
                  <p className="text-sky-text-secondary max-w-md text-sm">
                    There are currently no active official weather advisories or warnings for {city}.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {officialAlertsList.map((alert: any, i: number) => {
                  const isWarning = alert.severity === 'Warning' || alert.severity === 'Severe';
                  const isWatch = alert.severity === 'Watch' || alert.severity === 'Moderate';
                  
                  return (
                    <Card 
                      key={i} 
                      className={cn(
                        "border-l-4 shadow-sm",
                        isWarning ? "border-l-sky-danger bg-sky-danger/5" : 
                        isWatch ? "border-l-sky-warning bg-sky-warning/5" : 
                        "border-l-sky-primary bg-sky-primary/5"
                      )}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-lg flex items-center gap-2 text-sky-text-primary">
                            {isWarning ? <AlertTriangle className="h-5 w-5 text-sky-danger" /> : 
                             isWatch ? <Bell className="h-5 w-5 text-sky-warning" /> : 
                             <Info className="h-5 w-5 text-sky-primary" />}
                            {alert.event || alert.title || 'Weather Advisory'}
                          </CardTitle>
                          <Badge variant={isWarning ? 'destructive' : isWatch ? 'secondary' : 'default'} className="uppercase text-[10px]">
                            {alert.severity || 'Advisory'}
                          </Badge>
                        </div>
                        <CardDescription className="text-sky-text-secondary font-medium mt-1 text-xs">
                          Issued: {alert.effective ? new Date(alert.effective).toLocaleString() : 'Recently'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sky-text-primary text-sm leading-relaxed whitespace-pre-wrap">
                          {alert.description || alert.headline || 'No detailed description available.'}
                        </p>
                        {alert.instruction && (
                          <div className="mt-4 pt-4 border-t border-sky-border/50">
                            <p className="text-sm font-semibold mb-1 opacity-80">Recommended Action</p>
                            <p className="text-sm">
                              {alert.instruction}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
