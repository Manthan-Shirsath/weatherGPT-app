import { useEffect, useRef, useState, useCallback } from 'react';
import { WS_BASE_URL } from '@/lib/api/client';
import { useQueryClient } from '@tanstack/react-query';

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

export type WeatherEvent = {
  type: string;
  city?: string;
  data?: any;
  alert?: any;
  timestamp?: string;
};

const MAX_RECONNECT_DELAY = 30_000;
const BASE_RECONNECT_DELAY = 1_000;

export function useWeatherWebSocket(city: string) {
  const queryClient = useQueryClient();
  const ws = useRef<WebSocket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('offline');
  const [lastEvent, setLastEvent] = useState<WeatherEvent | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  const clearReconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
  }, []);

  useEffect(() => {
    unmounted.current = false;
    if (!city) {
      setConnectionState('offline');
      return;
    }

    const connect = () => {
      if (unmounted.current) return;

      setConnectionState(reconnectAttempt.current > 0 ? 'reconnecting' : 'connecting');

      try {
        ws.current = new WebSocket(`${WS_BASE_URL}/ws/weather`);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.current.onopen = () => {
        if (unmounted.current) return;
        reconnectAttempt.current = 0;
        setConnectionState('live');
        ws.current?.send(JSON.stringify({ action: 'subscribe', city }));
      };

      ws.current.onmessage = (event) => {
        try {
          const data: WeatherEvent = JSON.parse(event.data);

          if (data.type === 'subscription_confirmed') return;

          setLastEvent(data);

          // Targeted React Query invalidation
          if (data.type === 'weather_update' && data.city?.toLowerCase() === city.toLowerCase()) {
            queryClient.invalidateQueries({ queryKey: ['weather', 'dashboard', city] });
            queryClient.invalidateQueries({ queryKey: ['weather', 'current', city] });
            queryClient.invalidateQueries({ queryKey: ['weather', 'hourly', city] });
            queryClient.invalidateQueries({ queryKey: ['weather', 'daily', city] });
          }

          if (
            ['alert.created', 'alert.updated', 'alert.resolved'].includes(data.type) &&
            data.city?.toLowerCase() === city.toLowerCase()
          ) {
            queryClient.invalidateQueries({ queryKey: ['weather', 'alerts', city] });
            queryClient.invalidateQueries({ queryKey: ['weather', 'dashboard', city] });

            // Dispatch custom event for toast notifications
            window.dispatchEvent(
              new CustomEvent('weather-alert-transition', { detail: data })
            );
          }
        } catch (error) {
          console.error('[WS] Error parsing message:', error);
        }
      };

      ws.current.onclose = () => {
        if (unmounted.current) return;
        setConnectionState('offline');
        scheduleReconnect();
      };

      ws.current.onerror = () => {
        // onclose will fire after onerror, so reconnect is handled there
      };
    };

    const scheduleReconnect = () => {
      if (unmounted.current) return;
      clearReconnect();
      const delay = Math.min(
        BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempt.current),
        MAX_RECONNECT_DELAY
      );
      reconnectAttempt.current += 1;
      reconnectTimeout.current = setTimeout(connect, delay);
    };

    connect();

    return () => {
      unmounted.current = true;
      clearReconnect();
      if (ws.current) {
        if (ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ action: 'unsubscribe', city }));
        }
        ws.current.close();
        ws.current = null;
      }
    };
  }, [city, queryClient, clearReconnect]);

  // Derived convenience booleans
  const isConnected = connectionState === 'live';

  return { connectionState, isConnected, lastEvent };
}
