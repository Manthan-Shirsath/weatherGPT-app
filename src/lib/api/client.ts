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
  })
};
