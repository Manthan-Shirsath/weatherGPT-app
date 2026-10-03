import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Send, Sparkles, Bot, User, Loader2, AlertTriangle, CloudRain, MapPin, 
  Droplets, Thermometer, Wind, Clock, ArrowRight, CheckCircle2, XCircle, 
  Bell, BellOff, RefreshCw, ChevronRight, ExternalLink, Layers, Database,
  LineChart, Bookmark, BookmarkCheck, RotateCcw, Sprout, ShieldAlert,
  Mic, MicOff, Edit2, Check, Copy, ChevronDown, Search, ArrowUpRight,
  Plane, Ship, Zap, Gauge, Sun, CloudFog, Info, ShieldCheck, Activity,
  Compass, Radio, Volume2, VolumeX, Globe
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis';
import { useWeatherWebSocket } from '@/hooks/useWeatherWebSocket';
import { DecisionHero } from '@/components/weather/DecisionHero';
import { ForecastChart } from '@/components/weather/ForecastChart';
import { MetricBar } from '@/components/weather/MetricBar';
import { AlertChangeViz, type AlertRecord } from '@/components/weather/AlertChangeViz';
import { AlertTimeline } from '@/components/weather/AlertTimeline';
import { ModeSelector } from './ModeSelector';
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
  data_status?: string;
  city?: string;
  mode?: string;
  isError?: boolean;
  followUps?: string[];
  uncertainty?: {
    level: 'high' | 'moderate' | 'low';
    explanation: string;
    source_disagreement?: boolean;
    disagreement_details?: string;
  };
  risks?: Array<{ hazard: string; severity: string; impact?: string; advice?: string }>;
  recommendations?: Array<{ category: string; action: string; reason?: string; suitability?: string; time_window?: string; source?: string }>;
};

const POPULAR_CITIES = [
  'Pune', 'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 
  'Chennai', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Goa', 
  'London', 'New York', 'Tokyo', 'Dubai', 'Singapore'
];

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

