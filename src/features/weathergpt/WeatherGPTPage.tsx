import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Send, Sparkles, Bot, User, Loader2, AlertTriangle, CloudRain, MapPin, 
  Droplets, Thermometer, Wind, Clock, ArrowRight, CheckCircle2, XCircle, 
  Bell, BellOff, RefreshCw, ChevronRight, ExternalLink, Layers, Database,
  LineChart, Bookmark, BookmarkCheck, RotateCcw, Sprout, ShieldAlert,
  Mic, MicOff, Edit2, Check, Copy, ChevronDown, Search, ArrowUpRight,
  Plane, Ship
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { DecisionHero } from '@/components/weather/DecisionHero';
import { ForecastChart } from '@/components/weather/ForecastChart';
import { MetricBar } from '@/components/weather/MetricBar';
import { AlertChangeViz, type AlertRecord } from '@/components/weather/AlertChangeViz';
import { AlertTimeline } from '@/components/weather/AlertTimeline';
import { ModeSelector } from './ModeSelector';
import { useDashboard } from '@/lib/query/hooks';
import {
  getModeConfig, getContextChips, getSuggestedQuestions, getPlaceholder,
  getSelectableModes,
} from './modeConfig';

// --- Types ---
type CardItem = {
  type: string;
  data: any;
};

type SourceItem = {
  name?: string;
  model?: string;
  source?: string;
  variable?: string;
  freshness?: string;
  latency_ms?: number;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  cards?: CardItem[];
  sources?: SourceItem[];
  city?: string;
  mode?: string;
  isError?: boolean;
  followUps?: string[];
};

const POPULAR_CITIES = [
  'Pune', 'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 
  'Chennai', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Goa', 
  'London', 'New York', 'Tokyo', 'Dubai', 'Singapore'
];

// Mode configuration is imported from modeConfig.ts
// AGENT_MODES, MODE_PLACEHOLDERS, SUGGESTED_PROMPTS, CONTEXT_PILLS
// are all driven by the unified ModeConfig objects.

type MonitorState = {
  monitor_id: string;
  location: string;
  activity?: string;
  target_hour?: number;
  time_label?: string;
  target_date?: string;
  enabled: boolean;
  created_at?: string;
};

// Removed duplicate AlertRecord

