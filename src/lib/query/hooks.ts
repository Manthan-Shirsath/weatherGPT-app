import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { weatherApi } from '../api/client';

// ─────────────────────────────────────────────────────────────────────────────
// Query Key Factory — stable, hierarchical keys for targeted invalidation
// ─────────────────────────────────────────────────────────────────────────────

export const weatherKeys = {
  all: ['weather'] as const,
  dashboard: (city: string) => ['weather', 'dashboard', city] as const,
  current: (city: string) => ['weather', 'current', city] as const,
  hourly: (city: string) => ['weather', 'hourly', city] as const,
  daily: (city: string) => ['weather', 'daily', city] as const,
  alerts: (city: string) => ['weather', 'alerts', city] as const,
  airQuality: (city: string) => ['weather', 'air-quality', city] as const,
  forecast: (city: string) => ['weather', 'forecast', city] as const,
};

export const monitorKeys = {
  all: ['monitors'] as const,
  list: (location?: string) => ['monitors', 'list', location || 'all'] as const,
  detail: (id: string) => ['monitors', 'detail', id] as const,
};

export const alertKeys = {
  all: ['alerts'] as const,
  active: (location?: string) => ['alerts', 'active', location || 'all'] as const,
  history: (location?: string) => ['alerts', 'history', location || 'all'] as const,
  detail: (id: string) => ['alerts', 'detail', id] as const,
};

export const chatKeys = {
  all: ['chat'] as const,
  session: (sessionId: string) => ['chat', 'session', sessionId] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Weather Data Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useDashboard(city: string) {
  return useQuery({
    queryKey: weatherKeys.dashboard(city),
    queryFn: () => weatherApi.getDashboard(city),
    enabled: !!city,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useCurrentWeather(city: string) {
  return useQuery({
    queryKey: weatherKeys.current(city),
    queryFn: () => weatherApi.getCurrent(city),
    enabled: !!city,
    staleTime: 5 * 60 * 1000,
  });
}

export function useHourlyForecast(city: string) {
  return useQuery({
    queryKey: weatherKeys.hourly(city),
    queryFn: () => weatherApi.getHourly(city),
    enabled: !!city,
    staleTime: 15 * 60 * 1000,
  });
}

export function useDailyForecast(city: string) {
  return useQuery({
    queryKey: weatherKeys.daily(city),
    queryFn: () => weatherApi.getDaily(city),
    enabled: !!city,
    staleTime: 15 * 60 * 1000,
  });
}

export function useAlerts(city: string) {
  return useQuery({
    queryKey: weatherKeys.alerts(city),
    queryFn: () => weatherApi.getAlerts(city),
    enabled: !!city,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAirQuality(city: string) {
  return useQuery({
    queryKey: weatherKeys.airQuality(city),
    queryFn: () => weatherApi.getAirQuality(city),
    enabled: !!city,
    staleTime: 15 * 60 * 1000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat / WeatherGPT Hooks
// ─────────────────────────────────────────────────────────────────────────────

export type ChatRequest = {
  message: string;
  city: string;
  session_id?: string | null;
  agent_mode?: string;
  context?: Record<string, any>;
};

export type ChatResponse = {
  reply: string;
  city: string;
  timestamp: string;
  session_id?: string;
  cards?: Array<{ type: string; data: any }>;
  sources?: Array<{ type?: string; timestamp?: string; provider?: string }>;
  data_status?: 'fresh' | 'stale' | 'degraded';
  conversation_context?: Record<string, any>;
  is_fallback?: boolean;
  summary?: string;
  conditions?: Record<string, any>;
  forecast?: Record<string, any>;
  risks?: Array<{ hazard: string; severity: string; impact?: string; advice?: string }>;
  recommendations?: Array<{ category: string; action: string; reason?: string; suitability?: string; time_window?: string; source?: string }>;
  uncertainty?: { level: 'high' | 'moderate' | 'low'; explanation: string; source_disagreement?: boolean; disagreement_details?: string };
  freshness?: { status?: string; timestamp?: string; sources_count?: number };
  follow_up_questions?: string[];
};

export function useWeatherGPT() {
  return useMutation<ChatResponse, Error, ChatRequest>({
    mutationFn: ({ message, city, session_id, agent_mode, context }) =>
      weatherApi.chat(message, city, [], { session_id, agent_mode, ...context }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Weather Monitor & Alert Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useMonitors(location?: string, enabledOnly?: boolean) {
  return useQuery({
    queryKey: monitorKeys.list(location),
    queryFn: () => weatherApi.getMonitors(location, enabledOnly),
    staleTime: 30 * 1000,
  });
}

export function useTriggeredAlerts(location?: string, status?: string) {
  return useQuery({
    queryKey: status === 'active' ? alertKeys.active(location) : alertKeys.history(location),
    queryFn: () => weatherApi.getTriggeredAlerts(location, status),
    staleTime: 15 * 1000,
  });
}

export function useCreateMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => weatherApi.createMonitor(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: monitorKeys.all });
      if (variables?.location) {
        queryClient.invalidateQueries({ queryKey: monitorKeys.list(variables.location) });
      }
    },
  });
}

export function useUpdateMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { enabled?: boolean; threshold?: number } }) =>
      weatherApi.updateMonitor(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: monitorKeys.all });
    },
  });
}

export function useDeleteMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => weatherApi.deleteMonitor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: monitorKeys.all });
    },
  });
}

