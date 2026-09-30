/**
 * API client configuration and utilities.
 * Handles prepending the backend URL dynamically using environment variables.
 */

/**
 * Returns the base URL for API requests.
 * Uses VITE_API_URL or VITE_API_BASE_URL if defined, otherwise falls back to empty string (relative path),
 * which is used for local development proxying (via Vite dev server) or Docker Nginx.
 */
export function getApiBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

/**
 * Wrapper around standard fetch to automatically prepend the base API URL.
 * 
 * @param endpoint - The API endpoint, e.g. '/api/weather' or 'api/weather'
 * @param init - Standard RequestInit options
 */
export async function apiFetch(endpoint: string, init?: RequestInit): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  let normalizedEndpoint = endpoint;
  if (!normalizedEndpoint.startsWith('/')) {
    normalizedEndpoint = '/' + normalizedEndpoint;
  }
  
  const url = `${baseUrl}${normalizedEndpoint}`;
  return fetch(url, init);
}