// --- Feature #3: Rich Markdown Renderer ---
function MarkdownRenderer({ content }: { content: string }) {
  const safeContent = typeof content === 'string' ? content : '';
  const lines = safeContent.split('\n');
  const renderedElements: React.ReactNode[] = [];
  let currentList: string[] = [];
  let currentTable: string[][] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      renderedElements.push(
        <ul key={`ul-${renderedElements.length}`} className="my-2 space-y-1 pl-4 list-disc marker:text-sky-ai">
          {currentList.map((item, idx) => (
            <li key={idx} className="text-sky-text-primary text-[14px] leading-relaxed">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  const flushTable = () => {
    if (currentTable.length > 0) {
      if (currentTable.length > 1) {
        const headers = currentTable[0];
        // currentTable[1] is typically the separator row (e.g. |---|---|), so skip it
        const hasSeparator = currentTable[1].every(cell => cell.match(/^[-\s:]+$/));
        const rows = hasSeparator ? currentTable.slice(2) : currentTable.slice(1);

        renderedElements.push(
          <div key={`table-${renderedElements.length}`} className="my-3 overflow-x-auto rounded-lg border border-sky-border/40 bg-sky-card/50">
            <table className="w-full text-left text-sm text-sky-text-primary">
              <thead className="text-xs uppercase bg-sky-ai/5 border-b border-sky-border/40">
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="px-4 py-2 font-medium">{renderInlineMarkdown(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-border/20">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-sky-background/30 transition-colors">
                    {row.map((cell, j) => (
                      <td key={j} className="px-4 py-2">{renderInlineMarkdown(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      currentTable = [];
    }
  };

  const renderInlineMarkdown = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-sky-text-primary">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="px-1.5 py-0.5 rounded bg-sky-background border border-sky-border text-sky-ai font-mono text-xs">
            {part.slice(1, -1)}
          </code>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
      flushList();
      // Split by pipe, clean up the array (remove first and last empty elements caused by surrounding pipes)
      const cells = trimmed.split('|').map(c => c.trim());
      const filteredCells = cells.slice(1, cells.length - 1);
      currentTable.push(filteredCells);
      return;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      flushTable();
      currentList.push(trimmed.slice(2));
      return;
    }

    const numMatch = trimmed.match(/^\d+\.\s+(.*)/);
    if (numMatch) {
      flushList();
      flushTable();
      renderedElements.push(
        <div key={`num-${index}`} className="flex items-start gap-2 my-1.5 text-[14px]">
          <span className="font-bold text-sky-ai font-mono text-xs mt-0.5 min-w-[1.2rem]">{trimmed.split('.')[0]}.</span>
          <div className="flex-1 text-sky-text-primary leading-relaxed">{renderInlineMarkdown(numMatch[1])}</div>
        </div>
      );
      return;
    }

    flushList();
    flushTable();

    if (trimmed.startsWith('### ')) {
      renderedElements.push(
        <h4 key={`h3-${index}`} className="text-sm font-bold text-sky-text-primary uppercase tracking-wider mt-3 mb-1.5 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-sky-ai inline" />
          {renderInlineMarkdown(trimmed.slice(4))}
        </h4>
      );
    } else if (trimmed.startsWith('## ')) {
      renderedElements.push(
        <h3 key={`h2-${index}`} className="text-base font-bold text-sky-text-primary mt-3.5 mb-1.5 border-b border-sky-border/40 pb-1">
          {renderInlineMarkdown(trimmed.slice(3))}
        </h3>
      );
    } else if (trimmed.startsWith('# ')) {
      renderedElements.push(
        <h2 key={`h1-${index}`} className="text-lg font-extrabold text-sky-text-primary mt-4 mb-2">
          {renderInlineMarkdown(trimmed.slice(2))}
        </h2>
      );
    } else if (trimmed.startsWith('> ')) {
      renderedElements.push(
        <blockquote key={`quote-${index}`} className="border-l-2 border-sky-ai/70 pl-3 my-2 text-sky-text-secondary italic text-xs bg-sky-ai/5 py-1 rounded-r">
          {renderInlineMarkdown(trimmed.slice(2))}
        </blockquote>
      );
    } else if (trimmed === '') {
      renderedElements.push(<div key={`spacer-${index}`} className="h-1.5" />);
    } else {
      renderedElements.push(
        <p key={`p-${index}`} className="text-[14.5px] leading-relaxed text-sky-text-primary">
          {renderInlineMarkdown(line)}
        </p>
      );
    }
  });

  flushList();
  flushTable();
  return <div className="space-y-1">{renderedElements}</div>;
}

// Generate smart follow-up suggestions (#4)
function generateFollowUps(role: 'user' | 'model', content: string, city: string, mode: string): string[] {
  if (role !== 'model') return [];
  const lower = content.toLowerCase();
  const suggestions: string[] = [];

  if (lower.includes('rain') || lower.includes('precipitation') || lower.includes('shower')) {
    suggestions.push(`Hourly rain breakdown for ${city}`);
    suggestions.push(`Compare ECMWF & GFS rain forecasts`);
  }
  if (lower.includes('temp') || lower.includes('degree') || lower.includes('celsius')) {
    suggestions.push(`7-day temperature trends in ${city}`);
  }
  if (lower.includes('wind') || lower.includes('gust')) {
    suggestions.push(`Wind speed & gust forecast for tomorrow`);
  }
  if (mode === 'agriculture' || lower.includes('spray') || lower.includes('crop')) {
    suggestions.push(`Optimal spray window for next 48 hours`);
    suggestions.push(`Soil moisture & evapotranspiration in ${city}`);
  }
  if (mode === 'disaster' || lower.includes('alert') || lower.includes('storm')) {
    suggestions.push(`Active severe alerts & safety checklist`);
  }
  // Aviation follow-ups
  if (mode === 'aviation' || lower.includes('metar') || lower.includes('ceiling') || lower.includes('crosswind') || lower.includes('turbulence')) {
    suggestions.push(`Crosswind component for runway operations at ${city}`);
    suggestions.push(`Icing risk assessment above FL200 near ${city}`);
    suggestions.push(`Ceiling & visibility trend for the next 6 hours`);
  }
  // Marine follow-ups
  if (mode === 'marine' || lower.includes('wave') || lower.includes('swell') || lower.includes('tide') || lower.includes('buoy')) {
    suggestions.push(`Swell direction and period forecast near ${city}`);
    suggestions.push(`Tide changes over the next 6 hours`);
    suggestions.push(`Small craft advisory status for coastal ${city}`);
  }

  if (suggestions.length < 2) {
    suggestions.push(`What is the weekend forecast for ${city}?`);
    suggestions.push(`Is tomorrow good for outdoor activities?`);
  }

  return Array.from(new Set(suggestions)).slice(0, 3);
}

// --- Component ---
export default function WeatherGPTPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCity = searchParams.get('city') || 'Pune';
  
  const [activeCity, setActiveCity] = useState<string>(initialCity);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState<string>('auto');

  const { data: dashboardData } = useDashboard(activeCity);
  
  // Feature #7: Inline Location Switcher modal state
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationSearchInput, setLocationSearchInput] = useState('');

  // Feature #16: Editing state for previous message
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  // Feature #10: Pinned Messages state
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('skycast_weathergpt_pinned');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showPinnedDrawer, setShowPinnedDrawer] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Feature #14: Voice Input hook
  const { isListening, transcript, isSupported: isVoiceSupported, startListening, stopListening } = useSpeechRecognition({
    continuous: false,
    onResult: (spokenText) => {
      setInputValue(spokenText);
    }
  });

  // Sync speech transcript into input value as user talks
  useEffect(() => {
    if (transcript) {
      setInputValue(transcript);
    }
  }, [transcript]);

  const togglePinMessage = useCallback((msgId: string) => {
    setPinnedIds(prev => {
      const next = prev.includes(msgId) ? prev.filter(id => id !== msgId) : [...prev, msgId];
      try {
        localStorage.setItem('skycast_weathergpt_pinned', JSON.stringify(next));
      } catch { /* silent */ }
      return next;
    });
  }, []);

  const handleCopyMessage = useCallback((msgId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // Update active city when URL search param changes
  useEffect(() => {
    const urlCity = searchParams.get('city');
    if (urlCity && urlCity !== activeCity) {
      setActiveCity(urlCity);
    }
  }, [searchParams, activeCity]);

  // Function to switch city inline (#7)
  const handleSwitchCity = useCallback((newCity: string) => {
    const clean = newCity.trim();
    if (!clean) return;
    setActiveCity(clean);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('city', clean);
      return next;
    });
    setShowLocationModal(false);
    setLocationSearchInput('');
  }, [setSearchParams]);

  const handleResetChat = useCallback(() => {
    setSessionId(null);
    setInputValue('');
    setActiveMonitor(null);
    setAlerts([]);
    setShowAlertPanel(false);
    setMessages([
      {
        id: 'init-msg-' + Date.now(),
        role: 'model',
        content: t('weathergpt.greeting_text', { city: activeCity, defaultValue: `Hi! I'm WeatherGPT. I can give you detailed forecasts, evaluate rain risks, and help you plan your activities for **${activeCity}** or anywhere else. What would you like to know?` }),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: agentMode,
        city: activeCity,
        followUps: [
          `Will it rain today in ${activeCity}?`,
          `Compare ECMWF and GFS for ${activeCity}`,
          `7-day temperature outlook for ${activeCity}`
        ]
      }
    ]);
  }, [activeCity, agentMode]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeMonitor, setActiveMonitor] = useState<MonitorState | null>(null);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [monitoringBusy, setMonitoringBusy] = useState(false);
  const [showAlertPanel, setShowAlertPanel] = useState(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  // Initial Greeting
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'init-msg',
          role: 'model',
          content: t('weathergpt.greeting_text', { city: activeCity, defaultValue: `Hi! I'm WeatherGPT. I can give you detailed forecasts, evaluate rain risks, and help you plan your activities for **${activeCity}** or anywhere else. What would you like to know?` }),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          mode: agentMode,
          city: activeCity,
          followUps: [
            `Will it rain today in ${activeCity}?`,
            `Compare ECMWF and GFS for ${activeCity}`,
            `7-day temperature outlook for ${activeCity}`
          ]
        }
      ]);
    }
  }, [activeCity, messages.length, agentMode]);

  const sendQuery = useCallback(async (queryText: string, customCity?: string) => {
    const text = queryText.trim();
    if (!text || isLoading) return;

    const cityToUse = customCity || activeCity;

    const newUserMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mode: agentMode,
      city: cityToUse
    };

    setMessages(prev => [...prev, newUserMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await apiFetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: text,
          city: cityToUse,
          session_id: sessionId,
          agent_mode: agentMode,
          context: {
             page: '/weathergpt',
             active_city: cityToUse,
             weather_data: dashboardData
          }
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.session_id) {
        setSessionId(data.session_id);
      }

      const modelCity = data.city || cityToUse;
      const followUps = generateFollowUps('model', data.reply || '', modelCity, agentMode);

      const newModelMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: data.reply || '',
        timestamp: data.timestamp ? new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cards: data.cards,
        sources: data.sources,
        city: modelCity,
        mode: agentMode,
        followUps
      };

      setMessages(prev => [...prev, newModelMsg]);

    } catch (err) {
      console.error("Chat Error:", err);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: t('weathergpt.error_msg', "I'm sorry, I encountered an error connecting to the weather intelligence servers. Please try again."),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
        city: cityToUse
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [agentMode, activeCity, sessionId, isLoading, dashboardData, t]);

  // Feature #16: Regenerate response for a previous query
  const handleRegenerate = useCallback((index: number) => {
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const query = messages[i].content;
        const targetCity = messages[i].city || activeCity;
        setMessages(prev => prev.slice(0, i));
        sendQuery(query, targetCity);
        break;
      }
    }
  }, [messages, activeCity, sendQuery]);

  // Feature #16: Save and resend edited user message
  const handleSaveEditMessage = useCallback((msgId: string) => {
    if (!editingContent.trim()) {
      setEditingMessageId(null);
      return;
    }
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx !== -1) {
      const newQuery = editingContent.trim();
      const targetCity = messages[idx].city || activeCity;
      setMessages(prev => prev.slice(0, idx));
      setEditingMessageId(null);
      setEditingContent('');
      sendQuery(newQuery, targetCity);
    }
  }, [editingContent, messages, activeCity, sendQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      sendQuery(inputValue);
    }
  };

  const handleAttachContextPill = (attachText: string) => {
    setInputValue(prev => {
      const trimmed = prev.trim();
      if (!trimmed) {
        return attachText.startsWith('in') ? `Forecast ${attachText}` : `${attachText} in ${activeCity}`;
      }
      return `${trimmed} ${attachText}`;
    });
  };

  // ── Monitoring helpers (Mocked for direct frontend use) ─────────────────────────────────────────────────────

  const loadAlerts = useCallback(async (sid: string) => {
    // Mocked: Alerts require backend polling, returning empty for now.
    setAlerts([]);
    setShowAlertPanel(false);
  }, []);

  const handleCreateMonitor = useCallback(async (opts: {
    location: string;
    activity?: string;
    target_hour?: number;
    time_label?: string;
    target_date?: string;
  }) => {
    if (!sessionId) return;
    setMonitoringBusy(true);
    // Mocked delay
    await new Promise(resolve => setTimeout(resolve, 500));
    const mockMonitorId = `mon_${Date.now()}`;
    setActiveMonitor({ monitor_id: mockMonitorId, ...opts, enabled: true });
    setIsMonitoring(true);
    setMonitoringBusy(false);
  }, [sessionId]);

  const handleTriggerCheck = useCallback(async () => {
    if (!sessionId) return;
    setMonitoringBusy(true);
    // Mocked delay
    await new Promise(resolve => setTimeout(resolve, 500));
    await loadAlerts(sessionId);
    setMonitoringBusy(false);
  }, [sessionId, loadAlerts]);

  const handleDisableMonitor = useCallback(async () => {
    if (!sessionId || !activeMonitor) return;
    setActiveMonitor(null);
    setIsMonitoring(false);
  }, [sessionId, activeMonitor]);

  useEffect(() => {
    if (sessionId) loadAlerts(sessionId);
  }, [sessionId, loadAlerts]);

  const renderCard = (card: CardItem, index: number) => {
    if (card.type === 'weather_summary') {
      const data = card.data;
      const rain = data.rain_probability_pct ?? data.precipitation_probability ?? 0;
      const wind = data.wind_speed_kmh ?? data.windSpeed;
      const humidity = data.humidity;
      return (
        <Card key={index} className="my-3 border-sky-border bg-sky-surface shadow-sm max-w-sm w-full animate-fade-slide-in">
          <CardHeader className="pb-2 pt-4 px-4 border-b border-sky-border/50">
            <CardTitle className="text-sm font-semibold flex items-center justify-between text-sky-text-primary">
               <span className="flex items-center gap-2 uppercase tracking-wider">
                 <MapPin className="h-4 w-4 text-sky-primary" />
                 {data.location || data.name || 'Location'}
               </span>
               <span className="text-[10px] font-normal text-sky-text-secondary normal-case tracking-normal">Current</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3">
             <div className="flex justify-between items-center mb-3">
                <div>
                   <p className="text-4xl font-black text-sky-text-primary leading-none">{data.temperature_c ?? '--'}°<span className="text-2xl">C</span></p>
                   <p className="text-xs text-sky-text-secondary mt-1">Feels like {data.feels_like_c ?? '--'}°C</p>
                </div>
                <div className="text-right">
                   <p className="text-xl">{
                     (data.condition || '').toLowerCase().includes('rain') ? '🌧️' :
                     (data.condition || '').toLowerCase().includes('cloud') ? '☁️' :
                     (data.condition || '').toLowerCase().includes('clear') || (data.condition || '').toLowerCase().includes('sunny') ? '☀️' :
                     (data.condition || '').toLowerCase().includes('storm') ? '⛈️' : '🌤️'
                   }</p>
                   <p className="text-xs font-medium text-sky-text-secondary mt-0.5">{data.condition ?? 'Unknown'}</p>
                </div>
             </div>
             <div className="space-y-2 border-t border-sky-border/50 pt-3">
               <p className="text-[10px] uppercase font-bold text-sky-text-secondary tracking-wider mb-2">Today's Forecast</p>
               {rain > 0 && <MetricBar value={rain} label="Daily Rain Probability" unit="%" colorScale="rain" size="sm" />}
               
               <p className="text-[10px] uppercase font-bold text-sky-text-secondary tracking-wider mt-4 mb-2">Current Conditions</p>
               {data.precipitation != null && <MetricBar value={data.precipitation} max={50} label="Current Rain" unit=" mm" colorScale="rain" size="sm" />}
               {wind != null && <MetricBar value={wind} max={80} label="Current Wind" unit=" km/h" colorScale="wind" size="sm" />}
               {humidity != null && <MetricBar value={humidity} label="Current Humidity" unit="%" colorScale="humidity" size="sm" />}
             </div>
             {data.main_concern && (
               <div className="mt-3 bg-sky-warning/10 p-2 rounded-lg text-xs text-sky-warning border border-sky-warning/20">
                 <span className="font-semibold">⚠ Concern:</span> {data.main_concern}
               </div>
             )}
             <p className="text-[9px] text-sky-text-secondary/40 mt-2">{data.nwp_model || 'GFS'} · Open-Meteo</p>
          </CardContent>
        </Card>
      );
    }

    if (card.type === 'forecast_timeline') {
      const data = card.data;
      const slots = data.hourly_forecast
        || (data.target_period?.slots ?? [])
        || (data.target_period ? [data.target_period] : []);
      if (!slots || slots.length === 0) return null;
      const analytics = data.analytics;

      let eventHour: number | undefined;
      const tStr = data.target_time || '';
      const tM = tStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      if (tM) {
        let h = parseInt(tM[1], 10);
        const mer = (tM[3] ?? '').toLowerCase();
        if (mer === 'pm' && h < 12) h += 12;
        if (mer === 'am' && h === 12) h = 0;
        if (h >= 0 && h < 24) eventHour = h;
      }

      return (
        <Card key={index} className="my-3 border-sky-border bg-sky-surface shadow-sm max-w-sm w-full animate-fade-slide-in">
          <CardHeader className="pb-2 pt-3 px-4 border-b border-sky-border/50">
            <CardTitle className="text-sm font-semibold flex items-center justify-between text-sky-text-primary">
               <span className="flex items-center gap-2 uppercase tracking-wider">
                 <Clock className="h-3.5 w-3.5 text-sky-primary" />
                 {data.location} · Forecast
               </span>
               <Badge variant="outline" className="text-[9px] py-0 border-sky-border text-sky-text-secondary">{data.nwp_model || 'GFS'}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-3">
            <ForecastChart
              slots={slots}
              eventHour={eventHour}
              location={data.location}
              nwpModel={data.nwp_model}
            />
            {analytics && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-sky-border/30 pt-2">
                {analytics.rain_trend && (
                  <div>
                    <p className="text-[9px] text-sky-text-secondary uppercase tracking-wider">Rain trend</p>
                    <p className="text-xs font-semibold text-sky-text-primary capitalize">
                      {analytics.rain_trend} {analytics.rain_trend === 'increasing' ? '↗' : analytics.rain_trend === 'decreasing' ? '↘' : '→'}
                    </p>
                  </div>
                )}
                {analytics.temperature_trend && (
                  <div>
                    <p className="text-[9px] text-sky-text-secondary uppercase tracking-wider">Temp trend</p>
                    <p className="text-xs font-semibold text-sky-text-primary capitalize">
                      {analytics.temperature_trend} {analytics.temperature_trend === 'rising' ? '↗' : analytics.temperature_trend === 'falling' ? '↘' : '→'}
                    </p>
                  </div>
                )}
                {analytics.best_dry_window && (
                  <div className="col-span-2">
                    <p className="text-[9px] text-sky-text-secondary uppercase tracking-wider">Best dry window</p>
                    <p className="text-xs font-semibold text-emerald-500">{analytics.best_dry_window}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      );
    }

    if (card.type === 'decision') {
      return (
        <DecisionHero
          key={index}
          data={card.data}
          onMonitor={sessionId ? handleCreateMonitor : undefined}
          isMonitoring={isMonitoring && activeMonitor?.location?.toLowerCase() === (card.data.location || activeCity).toLowerCase()}
          monitoringBusy={monitoringBusy}
          onStopMonitor={handleDisableMonitor}
          onRefreshMonitor={handleTriggerCheck}
        />
      );
    }

    if (card.type === 'date_comparison') {
       const data = card.data;
       return (
        <Card key={index} className="my-3 border-sky-border bg-sky-surface-elevated/50 shadow-sm max-w-sm w-full">
          <CardHeader className="pb-2 pt-4 px-4 border-b border-sky-border/50">
            <CardTitle className="text-sm font-semibold text-sky-text-primary uppercase tracking-wider">
               {data.location} · {t('weathergpt.comparison', 'COMPARISON')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3">
             <div className="grid grid-cols-2 gap-4">
                 {(data.comparisons || data.comparison) && (data.comparisons || data.comparison).map((day: any, i: number) => (
                    <div key={i} className="text-center">
                       <p className="text-xs font-bold text-sky-text-primary mb-2 uppercase">{day.date}</p>
                       <div className="space-y-1 text-sm">
                          <p className="text-sky-text-secondary"><Thermometer className="h-3 w-3 inline mr-1" />{day.temperature_max_c ?? day.high_c ?? '--'}°C</p>
                          <p className="text-sky-text-secondary"><Droplets className="h-3 w-3 inline mr-1" />{day.precipitation_probability ?? 0}%</p>
                       </div>
                    </div>
                 ))}
                 {data.models && data.models.map((model: any, i: number) => (
                    <div key={`model-${i}`} className="text-center">
                       <p className="text-xs font-bold text-sky-text-primary mb-2 uppercase">{model.model_name}</p>
                       <div className="space-y-1 text-sm">
                          <p className="text-sky-text-secondary"><Thermometer className="h-3 w-3 inline mr-1" />{model.temperature_high_c ?? '--'}°C</p>
                          <p className="text-sky-text-secondary"><Droplets className="h-3 w-3 inline mr-1" />{model.total_precipitation_mm ? `${model.total_precipitation_mm} mm` : '0 mm'}</p>
                       </div>
                    </div>
                 ))}
             </div>
             {data.verdict && (
                 <div className="mt-4 pt-3 border-t border-sky-border/50">
                    <p className="text-sm font-medium text-sky-text-primary">{data.verdict}</p>
                 </div>
             )}
          </CardContent>
        </Card>
       );
    }

    return null;
  };

  const MonitorButton = ({ location, activity, target_hour, time_label, target_date }: {
    location: string; activity?: string; target_hour?: number; time_label?: string; target_date?: string;
  }) => {
    if (!sessionId) return null;
    if (isMonitoring && activeMonitor?.location?.toLowerCase() === location?.toLowerCase()) {
      return (
        <div className="flex items-center gap-2 mt-2 text-xs text-sky-text-secondary">
          <Bell className="h-3 w-3 text-sky-ai animate-pulse" />
          <span className="font-medium text-sky-ai">{t('weathergpt.monitoring', 'Monitoring')} {location}{activity ? ` · ${activity}` : ''}</span>
          <button onClick={handleDisableMonitor} className="ml-auto text-sky-text-secondary hover:text-sky-danger transition-colors">
            <BellOff className="h-3 w-3" />
          </button>
        </div>
      );
    }
    return (
      <button
        onClick={() => handleCreateMonitor({ location, activity, target_hour, time_label, target_date })}
        disabled={monitoringBusy}
        className="mt-2 w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg border border-sky-border/50 bg-sky-surface-elevated hover:bg-sky-ai/10 hover:border-sky-ai/40 transition-all text-xs text-sky-text-secondary hover:text-sky-ai group"
      >
        {monitoringBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3 group-hover:scale-110 transition-transform" />}
        <span className="font-medium">{t('weathergpt.monitor_this', 'Monitor this')}</span>
      </button>
    );
  };

  const currentModeConfig = getModeConfig(agentMode, t);

  return (
    <div className={cn("flex flex-col h-full bg-sky-background relative overflow-hidden", currentModeConfig.headerAccentClass)}>
      {/* Header */}
      <div className="flex-none px-4 md:px-6 py-3.5 border-b border-sky-border bg-sky-surface flex items-center justify-between z-10 shrink-0">
         <div className="flex items-center gap-3">
           <div>
             <h1 className="text-lg md:text-xl font-bold text-sky-text-primary flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-sky-ai" />
                WeatherGPT
             </h1>
             <p className="text-xs text-sky-text-secondary hidden sm:block">
               {t('weathergpt.subtitle', 'AI-powered weather intelligence & decision assistant')}
             </p>
           </div>

           {/* Feature #7: Header Active Location Pill & Switcher Trigger */}
           <button
             onClick={() => setShowLocationModal(true)}
             className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-surface-elevated border border-sky-border hover:border-sky-ai/40 hover:bg-sky-ai/10 text-sky-text-primary transition-all group shadow-2xs ml-1 cursor-pointer"
             title="Click to switch city context"
           >
             <MapPin className="h-3.5 w-3.5 text-sky-primary group-hover:scale-110 transition-transform" />
             <span className="font-semibold">{activeCity}</span>
             <ChevronDown className="h-3 w-3 text-sky-text-secondary group-hover:text-sky-ai transition-colors" />
           </button>
         </div>

         <div className="flex items-center gap-2 md:gap-3">
           {/* New Chat Button (#9) */}
           <Button
             variant="outline"
             size="sm"
             onClick={handleResetChat}
             className="h-8 px-2.5 text-xs gap-1.5 border-sky-border/70 hover:bg-sky-surface-elevated text-sky-text-secondary hover:text-sky-text-primary transition-colors"
             title="Start a fresh conversation"
           >
             <RotateCcw className="h-3.5 w-3.5 text-sky-ai" />
             <span className="hidden sm:inline">New Chat</span>
           </Button>

           {/* Pinned Insights Toggle (#10) */}
           {pinnedIds.length > 0 && (
             <Button
               variant="outline"
               size="sm"
               onClick={() => setShowPinnedDrawer(p => !p)}
               className={cn(
                 "h-8 px-2.5 text-xs gap-1.5 border-sky-ai/40 transition-colors",
                 showPinnedDrawer ? "bg-sky-ai/20 text-sky-ai" : "bg-sky-ai/10 text-sky-ai hover:bg-sky-ai/15"
               )}
               title="View saved weather insights"
             >
               <BookmarkCheck className="h-3.5 w-3.5 text-sky-ai fill-sky-ai/30" />
               <span>Pinned ({pinnedIds.length})</span>
             </Button>
           )}

           {/* Monitoring status chip */}
           {isMonitoring && activeMonitor && (
             <div className="flex items-center gap-1.5 text-xs font-medium text-sky-ai border border-sky-ai/30 bg-sky-ai/10 rounded-full px-2.5 py-1">
               <Bell className="h-3 w-3 animate-pulse" />
               <span className="hidden md:inline">{activeMonitor.location}</span>
               <button
                 onClick={handleTriggerCheck}
                 disabled={monitoringBusy}
                 className="ml-1 text-sky-ai hover:text-sky-primary transition-colors"
                 title="Check for weather changes now"
               >
                 <RefreshCw className={cn("h-3 w-3", monitoringBusy && "animate-spin")} />
               </button>
             </div>
           )}
           
           {/* Alert history badge */}
           {alerts.length > 0 && (
             <button
               onClick={() => setShowAlertPanel(p => !p)}
               className="relative flex items-center gap-1 text-xs font-medium text-sky-warning border border-sky-warning/30 bg-sky-warning/10 rounded-full px-2.5 py-1 hover:bg-sky-warning/20 transition-colors"
             >
               <AlertTriangle className="h-3 w-3" />
               <span>{alerts.length} alert{alerts.length > 1 ? 's' : ''}</span>
             </button>
           )}

           <ModeSelector
             value={agentMode}
             onChange={setAgentMode}
           />
         </div>
      </div>

      {/* Persistent Disclaimer Banner for Safety-Critical Modes (Aviation & Marine) */}
      {currentModeConfig.disclaimerBanner && (
        <div className="flex-none px-4 md:px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/25 text-amber-200 text-xs flex items-start gap-2.5 animate-fade-in z-10">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{currentModeConfig.disclaimerBanner}</p>
        </div>
      )}

      {/* Feature #7: Inline Location Switcher Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-sky-surface border border-sky-border rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-sky-border/60 pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-sky-primary" />
                <h3 className="text-base font-bold text-sky-text-primary">Change City Context</h3>
              </div>
              <button 
                onClick={() => setShowLocationModal(false)}
                className="text-sky-text-secondary hover:text-sky-text-primary p-1 cursor-pointer"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <form onSubmit={(e) => { e.preventDefault(); handleSwitchCity(locationSearchInput); }} className="relative flex items-center">
                <Search className="h-4 w-4 absolute left-3 text-sky-text-secondary" />
                <Input
                  type="text"
                  value={locationSearchInput}
                  onChange={(e) => setLocationSearchInput(e.target.value)}
                  placeholder="Enter city or region (e.g. Pune, London)..."
                  className="pl-9 h-10 text-sm bg-sky-background border-sky-border rounded-xl"
                  autoFocus
                />
                <Button 
                  type="submit" 
                  size="sm" 
                  className="absolute right-1.5 h-7 px-2.5 text-xs bg-sky-primary hover:bg-sky-primary/90 text-white"
                  disabled={!locationSearchInput.trim()}
                >
                  Set
                </Button>
              </form>

              <div>
                <p className="text-[11px] font-semibold text-sky-text-secondary uppercase tracking-wider mb-2">
                  Popular Locations
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                  {POPULAR_CITIES.map(city => (
                    <button
                      key={city}
                      onClick={() => handleSwitchCity(city)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer",
                        activeCity.toLowerCase() === city.toLowerCase()
                          ? "bg-sky-primary text-white border-sky-primary shadow-xs"
                          : "bg-sky-surface-elevated/70 text-sky-text-secondary border-sky-border hover:border-sky-ai hover:text-sky-text-primary"
                      )}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pinned Insights Drawer (#10) */}
      {showPinnedDrawer && (
        <div className="flex-none border-b border-sky-border bg-sky-surface p-4 max-h-72 overflow-y-auto animate-fade-in z-20 shadow-md">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-text-primary flex items-center gap-2">
              <Bookmark className="h-4 w-4 text-sky-ai fill-sky-ai/30" />
              Saved Insights ({pinnedIds.length})
            </h3>
            <button
              onClick={() => setShowPinnedDrawer(false)}
              className="text-sky-text-secondary hover:text-sky-text-primary transition-colors cursor-pointer"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2.5">
            {messages.filter(m => pinnedIds.includes(m.id)).length === 0 ? (
              <p className="text-xs text-sky-text-secondary italic">No pinned messages in the current session.</p>
            ) : (
              messages.filter(m => pinnedIds.includes(m.id)).map(pinnedMsg => (
                <div key={pinnedMsg.id} className="p-3 rounded-xl bg-sky-surface-elevated/70 border border-sky-border/60 text-xs text-sky-text-primary flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 text-[10px] text-sky-text-secondary">
                      <span className="font-semibold text-sky-ai">{pinnedMsg.city || activeCity}</span>
                      <span>·</span>
                      <span>{pinnedMsg.timestamp}</span>
                    </div>
                    <div className="line-clamp-3 leading-relaxed text-sky-text-secondary text-xs">
                      <MarkdownRenderer content={pinnedMsg.content} />
                    </div>
                  </div>
                  <button
                    onClick={() => togglePinMessage(pinnedMsg.id)}
                    className="text-sky-text-secondary hover:text-sky-danger transition-colors p-1 cursor-pointer"
                    title="Remove from saved"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Alert Panel */}
      {showAlertPanel && alerts.length > 0 && (
        <div className="flex-none border-b border-sky-border bg-sky-surface p-3 space-y-2 max-h-112 overflow-y-auto animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-sky-text-primary uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-sky-warning" /> Weather Alerts
            </p>
            <button onClick={() => setShowAlertPanel(false)} className="text-sky-text-secondary hover:text-sky-text-primary cursor-pointer">
              <XCircle className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2">
            {alerts.slice(0, 5).map((alert) => (
              <AlertChangeViz key={alert.alert_id} alert={alert} />
            ))}
          </div>
          {alerts.length > 1 && (
            <div className="pt-2 border-t border-sky-border/30">
              <AlertTimeline
                alerts={alerts}
                monitorCreatedAt={activeMonitor?.created_at}
              />
            </div>
          )}
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6 scroll-smooth">
        {messages.map((msg, msgIndex) => (
          <div 
            key={msg.id} 
            className={cn(
              "flex w-full max-w-3xl mx-auto gap-3 md:gap-4",
              msg.role === 'user' ? "flex-row-reverse" : "flex-row"
            )}
          >
            {/* Avatar */}
            <div className={cn(
              "shrink-0 h-8 w-8 rounded-full flex items-center justify-center shadow-sm border mt-0.5",
              msg.role === 'user' 
                ? "bg-sky-surface text-sky-text-primary border-sky-border" 
                : "bg-sky-ai/10 text-sky-ai border-sky-ai/20"
            )}>
              {msg.role === 'user' ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            </div>

            {/* Bubble Container */}
            <div className={cn(
              "flex flex-col max-w-[85%]",
              msg.role === 'user' ? "items-end" : "items-start"
            )}>
              {/* Message Bubble with Edit Mode (#16) */}
              {editingMessageId === msg.id && msg.role === 'user' ? (
                <div className="w-full bg-sky-surface p-3 rounded-2xl border border-sky-ai shadow-md space-y-2">
                  <textarea
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    className="w-full bg-sky-background border border-sky-border rounded-xl p-2.5 text-sm text-sky-text-primary focus:outline-none focus:ring-1 focus:ring-sky-ai resize-none"
                    rows={2}
                    autoFocus
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setEditingMessageId(null)}
                      className="h-7 px-2.5 text-xs text-sky-text-secondary"
                    >
                      Cancel
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => handleSaveEditMessage(msg.id)}
                      className="h-7 px-3 text-xs bg-sky-primary hover:bg-sky-primary/90 text-white"
                    >
                      Save & Resend
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={cn(
                  "px-4 py-3 rounded-2xl shadow-sm border",
                  msg.role === 'user'
                    ? "bg-sky-primary text-white border-transparent rounded-tr-sm"
                    : msg.isError 
                      ? "bg-sky-danger/10 text-sky-danger border-sky-danger/20 rounded-tl-sm"
                      : "bg-sky-surface text-sky-text-primary border-sky-border rounded-tl-sm"
                )}>
                  {msg.role === 'user' ? (
                    <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <MarkdownRenderer content={msg.content} />
                  )}
                </div>
              )}
              
              {/* Cards rendered below the bubble if any */}
              {msg.cards && msg.cards.length > 0 && (
                <div className="mt-2 flex flex-col gap-2 w-full">
                  {msg.cards.map((c, i) => (
                    <div key={i}>
                      {renderCard(c, i)}
                      {c.type === 'forecast_timeline' && c.data && (
                        <MonitorButton
                          location={c.data.location || activeCity}
                          activity={c.data.activity || undefined}
                          target_hour={undefined}
                          time_label={c.data.target_time || c.data.time_label || undefined}
                          target_date={c.data.target_date || undefined}
                        />
                      )}
                    </div>
                  ))}
                  {msg.cards.some(c => ['weather_summary', 'forecast_timeline', 'decision', 'date_comparison'].includes(c.type)) && (
                     <div className="text-[10px] text-sky-text-secondary mt-1 flex gap-3 flex-wrap">
                        <span>Updated {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        {msg.cards.some(c => c.data?.stale) && (
                           <span className="text-sky-danger font-medium flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Data may be delayed
                           </span>
                        )}
                     </div>
                  )}
                </div>
              )}
              
              {/* Data Sources Citation (#11) & Forecast Intel Link (#13) */}
              {msg.role === 'model' && !msg.isError && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="flex items-center flex-wrap gap-1.5 py-1 px-2.5 rounded-lg bg-sky-surface-elevated/80 border border-sky-border/60 text-[11px] text-sky-text-secondary">
                      <Database className="h-3 w-3 text-sky-primary" />
                      <span className="font-medium text-sky-text-primary">Sources:</span>
                      {msg.sources.map((s, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 font-mono text-[10px] bg-sky-background px-1.5 py-0.5 rounded border border-sky-border/40 text-sky-text-secondary">
                          {s.model || s.name || s.source || 'NWP Model'}
                          {s.freshness && <span className="text-emerald-500 font-sans">({s.freshness})</span>}
                        </span>
                      ))}
                    </div>
                  )}

                  {(msg.cards?.some(c => ['weather_summary', 'forecast_timeline', 'decision', 'date_comparison'].includes(c.type)) || (msg.sources && msg.sources.length > 0)) && (
                    <Link
                      to={`/forecast-intelligence?city=${encodeURIComponent(msg.city || activeCity)}`}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-ai hover:text-sky-primary bg-sky-ai/10 hover:bg-sky-ai/20 border border-sky-ai/30 px-2.5 py-1 rounded-lg transition-all group shadow-2xs"
                    >
                      <LineChart className="h-3 w-3 group-hover:scale-110 transition-transform" />
                      <span>View Full Model Comparison ({msg.city || activeCity})</span>
                      <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  )}
                </div>
              )}

              {/* Feature #4: Follow-up suggestion chips */}
              {msg.role === 'model' && !msg.isError && msg.followUps && msg.followUps.length > 0 && (
                <div className="mt-3 w-full space-y-1.5 animate-fade-in">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-text-secondary flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5 text-sky-ai" /> Suggested follow-ups:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.followUps.map((chip, chipIdx) => (
                      <button
                        key={chipIdx}
                        onClick={() => sendQuery(chip, msg.city || activeCity)}
                        className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-sky-surface-elevated hover:bg-sky-ai/10 border border-sky-border hover:border-sky-ai/40 text-sky-text-primary hover:text-sky-ai transition-colors shadow-2xs group text-left cursor-pointer"
                      >
                        <span className="leading-tight">{chip}</span>
                        <ArrowUpRight className="h-2.5 w-2.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message Actions Bar (Timestamp, Mode Badge, Edit, Copy, Regenerate, Pin) */}
              <div className="flex items-center gap-2 mt-1.5 px-1 flex-wrap w-full">
                <span className="text-[10px] font-medium text-sky-text-secondary uppercase tracking-wider">
                  {msg.timestamp}
                </span>

                {/* Visual mode indicator badge (#5) */}
                {msg.role === 'model' && (
                  (() => {
                    const modeCfg = getModeConfig(msg.mode || 'auto', t);
                    const ModeIcon = modeCfg.icon;
                    return (
                      <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border shadow-2xs", modeCfg.badgeColor)}>
                        <ModeIcon className="h-2.5 w-2.5" />
                        <span>{modeCfg.label}</span>
                      </span>
                    );
                  })()
                )}

                {/* Feature #16: Edit User Message Button */}
                {msg.role === 'user' && editingMessageId !== msg.id && (
                  <button
                    onClick={() => {
                      setEditingMessageId(msg.id);
                      setEditingContent(msg.content);
                    }}
                    className="inline-flex items-center gap-1 text-[10px] text-sky-text-secondary/70 hover:text-sky-ai transition-colors px-1.5 py-0.5 rounded hover:bg-sky-surface-elevated cursor-pointer"
                    title="Edit and resend"
                  >
                    <Edit2 className="h-3 w-3" />
                    <span>Edit</span>
                  </button>
                )}

                {/* Feature #16: Regenerate Model Response Button */}
                {msg.role === 'model' && msgIndex > 0 && !msg.isError && (
                  <button
                    onClick={() => handleRegenerate(msgIndex)}
                    className="inline-flex items-center gap-1 text-[10px] text-sky-text-secondary/70 hover:text-sky-ai transition-colors px-1.5 py-0.5 rounded hover:bg-sky-surface-elevated cursor-pointer"
                    title="Regenerate this response"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Regenerate</span>
                  </button>
                )}

                {/* Copy content button */}
                <button
                  onClick={() => handleCopyMessage(msg.id, msg.content)}
                  className="inline-flex items-center gap-1 text-[10px] text-sky-text-secondary/70 hover:text-sky-text-primary transition-colors px-1.5 py-0.5 rounded hover:bg-sky-surface-elevated cursor-pointer"
                  title="Copy message text"
                >
                  {copiedId === msg.id ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                {/* Pin / Bookmark message action (#10) */}
                {msg.role === 'model' && !msg.isError && (
                  <button
                    onClick={() => togglePinMessage(msg.id)}
                    className="ml-auto inline-flex items-center gap-1 text-[10px] text-sky-text-secondary/60 hover:text-sky-ai transition-colors px-1.5 py-0.5 rounded hover:bg-sky-surface-elevated cursor-pointer"
                    title={pinnedIds.includes(msg.id) ? "Unpin Insight" : "Pin Insight for later"}
                  >
                    {pinnedIds.includes(msg.id) ? (
                      <>
                        <BookmarkCheck className="h-3 w-3 text-sky-ai fill-sky-ai/30" />
                        <span className="text-sky-ai font-medium text-[9px]">Pinned</span>
                      </>
                    ) : (
                      <>
                        <Bookmark className="h-3 w-3" />
                        <span className="text-[9px]">Save</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Suggested Prompt Chips (#1) when starting a conversation */}
        {messages.length === 1 && !isLoading && (
          <div className="max-w-3xl mx-auto pl-2 md:pl-12 pr-2 md:pr-4 pt-1 animate-fade-in">
            <p className="text-xs font-semibold text-sky-text-secondary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-sky-ai" /> Suggested Questions ({activeCity})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {getSuggestedQuestions(agentMode, activeCity, t).map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => sendQuery(prompt.query)}
                  className="flex items-center gap-2.5 text-left p-3 rounded-xl border border-sky-border/70 bg-sky-surface/80 hover:bg-sky-surface-elevated hover:border-sky-ai/40 transition-all text-xs text-sky-text-primary group shadow-2xs cursor-pointer"
                >
                  <span className="text-base shrink-0 group-hover:scale-110 transition-transform">{prompt.icon}</span>
                  <span className="font-medium group-hover:text-sky-ai transition-colors leading-snug">{prompt.query}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex w-full max-w-3xl mx-auto gap-4 flex-row">
             <div className="shrink-0 h-8 w-8 rounded-full bg-sky-ai/10 text-sky-ai flex items-center justify-center shadow-sm border border-sky-ai/20">
               <Sparkles className="h-4 w-4" />
             </div>
             <div className="px-5 py-4 rounded-2xl rounded-tl-sm shadow-sm border border-sky-border bg-sky-surface text-sky-text-primary flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-sky-ai" />
                <span className="text-sm font-medium text-sky-text-secondary">Analyzing weather models & synthesizing insights...</span>
             </div>
          </div>
        )}

        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Input Area */}
      <div className="flex-none p-4 bg-sky-background border-t border-sky-border/50 pb-[max(env(safe-area-inset-bottom),1rem)] space-y-2">
        <div className="max-w-3xl mx-auto space-y-2 relative">
          {/* Quick Context Attach Pills (#15) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <span className="text-[10px] uppercase font-bold text-sky-text-secondary/70 shrink-0 mr-0.5">Quick Context:</span>
            {getContextChips(agentMode, t).map((pill, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleAttachContextPill(pill.attach)}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-sky-surface border border-sky-border/70 text-sky-text-secondary hover:text-sky-ai hover:border-sky-ai/40 hover:bg-sky-surface-elevated transition-colors shadow-2xs cursor-pointer"
              >
                <span>{pill.label}</span>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="relative flex items-center shadow-sm rounded-full bg-sky-surface border border-sky-border transition-all focus-within:ring-2 focus-within:ring-sky-ai/20 overflow-hidden">
            <Input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={isListening ? "Listening... speak now" : getPlaceholder(agentMode, activeCity, t)}
              className={cn(
                "flex-1 h-12 md:h-14 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-4 md:px-6 text-sm md:text-base shadow-none",
                isListening && "animate-pulse font-medium text-sky-ai"
              )}
              disabled={isLoading}
            />

            {/* Feature #14: Voice Input Microphone Button */}
            {isVoiceSupported && (
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                className={cn(
                  "h-8 w-8 md:h-9 md:w-9 mr-1.5 rounded-full flex items-center justify-center transition-all cursor-pointer",
                  isListening 
                    ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30 ring-2 ring-red-400/50" 
                    : "text-sky-text-secondary hover:text-sky-ai hover:bg-sky-surface-elevated"
                )}
                title={isListening ? "Stop listening" : "Voice input"}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}

            <Button 
              type="submit" 
              size="icon" 
              className={cn(
                "h-9 w-9 md:h-10 md:w-10 mr-1.5 md:mr-2 rounded-full transition-all duration-300 shadow-sm", 
                inputValue.trim() ? "bg-sky-ai hover:bg-sky-ai/90 text-white" : "bg-sky-surface-elevated text-sky-text-secondary"
              )}
              disabled={isLoading || !inputValue.trim()}
            >
              <Send className="h-4 w-4 ml-0.5" />
            </Button>
          </form>

          {/* Location Context Indicator with Quick Switch Trigger (#7) */}
          <div className="text-center mt-2 md:mt-3 flex items-center justify-center gap-1.5 text-xs text-sky-text-secondary">
             <MapPin className="h-3 w-3 text-sky-primary" />
             <span>Active Context:</span>
             <button
               onClick={() => setShowLocationModal(true)}
               className="font-semibold text-sky-text-primary hover:text-sky-ai underline underline-offset-2 transition-colors cursor-pointer"
             >
               {activeCity} (Switch)
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
