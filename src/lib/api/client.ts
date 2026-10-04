export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Derive WebSocket URL from API URL
const getWsUrl = (baseUrl: string) => {
  if (baseUrl) {
    if (baseUrl.startsWith('http://')) return baseUrl.replace('http://', 'ws://');
    if (baseUrl.startsWith('https://')) return baseUrl.replace('https://', 'wss://');
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  return '';
};

export const WS_BASE_URL = getWsUrl(API_BASE_URL);

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchWithHandler(url: string, options?: RequestInit) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      let errorMessage = `Request failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.detail) {
          errorMessage = errorData.detail;
        }
      } catch {
        // Ignore json parse errors for error responses
      }
      throw new ApiError(response.status, errorMessage);
    }
    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error. Ensure the backend server is running.');
    }
    throw error;
  }
}

export interface WeatherMonitorItem {
  id: string;
  user_id?: string;
  session_id?: string;
  location: string;
  latitude?: number;
  longitude?: number;
  rule_type: string;
  metric: string;
  operator: string;
  threshold: number;
  secondary_threshold?: number;
  time_window?: string;
  severity: 'info' | 'caution' | 'warning' | 'critical';
  enabled: boolean;
  state: 'active' | 'triggered' | 'resolved' | 'disabled';
  last_evaluated_at?: string;
  last_triggered_at?: string;
  last_resolved_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TriggeredAlertItem {
  id: string;
  monitor_id: string;
  user_id?: string;
  session_id?: string;
  location: string;
  latitude?: number;
  longitude?: number;
  rule_type: string;
  severity: string;
  condition_desc: string;
  threshold: number;
  actual_value: number;
  time_window?: string;
  explanation: string;
  status: 'active' | 'resolved';
  triggered_at: string;
  resolved_at?: string;
  resolution_value?: number;
  resolution_explanation?: string;
}

export const weatherApi = {
  getDashboard: (city: string) => fetchWithHandler(`${API_BASE_URL}/api/weather/dashboard?city=${encodeURIComponent(city)}`),
  getCurrent: (city: string) => fetchWithHandler(`${API_BASE_URL}/api/weather/current?city=${encodeURIComponent(city)}`),
  getHourly: (city: string) => fetchWithHandler(`${API_BASE_URL}/api/weather/hourly?city=${encodeURIComponent(city)}`).catch(() => null),
  getDaily: (city: string) => fetchWithHandler(`${API_BASE_URL}/api/weather/daily?city=${encodeURIComponent(city)}`).catch(() => null),
  getAlerts: (city: string) => fetchWithHandler(`${API_BASE_URL}/api/weather/alerts?city=${encodeURIComponent(city)}`),
  getAirQuality: (city: string) => fetchWithHandler(`${API_BASE_URL}/api/weather/air-quality?city=${encodeURIComponent(city)}`).catch(() => null),
  chat: (message: string, city: string, history: any[] = [], context?: any) => fetchWithHandler(`${API_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, city, history, context })
  }),
  getMonitors: (location?: string, enabledOnly?: boolean) => {
    const params = new URLSearchParams();
    if (location) params.append('location', location);
    if (enabledOnly) params.append('enabled_only', 'true');
    const q = params.toString() ? `?${params.toString()}` : '';
    return fetchWithHandler(`${API_BASE_URL}/api/monitors${q}`);
  },
  createMonitor: (data: Partial<WeatherMonitorItem>) => fetchWithHandler(`${API_BASE_URL}/api/monitors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  updateMonitor: (id: string, updates: { enabled?: boolean; threshold?: number }) => fetchWithHandler(`${API_BASE_URL}/api/monitors/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  }),
  deleteMonitor: (id: string) => fetchWithHandler(`${API_BASE_URL}/api/monitors/${id}`, {
    method: 'DELETE',
  }),
  getTriggeredAlerts: (location?: string, status?: string) => {
    const params = new URLSearchParams();
    if (location) params.append('location', location);
    if (status) params.append('status', status);
    const q = params.toString() ? `?${params.toString()}` : '';
    return fetchWithHandler(`${API_BASE_URL}/api/alerts${q}`);
  },
  getTriggeredAlert: (id: string) => fetchWithHandler(`${API_BASE_URL}/api/alerts/${id}`),
};