// --- Rich Markdown Renderer ---
function MarkdownRenderer({ content }: { content: string }) {
  const safeContent = typeof content === 'string' ? content : '';
  const lines = safeContent.split('\n');
  const renderedElements: React.ReactNode[] = [];
  let currentList: string[] = [];
  let currentTable: string[][] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      renderedElements.push(
        <ul key={`ul-${renderedElements.length}`} className="my-2 space-y-1.5 pl-4 list-disc marker:text-sky-ai">
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
        const hasSeparator = currentTable[1].every(cell => cell.match(/^[-\s:]+$/));
        const rows = hasSeparator ? currentTable.slice(2) : currentTable.slice(1);

        renderedElements.push(
          <div key={`table-${renderedElements.length}`} className="my-3 overflow-x-auto rounded-xl border border-sky-border/60 bg-sky-surface/80 shadow-2xs">
            <table className="w-full text-left text-xs sm:text-sm text-sky-text-primary">
              <thead className="text-[11px] uppercase tracking-wider bg-sky-surface-elevated/70 border-b border-sky-border text-sky-text-secondary">
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="px-3.5 py-2.5 font-semibold">{renderInlineMarkdown(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-border/30">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-sky-surface-elevated/40 transition-colors">
                    {row.map((cell, j) => (
                      <td key={j} className="px-3.5 py-2">{renderInlineMarkdown(cell)}</td>
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
          <code key={i} className="px-1.5 py-0.5 rounded bg-sky-surface-elevated border border-sky-border text-sky-ai font-mono text-xs">
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
      const cells = trimmed.split('|').slice(1, -1).map(c => c.trim());
      currentTable.push(cells);
      return;
    } else {
      flushTable();
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      currentList.push(trimmed.slice(2));
      return;
    }

    const numMatch = trimmed.match(/^\d+\.\s+(.*)/);
    if (numMatch) {
      flushList();
      flushTable();
      renderedElements.push(
        <div key={`num-${index}`} className="flex items-start gap-2.5 my-1.5 text-[14px]">
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
        <h4 key={`h3-${index}`} className="text-xs sm:text-sm font-bold text-sky-text-primary uppercase tracking-wider mt-3.5 mb-1.5 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-sky-ai inline shrink-0" />
          {renderInlineMarkdown(trimmed.slice(4))}
        </h4>
      );
    } else if (trimmed.startsWith('## ')) {
      renderedElements.push(
        <h3 key={`h2-${index}`} className="text-sm sm:text-base font-bold text-sky-text-primary mt-4 mb-2 border-b border-sky-border/40 pb-1.5">
          {renderInlineMarkdown(trimmed.slice(3))}
        </h3>
      );
    } else if (trimmed.startsWith('# ')) {
      renderedElements.push(
        <h2 key={`h1-${index}`} className="text-base sm:text-lg font-extrabold text-sky-text-primary mt-4 mb-2">
          {renderInlineMarkdown(trimmed.slice(2))}
        </h2>
      );
    } else if (trimmed.startsWith('> ')) {
      renderedElements.push(
        <blockquote key={`quote-${index}`} className="border-l-2 border-sky-ai/70 pl-3 my-2 text-sky-text-secondary italic text-xs bg-sky-ai/5 py-1.5 rounded-r">
          {renderInlineMarkdown(trimmed.slice(2))}
        </blockquote>
      );
    } else if (trimmed === '') {
      renderedElements.push(<div key={`spacer-${index}`} className="h-1.5" />);
    } else {
      renderedElements.push(
        <p key={`p-${index}`} className="text-[14px] sm:text-[14.5px] leading-relaxed text-sky-text-primary">
          {renderInlineMarkdown(line)}
        </p>
      );
    }
  });

  flushList();
  flushTable();
  return <div className="space-y-1">{renderedElements}</div>;
}

// Generate smart follow-up suggestions
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
  if (mode === 'aviation' || lower.includes('metar') || lower.includes('crosswind') || lower.includes('ceiling')) {
    suggestions.push(`Crosswind component for runway operations at ${city}`);
    suggestions.push(`Ceiling & visibility trend for next 6 hours`);
  }
  if (mode === 'marine' || lower.includes('wave') || lower.includes('swell') || lower.includes('tide')) {
    suggestions.push(`Swell direction and period forecast near ${city}`);
    suggestions.push(`Tide changes over the next 6 hours`);
  }
  if (mode === 'research' || lower.includes('anomaly') || lower.includes('historical')) {
    suggestions.push(`Compare this month with 30-year normal in ${city}`);
    suggestions.push(`Historical extreme heat frequency for ${city}`);
  }

  if (suggestions.length < 2) {
    suggestions.push(`What is the weekend forecast for ${city}?`);
    suggestions.push(`Is tomorrow good for outdoor activities?`);
  }

  return Array.from(new Set(suggestions)).slice(0, 3);
}

// --- Component ---
export default function WeatherGPTPage() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCity = searchParams.get('city') || 'Pune';
  
  const [activeCity, setActiveCity] = useState<string>(initialCity);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState<string>('auto');

  // Real-time WebSocket connection state
  const { connectionState, isConnected } = useWeatherWebSocket(activeCity);
  
  // Inline Location Switcher modal state
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationSearchInput, setLocationSearchInput] = useState('');

  // Editing state for previous message
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  // Pinned Messages state
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

  // Text-to-Speech hook
  const {
    isSpeaking,
    isSupported: isSpeechSupported,
    activeId: activeSpeakerId,
    speak,
    stop: stopSpeaking
  } = useSpeechSynthesis();

  // Voice Input hook with state machine
  const {
    voiceState,
    isListening,
    transcript,
    isSupported: isVoiceSupported,
    error: voiceError,
    startListening,
    stopListening,
    resetTranscript
  } = useSpeechRecognition({
    continuous: false,
    lang: i18n.resolvedLanguage || i18n.language || 'en',
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

  // Function to switch city inline
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
    stopSpeaking();
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
  }, [activeCity, agentMode, t, stopSpeaking]);
  
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
  }, [activeCity, messages.length, agentMode, t]);

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
      const activeLang = i18n.resolvedLanguage || i18n.language || 'en';
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
          language: activeLang,
          context: {
             page: '/weathergpt',
             active_city: cityToUse,
             language: activeLang
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
      const followUps = (data.follow_up_questions && data.follow_up_questions.length > 0)
        ? data.follow_up_questions
        : generateFollowUps('model', data.reply || '', modelCity, agentMode);

      const newModelMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: data.reply || '',
        timestamp: data.timestamp ? new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cards: data.cards,
        sources: data.sources,
        data_status: data.data_status || 'fresh',
        city: modelCity,
        mode: agentMode,
        followUps,
        uncertainty: data.uncertainty,
        risks: data.risks,
        recommendations: data.recommendations
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
  }, [activeCity, agentMode, sessionId, isLoading, t]);

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

  // Monitoring helpers
  const loadAlerts = useCallback(async (sid: string) => {
    try {
      const res = await apiFetch(`/api/v1/alerts/history?session_id=${encodeURIComponent(sid)}`);
      if (res.ok) {
        const d = await res.json();
        setAlerts(d.alerts || []);
        if ((d.alerts || []).length > 0) setShowAlertPanel(true);
      }
    } catch { /* silent */ }
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
    try {
      const res = await apiFetch('/api/v1/alerts/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, ...opts }),
      });
      if (res.ok) {
        const d = await res.json();
        setActiveMonitor({ ...d.monitor, enabled: true });
        setIsMonitoring(true);
        await apiFetch('/api/v1/alerts/trigger_check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, monitor_id: d.monitor.monitor_id }),
        });
      }
    } catch { /* silent */ } finally {
      setMonitoringBusy(false);
    }
  }, [sessionId]);

  const handleTriggerCheck = useCallback(async () => {
    if (!sessionId) return;
    setMonitoringBusy(true);
    try {
      const res = await apiFetch('/api/v1/alerts/trigger_check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (res.ok) {
        await loadAlerts(sessionId);
      }
    } catch { /* silent */ } finally {
      setMonitoringBusy(false);
    }
  }, [sessionId, loadAlerts]);

  const handleDisableMonitor = useCallback(async () => {
    if (!sessionId || !activeMonitor) return;
    try {
      await apiFetch(`/api/v1/alerts/monitor/${activeMonitor.monitor_id}?session_id=${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
      setActiveMonitor(null);
      setIsMonitoring(false);
    } catch { /* silent */ }
  }, [sessionId, activeMonitor]);

  useEffect(() => {
    if (sessionId) loadAlerts(sessionId);
  }, [sessionId, loadAlerts]);

  // Structured response card renderers
  const renderCard = (card: CardItem, index: number) => {
    if (card.type === 'weather_summary') {
      const data = card.data;
      const rain = data.rain_probability_pct ?? data.precipitation_probability ?? 0;
      const wind = data.wind_speed_kmh ?? data.windSpeed;
      const humidity = data.humidity;
      return (
        <Card key={index} className="my-3 border-sky-border bg-sky-surface-elevated/70 shadow-sm max-w-2xl w-full animate-fade-slide-in rounded-xl overflow-hidden">
          <CardHeader className="pb-2.5 pt-3.5 px-4 border-b border-sky-border/40 bg-sky-surface/50">
            <CardTitle className="text-xs font-semibold flex items-center justify-between text-sky-text-primary">
               <span className="flex items-center gap-1.5 uppercase tracking-wider font-mono text-[11px] text-sky-primary">
                 <MapPin className="h-3.5 w-3.5" />
                 {data.location || data.name || 'Location'} · KEY CONDITIONS
               </span>
               {data.nwp_model && (
                 <Badge variant="outline" className="text-[10px] py-0 border-sky-border/60 text-sky-text-secondary font-mono">
                   {data.nwp_model}
                 </Badge>
               )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
             <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                   <div className="flex items-baseline gap-2">
                     <span className="text-3xl sm:text-4xl font-black text-sky-text-primary tracking-tight leading-none">
                       {data.temperature_c !== undefined ? Math.round(data.temperature_c) : '--'}°C
                     </span>
                     {data.feels_like_c !== undefined && (
                       <span className="text-xs text-sky-text-secondary font-medium">
                         Feels like {Math.round(data.feels_like_c)}°C
                       </span>
                     )}
                   </div>
                   {data.condition && (
                     <p className="text-xs font-semibold text-sky-text-primary mt-1">
                       {data.condition}
                     </p>
                   )}
                </div>
                
                {/* Condition Icon */}
                {data.condition && (
                  <div className="text-right">
                     <span className="text-3xl leading-none">
                       {data.condition.toLowerCase().includes('rain') ? '🌧️' :
                        data.condition.toLowerCase().includes('cloud') ? '☁️' :
                        data.condition.toLowerCase().includes('clear') || data.condition.toLowerCase().includes('sunny') ? '☀️' :
                        data.condition.toLowerCase().includes('storm') ? '⛈️' : '🌤️'}
                     </span>
                  </div>
                )}
             </div>

             {/* Metric Progress Bars */}
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 border-t border-sky-border/40 pt-3">
               {rain > 0 && <MetricBar value={rain} label="Rain Probability" unit="%" colorScale="rain" size="sm" />}
               {data.precipitation != null && data.precipitation > 0 && (
                 <MetricBar value={data.precipitation} max={50} label="Precipitation Amount" unit=" mm" colorScale="rain" size="sm" />
               )}
               {wind != null && <MetricBar value={wind} max={80} label="Wind Speed" unit=" km/h" colorScale="wind" size="sm" />}
               {humidity != null && <MetricBar value={humidity} label="Relative Humidity" unit="%" colorScale="humidity" size="sm" />}
             </div>

             {data.main_concern && (
               <div className="bg-amber-500/10 p-2.5 rounded-lg text-xs text-amber-300 border border-amber-500/25 flex items-start gap-2">
                 <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                 <div>
                   <span className="font-semibold text-amber-300">Meteorological Concern:</span> {data.main_concern}
                 </div>
               </div>
             )}
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
        <Card key={index} className="my-3 border-sky-border bg-sky-surface-elevated/70 shadow-sm max-w-2xl w-full animate-fade-slide-in rounded-xl overflow-hidden">
          <CardHeader className="pb-2 pt-3 px-4 border-b border-sky-border/40 bg-sky-surface/50">
            <CardTitle className="text-xs font-semibold flex items-center justify-between text-sky-text-primary">
               <span className="flex items-center gap-1.5 uppercase tracking-wider font-mono text-[11px] text-sky-primary">
                 <Clock className="h-3.5 w-3.5" />
                 {data.location} · FORECAST TIMELINE
               </span>
               {data.nwp_model && (
                 <Badge variant="outline" className="text-[10px] py-0 border-sky-border/60 text-sky-text-secondary font-mono">
                   {data.nwp_model}
                 </Badge>
               )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 space-y-3">
            <ForecastChart
              slots={slots}
              eventHour={eventHour}
              location={data.location}
              nwpModel={data.nwp_model}
            />
            {analytics && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 border-t border-sky-border/40 pt-2.5">
                {analytics.rain_trend && (
                  <div className="bg-sky-surface/60 p-2 rounded-lg border border-sky-border/40">
                    <p className="text-[10px] text-sky-text-secondary uppercase tracking-wider font-medium">Rain trend</p>
                    <p className="text-xs font-bold text-sky-text-primary capitalize mt-0.5">
                      {analytics.rain_trend} {analytics.rain_trend === 'increasing' ? '↗' : analytics.rain_trend === 'decreasing' ? '↘' : '→'}
                    </p>
                  </div>
                )}
                {analytics.temperature_trend && (
                  <div className="bg-sky-surface/60 p-2 rounded-lg border border-sky-border/40">
                    <p className="text-[10px] text-sky-text-secondary uppercase tracking-wider font-medium">Temp trend</p>
                    <p className="text-xs font-bold text-sky-text-primary capitalize mt-0.5">
                      {analytics.temperature_trend} {analytics.temperature_trend === 'rising' ? '↗' : analytics.temperature_trend === 'falling' ? '↘' : '→'}
                    </p>
                  </div>
                )}
                {analytics.best_dry_window && (
                  <div className="col-span-2 sm:col-span-1 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                    <p className="text-[10px] text-emerald-400 uppercase tracking-wider font-medium">Best dry window</p>
                    <p className="text-xs font-bold text-emerald-400 mt-0.5">{analytics.best_dry_window}</p>
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
        <Card key={index} className="my-3 border-sky-border bg-sky-surface-elevated/70 shadow-sm max-w-2xl w-full rounded-xl overflow-hidden">
          <CardHeader className="pb-2 pt-3.5 px-4 border-b border-sky-border/40 bg-sky-surface/50">
            <CardTitle className="text-xs font-semibold text-sky-primary uppercase tracking-wider font-mono flex items-center gap-1.5">
               <Activity className="h-3.5 w-3.5" />
               {data.location} · MODEL & TIMELINE CONSENSUS
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
             <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                 {(data.comparisons || data.comparison) && (data.comparisons || data.comparison).map((day: any, i: number) => (
                    <div key={i} className="p-2.5 rounded-lg bg-sky-surface/60 border border-sky-border/50 text-center">
                       <p className="text-[11px] font-bold text-sky-text-primary uppercase mb-1">{day.date}</p>
                       <div className="space-y-1 text-xs">
                          <p className="text-sky-text-secondary"><Thermometer className="h-3 w-3 inline mr-1 text-amber-400" />{day.temperature_max_c ?? day.high_c ?? '--'}°C</p>
                          <p className="text-sky-text-secondary"><Droplets className="h-3 w-3 inline mr-1 text-sky-400" />{day.precipitation_probability ?? 0}%</p>
                       </div>
                    </div>
                 ))}
                 {data.models && data.models.map((model: any, i: number) => (
                    <div key={`model-${i}`} className="p-2.5 rounded-lg bg-sky-surface/60 border border-sky-border/50 text-center">
                       <p className="text-[11px] font-bold text-sky-text-primary uppercase mb-1">{model.model_name}</p>
                       <div className="space-y-1 text-xs">
                          <p className="text-sky-text-secondary"><Thermometer className="h-3 w-3 inline mr-1 text-amber-400" />{model.temperature_high_c ?? '--'}°C</p>
                          <p className="text-sky-text-secondary"><Droplets className="h-3 w-3 inline mr-1 text-sky-400" />{model.total_precipitation_mm ? `${model.total_precipitation_mm} mm` : '0 mm'}</p>
                       </div>
                    </div>
                 ))}
             </div>
             {data.verdict && (
                 <div className="mt-3 pt-3 border-t border-sky-border/40 text-xs font-medium text-sky-text-primary">
                    <span className="text-sky-ai font-semibold">Synthesis:</span> {data.verdict}
                 </div>
             )}
          </CardContent>
        </Card>
       );
    }

    if (card.type === 'alert' || card.type === 'weather_alert') {
      const data = card.data;
      const severity = (data.severity || 'INFO').toUpperCase();
      const isCritical = severity === 'CRITICAL' || severity === 'EXTREME';
      const isWarning = severity === 'WARNING' || severity === 'SEVERE';
      const isWatch = severity === 'WATCH' || severity === 'MODERATE';

      const borderClass = isCritical ? "border-rose-500/40 bg-rose-500/10 text-rose-300" :
                          isWarning ? "border-amber-500/40 bg-amber-500/10 text-amber-300" :
                          isWatch ? "border-orange-500/40 bg-orange-500/10 text-orange-300" :
                          "border-sky-500/40 bg-sky-500/10 text-sky-300";

      return (
        <div key={index} className={cn("my-3 p-3.5 rounded-xl border max-w-2xl w-full", borderClass)}>
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-bold text-xs uppercase tracking-wider font-mono">[{severity}] {data.headline || data.event || 'Weather Advisory'}</span>
          </div>
          {data.description && <p className="text-xs text-sky-text-primary leading-relaxed">{data.description}</p>}
          {data.instruction && (
            <p className="text-xs font-medium text-sky-text-primary mt-2 pt-1.5 border-t border-current/20">
              Action: {data.instruction}
            </p>
          )}
        </div>
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
          <button onClick={handleDisableMonitor} className="ml-auto text-sky-text-secondary hover:text-sky-danger transition-colors cursor-pointer">
            <BellOff className="h-3 w-3" />
          </button>
        </div>
      );
    }
    return (
      <button
        onClick={() => handleCreateMonitor({ location, activity, target_hour, time_label, target_date })}
        disabled={monitoringBusy}
        className="mt-2 w-full max-w-2xl flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg border border-sky-border/50 bg-sky-surface-elevated hover:bg-sky-ai/10 hover:border-sky-ai/40 transition-all text-xs text-sky-text-secondary hover:text-sky-ai group cursor-pointer"
      >
        {monitoringBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3 group-hover:scale-110 transition-transform" />}
        <span className="font-medium">{t('weathergpt.monitor_this', 'Monitor this')}</span>
      </button>
    );
  };

  const currentModeConfig = getModeConfig(agentMode, t);
  const CurrentModeIcon = currentModeConfig.icon;

  return (
    <div className={cn("flex flex-col h-full bg-sky-background relative overflow-hidden", currentModeConfig.headerAccentClass)}>
      {/* ── Compact Workstation Header ────────────────────────────────────────── */}
      <div className="flex-none px-4 md:px-6 py-2.5 border-b border-sky-border bg-sky-surface flex items-center justify-between z-10 shrink-0">
         <div className="flex items-center gap-3">
           {/* Workspace Identity */}
           <div className="flex items-center gap-2">
             <Sparkles className="h-4 w-4 text-sky-ai" />
             <h1 className="text-sm sm:text-base font-bold text-sky-text-primary tracking-tight">
                WeatherGPT
             </h1>
           </div>

           {/* Location Chip & Inline Switcher Trigger */}
           <button
             onClick={() => setShowLocationModal(true)}
             className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-sky-surface-elevated border border-sky-border hover:border-sky-ai/40 hover:bg-sky-ai/10 text-sky-text-primary transition-all group cursor-pointer"
             title="Click to switch city context"
           >
             <MapPin className="h-3.5 w-3.5 text-sky-primary group-hover:scale-110 transition-transform" />
             <span className="font-semibold">{activeCity}</span>
             <ChevronDown className="h-3 w-3 text-sky-text-secondary group-hover:text-sky-ai transition-colors" />
           </button>

           {/* Live WebSocket Status Pill */}
           <div className="hidden sm:flex items-center">
             {connectionState === 'live' ? (
               <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                 <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                 Live
               </span>
             ) : connectionState === 'reconnecting' ? (
               <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                 <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                 Reconnecting...
               </span>
             ) : (
               <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">
                 <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                 Offline
               </span>
             )}
           </div>
         </div>

         {/* Right actions: New Chat, Pinned, Mode Selector */}
         <div className="flex items-center gap-2">
           {/* Compact Multilingual Selector */}
           <div className="flex items-center rounded-lg border border-sky-border/70 bg-sky-surface p-0.5 text-[11px] font-medium" role="group" aria-label="Select WeatherGPT language">
             {[
               { code: 'en', label: 'EN' },
               { code: 'hi', label: 'हिन्दी' },
               { code: 'mr', label: 'मराठी' },
             ].map((lang) => {
               const isActive = (i18n.resolvedLanguage === lang.code) || 
                 (lang.code === 'en' && !['hi', 'mr'].includes(i18n.resolvedLanguage || ''));
               return (
                 <button
                   key={lang.code}
                   type="button"
                   onClick={() => i18n.changeLanguage(lang.code)}
                   className={cn(
                     "px-2 py-0.5 rounded-md transition-all cursor-pointer text-xs",
                     isActive
                       ? "bg-sky-ai text-white font-semibold shadow-2xs"
                       : "text-sky-text-secondary hover:text-sky-text-primary"
                   )}
                   title={`Switch to ${lang.label}`}
                 >
                   {lang.label}
                 </button>
               );
             })}
           </div>

           {/* New Chat Button */}
           <Button
             variant="outline"
             size="sm"
             onClick={handleResetChat}
             className="h-7 px-2.5 text-xs gap-1.5 border-sky-border/70 hover:bg-sky-surface-elevated text-sky-text-secondary hover:text-sky-text-primary transition-colors cursor-pointer"
             title="Start a fresh conversation"
           >
             <RotateCcw className="h-3 w-3 text-sky-ai" />
             <span className="hidden sm:inline">New Chat</span>
           </Button>

           {/* Pinned Insights Toggle */}
           {pinnedIds.length > 0 && (
             <Button
               variant="outline"
               size="sm"
               onClick={() => setShowPinnedDrawer(p => !p)}
               className={cn(
                 "h-7 px-2.5 text-xs gap-1.5 border-sky-ai/40 transition-colors cursor-pointer",
                 showPinnedDrawer ? "bg-sky-ai/20 text-sky-ai" : "bg-sky-ai/10 text-sky-ai hover:bg-sky-ai/15"
               )}
               title="View saved weather insights"
             >
               <BookmarkCheck className="h-3 w-3 text-sky-ai fill-sky-ai/30" />
               <span>Pinned ({pinnedIds.length})</span>
             </Button>
           )}

           {/* Alert history badge */}
           {alerts.length > 0 && (
             <button
               onClick={() => setShowAlertPanel(p => !p)}
               className="relative flex items-center gap-1 text-xs font-medium text-amber-300 border border-amber-500/30 bg-amber-500/10 rounded-lg px-2 py-1 hover:bg-amber-500/20 transition-colors cursor-pointer"
             >
               <AlertTriangle className="h-3 w-3 text-amber-400" />
               <span>{alerts.length} alert{alerts.length > 1 ? 's' : ''}</span>
             </button>
           )}

           {/* Intelligence Mode Dropdown */}
           <ModeSelector
             value={agentMode}
             onChange={setAgentMode}
           />
         </div>
      </div>

      {/* Persistent Disclaimer Banner for Safety-Critical Modes */}
      {currentModeConfig.disclaimerBanner && (
        <div className="flex-none px-4 md:px-6 py-2 bg-amber-500/10 border-b border-amber-500/25 text-amber-200 text-xs flex items-start gap-2 animate-fade-in z-10">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{currentModeConfig.disclaimerBanner}</p>
        </div>
      )}

      {/* Inline Location Switcher Modal */}
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
                  className="absolute right-1.5 h-7 px-2.5 text-xs bg-sky-primary hover:bg-sky-primary/90 text-white cursor-pointer"
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

      {/* Pinned Insights Drawer */}
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

      {/* ── Main Scroll Area (Messages) ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scroll-smooth relative flex flex-col">
        <div className="p-4 md:p-6 space-y-6 flex-1 max-w-4xl w-full mx-auto">
        {messages.map((msg, msgIndex) => (
          <div 
            key={msg.id} 
            className="w-full"
          >
            {msg.role === 'user' ? (
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-1.5 mb-1 text-sky-text-secondary uppercase tracking-widest text-[10px] font-bold">
                  <User className="h-3 w-3 text-sky-primary" />
                  <span>You</span>
                </div>
                
                {/* User Message Bubble / Edit Mode */}
                {editingMessageId === msg.id ? (
                  <div className="w-full bg-sky-surface p-3 rounded-2xl border border-sky-ai shadow-md space-y-2 mt-1">
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
                        className="h-7 px-2.5 text-xs text-sky-text-secondary cursor-pointer"
                      >
                        Cancel
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={() => handleSaveEditMessage(msg.id)}
                        className="h-7 px-3 text-xs bg-sky-primary hover:bg-sky-primary/90 text-white cursor-pointer"
                      >
                        Save & Resend
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="relative group max-w-2xl bg-sky-surface-elevated/80 border border-sky-border/80 px-4 py-2.5 rounded-2xl rounded-tr-xs text-sky-text-primary text-sm shadow-2xs">
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    <button
                      onClick={() => {
                        setEditingMessageId(msg.id);
                        setEditingContent(msg.content);
                      }}
                      className="absolute -left-6 top-2 opacity-0 group-hover:opacity-100 text-sky-text-secondary hover:text-sky-ai transition-opacity p-1 cursor-pointer"
                      title="Edit and resend"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col pt-4 border-t border-sky-border/40">
                {/* Assistant Message Header Bar */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-md bg-sky-ai/10 border border-sky-ai/30 flex items-center justify-center">
                      <Sparkles className="h-3.5 w-3.5 text-sky-ai" />
                    </div>
                    <span className="text-xs font-bold text-sky-text-primary font-mono tracking-tight">WeatherGPT</span>
                    
                    {/* Specialist Mode Pill */}
                    {(() => {
                      const modeCfg = getModeConfig(msg.mode || 'auto', t);
                      const ModeIcon = modeCfg.icon;
                      return (
                        <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border", modeCfg.badgeColor)}>
                          <ModeIcon className="h-2.5 w-2.5" />
                          <span>{modeCfg.label}</span>
                        </span>
                      );
                    })()}

                    {/* Freshness Badge */}
                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-sky-text-secondary font-mono">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      {msg.data_status === 'stale' ? 'Cached Data' : 'Live Data'}
                    </span>

                    {msg.isError && <span className="text-rose-400 bg-rose-500/10 text-[10px] px-2 py-0.5 rounded font-mono border border-rose-500/20">Error</span>}
                  </div>

                  <div className="flex items-center gap-1.5 text-sky-text-secondary text-xs">
                    <span className="text-[11px] font-mono">{msg.timestamp}</span>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {/* AI Summary Markdown Content */}
                  <div className={cn("text-[14px] sm:text-[14.5px] leading-relaxed", msg.isError ? "text-rose-400" : "text-sky-text-primary")}>
                    <MarkdownRenderer content={msg.content} />
                  </div>
                  
                  {/* Structured Visual Cards */}
                  {msg.cards && msg.cards.length > 0 && (
                    <div className="mt-3 flex flex-col gap-2.5 w-full">
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
                    </div>
                  )}
                  
                  {/* Phase 5 Actionable Uncertainty & Model Disagreement Bar */}
                  {!msg.isError && msg.uncertainty && (
                    <div className="mt-3 p-2.5 rounded-xl bg-sky-surface-elevated/70 border border-sky-border/60 text-xs space-y-1.5 animate-fade-in">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="flex items-center gap-1.5 font-semibold text-[11px] text-sky-text-primary">
                          <Gauge className="h-3.5 w-3.5 text-sky-ai" />
                          CONFIDENCE & UNCERTAINTY:
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-mono px-2 py-0.5 uppercase tracking-wider font-bold",
                            msg.uncertainty.level === 'high' && "border-emerald-500/50 bg-emerald-500/10 text-emerald-400",
                            msg.uncertainty.level === 'moderate' && "border-amber-500/50 bg-amber-500/10 text-amber-400",
                            msg.uncertainty.level === 'low' && "border-rose-500/50 bg-rose-500/10 text-rose-400"
                          )}
                        >
                          {msg.uncertainty.level} Confidence
                        </Badge>
                      </div>
                      <p className="text-[11px] text-sky-text-secondary leading-relaxed">
                        {msg.uncertainty.explanation}
                      </p>
                      {msg.uncertainty.source_disagreement && msg.uncertainty.disagreement_details && (
                        <div className="mt-1 pt-1.5 border-t border-sky-border/40 flex items-start gap-1.5 text-[11px] text-amber-300/90">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-400" />
                          <span><strong>Model Spread:</strong> {msg.uncertainty.disagreement_details}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Provenance Metadata Citation & Link to Model Intelligence */}
                  {!msg.isError && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-sky-border/30">
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="flex items-center flex-wrap gap-1.5 py-1 px-2.5 rounded-lg bg-sky-surface-elevated border border-sky-border/60 text-[11px] text-sky-text-secondary">
                          <Database className="h-3 w-3 text-sky-primary" />
                          <span className="font-semibold text-sky-text-primary">Provenance:</span>
                          {msg.sources.map((s, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1 font-mono text-[10px] bg-sky-surface px-1.5 py-0.5 rounded border border-sky-border/40 text-sky-text-secondary">
                              {s.model || s.name || s.source || 'Weather Data'}
                              {s.freshness && <span className="text-emerald-400 font-sans">({s.freshness})</span>}
                            </span>
                          ))}
                        </div>
                      )}

                      {(msg.cards?.some(c => ['weather_summary', 'forecast_timeline', 'decision', 'date_comparison'].includes(c.type)) || (msg.sources && msg.sources.length > 0)) && (
                        <Link
                          to={`/forecast-intelligence?city=${encodeURIComponent(msg.city || activeCity)}`}
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-ai hover:text-sky-primary bg-sky-ai/10 hover:bg-sky-ai/20 border border-sky-ai/30 px-2.5 py-1 rounded-lg transition-all group shadow-2xs cursor-pointer"
                        >
                          <LineChart className="h-3 w-3 group-hover:scale-110 transition-transform" />
                          <span>Full Model Comparison ({msg.city || activeCity})</span>
                          <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                      )}
                    </div>
                  )}

                  {/* Contextual Follow-Up Suggestions */}
                  {!msg.isError && msg.followUps && msg.followUps.length > 0 && (
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

                  {/* Actions Footer Bar */}
                  <div className="flex items-center gap-3 pt-2 text-[11px] text-sky-text-secondary flex-wrap">
                    <span className="font-medium text-sky-text-secondary/70">{msg.city}</span>

                    <div className="flex items-center gap-2 ml-auto">
                      {!msg.isError && msgIndex > 0 && (
                        <button
                          onClick={() => handleRegenerate(msgIndex)}
                          className="inline-flex items-center gap-1 hover:text-sky-ai transition-colors cursor-pointer"
                          title="Regenerate this response"
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span className="hidden sm:inline">Regenerate</span>
                        </button>
                      )}
                      
                      {/* Text-to-Speech (TTS) Read Aloud */}
                      {isSpeechSupported && !msg.isError && (
                        <button
                          onClick={() => speak(msg.id, msg.content, i18n.resolvedLanguage || i18n.language || 'en')}
                          className={cn(
                            "inline-flex items-center gap-1 transition-colors cursor-pointer",
                            isSpeaking && activeSpeakerId === msg.id 
                              ? "text-sky-ai font-semibold animate-pulse" 
                              : "hover:text-sky-text-primary"
                          )}
                          title={isSpeaking && activeSpeakerId === msg.id ? "Stop reading" : "Read aloud (Text-to-Speech)"}
                        >
                          {isSpeaking && activeSpeakerId === msg.id ? (
                            <>
                              <VolumeX className="h-3 w-3 text-sky-ai" />
                              <span className="hidden sm:inline text-sky-ai font-medium">Stop</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="h-3 w-3" />
                              <span className="hidden sm:inline">Listen</span>
                            </>
                          )}
                        </button>
                      )}

                      <button
                        onClick={() => handleCopyMessage(msg.id, msg.content)}
                        className="inline-flex items-center gap-1 hover:text-sky-text-primary transition-colors cursor-pointer"
                        title="Copy message text"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            <span className="text-emerald-400 hidden sm:inline">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span className="hidden sm:inline">Copy</span>
                          </>
                        )}
                      </button>

                      {!msg.isError && (
                        <button
                          onClick={() => togglePinMessage(msg.id)}
                          className="inline-flex items-center gap-1 hover:text-sky-ai transition-colors cursor-pointer"
                          title={pinnedIds.includes(msg.id) ? "Unpin Insight" : "Pin Insight for later"}
                        >
                          {pinnedIds.includes(msg.id) ? (
                            <>
                              <BookmarkCheck className="h-3 w-3 text-sky-ai fill-sky-ai/30" />
                              <span className="text-sky-ai hidden sm:inline">Pinned</span>
                            </>
                          ) : (
                            <>
                              <Bookmark className="h-3 w-3" />
                              <span className="hidden sm:inline">Save</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Suggested Questions Grid when starting a fresh session */}
        {messages.length === 1 && !isLoading && (
          <div className="pt-4 animate-fade-in">
            <p className="text-[11px] font-semibold text-sky-text-secondary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-sky-ai" /> Suggested Questions ({activeCity})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {getSuggestedQuestions(agentMode, activeCity, t).map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => sendQuery(prompt.query)}
                  className="flex items-center gap-3 text-left p-3.5 rounded-xl border border-sky-border/70 bg-sky-surface-elevated hover:border-sky-ai/50 hover:bg-sky-ai/5 transition-all text-xs sm:text-sm text-sky-text-primary group shadow-2xs cursor-pointer"
                >
                  <span className="text-lg shrink-0 group-hover:scale-110 transition-transform">{prompt.icon}</span>
                  <span className="font-medium group-hover:text-sky-ai transition-colors leading-snug">{prompt.query}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="w-full border-t border-sky-border/40 pt-4">
            <div className="flex items-center gap-2 mb-2 text-sky-ai uppercase tracking-widest text-[10px] font-bold">
              <Sparkles className="h-3.5 w-3.5" />
              <span>WeatherGPT Intelligence Engine Analyzing...</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-sky-text-secondary p-3 rounded-xl bg-sky-surface-elevated/50 border border-sky-border/50">
               <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-ai shrink-0" />
               <span>Querying meteorological data & synthesizing forecast models for {activeCity}...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} className="h-2" />
        </div>

        {/* ── Weather Analysis Command Bar (Sticky Composer) ─────────────────── */}
        <div className="sticky bottom-0 p-3 sm:p-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] bg-sky-background/95 backdrop-blur-md border-t border-sky-border/30 z-10 shrink-0">
          <div className="max-w-4xl mx-auto space-y-2">
            
            {/* Quick Context Attach Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-[10px] uppercase tracking-wider font-bold text-sky-text-secondary/70 shrink-0 mr-1 flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5 text-sky-ai" /> Context:
              </span>
              {getContextChips(agentMode, t).map((pill, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleAttachContextPill(pill.attach)}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-sky-surface-elevated border border-sky-border/60 text-sky-text-secondary hover:text-sky-ai hover:border-sky-ai/40 transition-colors shadow-2xs cursor-pointer"
                >
                  <span>{pill.label}</span>
                </button>
              ))}
            </div>

            {/* Voice State Status Indicator */}
            {voiceState !== 'IDLE' && (
              <div 
                className={cn(
                  "flex items-center justify-between text-xs px-3 py-1.5 rounded-lg border transition-all animate-fade-in",
                  voiceState === 'LISTENING' && "bg-rose-500/10 border-rose-500/30 text-rose-300",
                  voiceState === 'PROCESSING' && "bg-sky-ai/10 border-sky-ai/30 text-sky-ai",
                  voiceState === 'ERROR' && "bg-amber-500/10 border-amber-500/30 text-amber-300"
                )}
                role="status"
                aria-live="polite"
              >
                <div className="flex items-center gap-2">
                  {voiceState === 'LISTENING' && (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                      </span>
                      <span className="font-medium text-xs">
                        🎙️ Listening ({i18n.resolvedLanguage ? i18n.resolvedLanguage.toUpperCase() : 'EN'})... Speak your weather query
                      </span>
                    </>
                  )}
                  {voiceState === 'PROCESSING' && (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-ai" />
                      <span className="font-medium text-xs">Transcribing voice input...</span>
                    </>
                  )}
                  {voiceState === 'ERROR' && (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="text-[11px] font-medium">{voiceError || 'Voice input failed. You can type instead.'}</span>
                    </>
                  )}
                </div>
                {voiceState === 'LISTENING' ? (
                  <button 
                    type="button" 
                    onClick={stopListening} 
                    className="text-[10px] font-bold uppercase tracking-wider underline hover:text-white cursor-pointer px-1 py-0.5"
                  >
                    Done
                  </button>
                ) : (
                  <button 
                    type="button" 
                    onClick={resetTranscript} 
                    className="text-[10px] font-bold uppercase tracking-wider underline hover:text-white cursor-pointer px-1 py-0.5"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            )}

            {/* Weather Analysis Command Bar Input */}
            <form 
              onSubmit={handleSubmit} 
              className="relative flex items-center bg-sky-surface-elevated border border-sky-border shadow-md rounded-xl overflow-hidden transition-all focus-within:ring-2 focus-within:ring-sky-ai/30 focus-within:border-sky-ai/50 h-12"
            >
              <div className="flex items-center justify-center pl-3.5 pr-1 text-sky-text-secondary">
                 <CurrentModeIcon className={cn("h-4 w-4", currentModeConfig.badgeColor.replace('bg-', 'text-').split(' ')[1] || 'text-sky-ai')} />
              </div>
              
              <Input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={isListening ? "Listening... speak now" : getPlaceholder(agentMode, activeCity, t)}
                className={cn(
                  "flex-1 h-full bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-2.5 text-xs sm:text-sm shadow-none text-sky-text-primary",
                  isListening && "animate-pulse font-medium text-sky-ai"
                )}
                disabled={isLoading}
              />

              {/* Voice Input Microphone Button */}
              {isVoiceSupported ? (
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  className={cn(
                    "h-8 w-8 mr-1 rounded-lg flex items-center justify-center transition-all cursor-pointer",
                    isListening 
                      ? "bg-rose-500/20 text-rose-400 animate-pulse shadow-inner" 
                      : "text-sky-text-secondary hover:text-sky-ai hover:bg-sky-ai/10"
                  )}
                  title={isListening ? "Stop listening" : `Voice input (${i18n.resolvedLanguage?.toUpperCase() || 'EN'})`}
                  aria-label={isListening ? "Stop voice listening" : "Start voice input"}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="h-8 w-8 mr-1 rounded-lg flex items-center justify-center text-sky-text-secondary/40 cursor-not-allowed opacity-50"
                  title="Voice input not supported in this browser"
                  aria-label="Voice input not supported"
                >
                  <MicOff className="h-4 w-4" />
                </button>
              )}

              {/* Send Button */}
              <Button 
                type="submit" 
                size="icon" 
                className={cn(
                  "h-8 w-8 mr-2 rounded-lg transition-all duration-200 shadow-2xs flex items-center justify-center cursor-pointer", 
                  inputValue.trim() ? "bg-sky-ai hover:bg-sky-ai/90 text-white" : "bg-sky-surface text-sky-text-secondary/40 border border-sky-border"
                )}
                disabled={isLoading || !inputValue.trim()}
              >
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </form>

            {/* Bottom Status & Context Bar */}
            <div className="flex items-center justify-between text-[10px] text-sky-text-secondary px-1">
               <div className="flex items-center gap-1.5">
                 <MapPin className="h-3 w-3 text-sky-text-secondary/70" />
                 <span>Target Context:</span>
                 <button
                   onClick={() => setShowLocationModal(true)}
                   className="font-semibold text-sky-text-primary hover:text-sky-ai underline underline-offset-2 decoration-sky-border hover:decoration-sky-ai transition-colors cursor-pointer"
                 >
                   {activeCity}
                 </button>
               </div>
               
               <div className="flex items-center gap-1 opacity-70">
                 <Radio className="h-2.5 w-2.5 text-emerald-400" />
                 <span>Continuous Tool Grounding Active</span>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
