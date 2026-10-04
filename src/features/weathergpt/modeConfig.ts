/**
 * modeConfig.ts — Single source of truth for all WeatherGPT agent modes.
 *
 * Each ModeConfig drives:
 *   - Mode dropdown (label, icon, description, accent)
 *   - Quick Context chips (mode-aware)
 *   - Suggested Questions cards (mode-aware)
 *   - Input placeholder text
 *   - Badge colors on chat messages
 *   - Header / visual identity accent
 */

import type { TFunction } from 'i18next';
import {
  Sparkles, CloudRain, Sprout, ShieldAlert, Plane, Ship, Building2,
  type LucideIcon
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModeStatus = 'active' | 'coming_soon' | 'future';

export type ContextChip = {
  label: string;   // Displayed text (emoji + name)
  attach: string;  // Text appended to query
};

export type SuggestedQuestion = {
  label: string;
  query: string;
  icon: string;
};

export type ModeConfig = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  accentColor: string;           // Tailwind color token, e.g. 'cyan-500'
  badgeColor: string;            // Tailwind classes for the badge pill
  headerAccentClass: string;     // CSS class applied to the chat header stripe
  placeholder: (city: string) => string;
  quickContextChips: ContextChip[];
  suggestedQuestions: (city: string) => SuggestedQuestion[];
  status: ModeStatus;
  /** Safety-critical modes show a persistent in-chat disclaimer banner. */
  disclaimerBanner?: string;
};

// ---------------------------------------------------------------------------
// Mode Definitions
// ---------------------------------------------------------------------------

export const getModeConfigs = (t: TFunction): ModeConfig[] => [
  // ── Auto (Triage) ────────────────────────────────────────────────────────
  {
    id: 'auto',
    label: t('weathergpt.modes.auto.label', 'Auto (Triage)'),
    description: t('weathergpt.modes.auto.desc', 'Automatically routes to the best specialist agent'),
    icon: Sparkles,
    accentColor: 'violet-500',
    badgeColor: 'bg-sky-ai/10 text-sky-ai border-sky-ai/30',
    headerAccentClass: 'mode-accent-auto',
    placeholder: (city) => t('weathergpt.modes.auto.placeholder', { city, defaultValue: `Ask anything about weather in ${city}... (rain risks, outdoor plans, trends)` }),
    quickContextChips: [
      { label: t('weathergpt.modes.auto.chip1_label', '📅 This Weekend'), attach: t('weathergpt.modes.auto.chip1_attach', 'this weekend') },
      { label: t('weathergpt.modes.auto.chip2_label', '⏰ Tomorrow Morning'), attach: t('weathergpt.modes.auto.chip2_attach', 'tomorrow morning') },
      { label: t('weathergpt.modes.auto.chip3_label', '🌧️ Rain Probability'), attach: t('weathergpt.modes.auto.chip3_attach', 'rain probability') },
      { label: t('weathergpt.modes.auto.chip4_label', '💨 Wind & Gusts'), attach: t('weathergpt.modes.auto.chip4_attach', 'wind and gust report') },
      { label: t('weathergpt.modes.auto.chip5_label', '📊 Model Consensus'), attach: t('weathergpt.modes.auto.chip5_attach', 'multi-model comparison') },
    ],
    suggestedQuestions: (city) => [
      { label: t('weathergpt.modes.auto.sq1_label', 'Rain Likelihood'), query: t('weathergpt.modes.auto.sq1_query', { city, defaultValue: `Will it rain today or this evening in ${city}?` }), icon: '🌧️' },
      { label: t('weathergpt.modes.auto.sq2_label', 'Multi-Model Consensus'), query: t('weathergpt.modes.auto.sq2_query', { city, defaultValue: `Compare ECMWF and GFS forecasts for ${city}` }), icon: '📊' },
      { label: t('weathergpt.modes.auto.sq3_label', 'Weekend Weather'), query: t('weathergpt.modes.auto.sq3_query', { city, defaultValue: `What is the weather outlook for this weekend in ${city}?` }), icon: '🌤️' },
      { label: t('weathergpt.modes.auto.sq4_label', 'Outdoor Plans'), query: t('weathergpt.modes.auto.sq4_query', { city, defaultValue: `What is the best time for outdoor activities today in ${city}?` }), icon: '🏃' },
    ],
    status: 'active',
  },

  // ── General Weather ──────────────────────────────────────────────────────
  {
    id: 'general',
    label: t('weathergpt.modes.general.label', 'General Weather'),
    description: t('weathergpt.modes.general.desc', 'Forecasts, current conditions, alerts & radar'),
    icon: CloudRain,
    accentColor: 'blue-500',
    badgeColor: 'bg-sky-primary/10 text-sky-primary border-sky-primary/30',
    headerAccentClass: 'mode-accent-general',
    placeholder: (city) => t('weathergpt.modes.general.placeholder', { city, defaultValue: `Ask for detailed forecast, temp trends, or wind conditions in ${city}...` }),
    quickContextChips: [
      { label: t('weathergpt.modes.auto.chip1_label', '📅 This Weekend'), attach: t('weathergpt.modes.auto.chip1_attach', 'this weekend') },
      { label: t('weathergpt.modes.auto.chip2_label', '⏰ Tomorrow Morning'), attach: t('weathergpt.modes.auto.chip2_attach', 'tomorrow morning') },
      { label: t('weathergpt.modes.auto.chip3_label', '🌧️ Rain Probability'), attach: t('weathergpt.modes.auto.chip3_attach', 'rain probability') },
      { label: t('weathergpt.modes.auto.chip4_label', '💨 Wind & Gusts'), attach: t('weathergpt.modes.auto.chip4_attach', 'wind and gust report') },
      { label: t('weathergpt.modes.auto.chip5_label', '📊 Model Consensus'), attach: t('weathergpt.modes.auto.chip5_attach', 'multi-model comparison') },
      { label: t('weathergpt.modes.general.chip6_label', '🌡️ Temperature Trend'), attach: t('weathergpt.modes.general.chip6_attach', 'temperature trend') },
    ],
    suggestedQuestions: (city) => [
      { label: t('weathergpt.modes.general.sq1_label', '7-Day Outlook'), query: t('weathergpt.modes.general.sq1_query', { city, defaultValue: `Give me a 7-day temperature and precipitation forecast for ${city}` }), icon: '📅' },
      { label: t('weathergpt.modes.general.sq2_label', 'Wind & Humidity'), query: t('weathergpt.modes.general.sq2_query', { city, defaultValue: `What are the current wind speeds and humidity levels in ${city}?` }), icon: '💨' },
      { label: t('weathergpt.modes.general.sq3_label', 'Hourly Timeline'), query: t('weathergpt.modes.general.sq3_query', { city, defaultValue: `Show me hourly temperature trend for ${city} tomorrow` }), icon: '⏰' },
    ],
    status: 'active',
  },

  // ── Agriculture ──────────────────────────────────────────────────────────
  {
    id: 'agriculture',
    label: t('weathergpt.modes.agri.label', 'Agriculture'),
    description: t('weathergpt.modes.agri.desc', 'Crop spraying windows, soil moisture & sowing'),
    icon: Sprout,
    accentColor: 'emerald-500',
    badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    headerAccentClass: 'mode-accent-agriculture',
    placeholder: (city) => t('weathergpt.modes.agri.placeholder', { city, defaultValue: `Ask about crop spraying, soil moisture, sowing window, or heat stress in ${city}...` }),
    quickContextChips: [
      { label: t('weathergpt.modes.agri.chip1_label', '🚜 Spray Window'), attach: t('weathergpt.modes.agri.chip1_attach', 'spray suitability') },
      { label: t('weathergpt.modes.agri.chip2_label', '🌱 Soil Moisture'), attach: t('weathergpt.modes.agri.chip2_attach', 'soil moisture and evapotranspiration') },
      { label: t('weathergpt.modes.agri.chip3_label', '🌾 Sowing Conditions'), attach: t('weathergpt.modes.agri.chip3_attach', 'sowing conditions') },
      { label: t('weathergpt.modes.auto.chip3_label', '🌧️ Rain Probability'), attach: t('weathergpt.modes.auto.chip3_attach', 'rain probability') },
      { label: t('weathergpt.modes.agri.chip4_label', '🌡️ Heat Stress'), attach: t('weathergpt.modes.agri.chip4_attach', 'crop heat stress') },
    ],
    suggestedQuestions: (city) => [
      { label: t('weathergpt.modes.agri.sq1_label', 'Spray Window'), query: t('weathergpt.modes.agri.sq1_query', { city, defaultValue: `Is tomorrow morning suitable for pesticide spraying in ${city}?` }), icon: '🚜' },
      { label: t('weathergpt.modes.agri.sq2_label', 'Soil Moisture'), query: t('weathergpt.modes.agri.sq2_query', { city, defaultValue: `What is the soil moisture and heat stress outlook for ${city}?` }), icon: '🌱' },
      { label: t('weathergpt.modes.agri.sq3_label', 'Sowing Conditions'), query: t('weathergpt.modes.agri.sq3_query', { city, defaultValue: `Are current rainfall and temperature levels good for sowing in ${city}?` }), icon: '🌾' },
    ],
    status: 'active',
  },

  // ── Disaster Risk ────────────────────────────────────────────────────────
  {
    id: 'disaster',
    label: t('weathergpt.modes.disaster.label', 'Disaster Risk'),
    description: t('weathergpt.modes.disaster.desc', 'Severe storms, flood risk & emergency advisories'),
    icon: ShieldAlert,
    accentColor: 'amber-500',
    badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    headerAccentClass: 'mode-accent-disaster',
    placeholder: (city) => t('weathergpt.modes.disaster.placeholder', { city, defaultValue: `Check severe storm risks, flash floods, or cyclone warnings in ${city}...` }),
    quickContextChips: [
      { label: t('weathergpt.modes.disaster.chip1_label', '⚠️ Severe Alerts'), attach: t('weathergpt.modes.disaster.chip1_attach', 'active severe weather alerts') },
      { label: t('weathergpt.modes.disaster.chip2_label', '🌊 Flood Risk'), attach: t('weathergpt.modes.disaster.chip2_attach', 'flash flood risk assessment') },
      { label: t('weathergpt.modes.disaster.chip3_label', '🌀 Cyclone Track'), attach: t('weathergpt.modes.disaster.chip3_attach', 'cyclone tracking') },
      { label: t('weathergpt.modes.disaster.chip4_label', '🌡️ Heatwave'), attach: t('weathergpt.modes.disaster.chip4_attach', 'heatwave risk') },
      { label: t('weathergpt.modes.disaster.chip5_label', '🛡️ Safety Advisory'), attach: t('weathergpt.modes.disaster.chip5_attach', 'emergency safety advisory') },
    ],
    suggestedQuestions: (city) => [
      { label: t('weathergpt.modes.disaster.sq1_label', 'Severe Storm Alert'), query: t('weathergpt.modes.disaster.sq1_query', { city, defaultValue: `Are there any active thunderstorm or extreme wind warnings for ${city}?` }), icon: '⚠️' },
      { label: t('weathergpt.modes.disaster.sq2_label', 'Flood Risk Watch'), query: t('weathergpt.modes.disaster.sq2_query', { city, defaultValue: `Evaluate heavy rainfall and flash flood risk in ${city} for the next 48h` }), icon: '🌊' },
      { label: t('weathergpt.modes.disaster.sq3_label', 'Emergency Advisory'), query: t('weathergpt.modes.disaster.sq3_query', { city, defaultValue: `What precautions should response teams take for ${city}?` }), icon: '🛡️' },
    ],
    status: 'active',
  },

  // ── Aviation ─────────────────────────────────────────────────────────────
  {
    id: 'aviation',
    label: t('weathergpt.modes.aviation.label', 'Aviation'),
    description: t('weathergpt.modes.aviation.desc', 'Ceiling, visibility, crosswind, icing & route briefings'),
    icon: Plane,
    accentColor: 'cyan-500',
    badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    headerAccentClass: 'mode-accent-aviation',
    placeholder: (city) => t('weathergpt.modes.aviation.placeholder', { city, defaultValue: `Ask about ceiling, visibility, crosswind, turbulence or icing near ${city}...` }),
    quickContextChips: [
      { label: t('weathergpt.modes.aviation.chip1_label', '✈️ Crosswind'), attach: t('weathergpt.modes.aviation.chip1_attach', 'crosswind component') },
      { label: t('weathergpt.modes.aviation.chip2_label', '🌫️ Ceiling & Visibility'), attach: t('weathergpt.modes.aviation.chip2_attach', 'ceiling and visibility') },
      { label: t('weathergpt.modes.aviation.chip3_label', '🌪️ Turbulence'), attach: t('weathergpt.modes.aviation.chip3_attach', 'turbulence risk by altitude') },
      { label: t('weathergpt.modes.aviation.chip4_label', '❄️ Icing Risk'), attach: t('weathergpt.modes.aviation.chip4_attach', 'icing risk assessment') },
      { label: t('weathergpt.modes.aviation.chip5_label', '🛫 Route Briefing'), attach: t('weathergpt.modes.aviation.chip5_attach', 'departure enroute arrival weather briefing') },
    ],
    suggestedQuestions: (city) => [
      { label: t('weathergpt.modes.aviation.sq1_label', 'Crosswind'), query: t('weathergpt.modes.aviation.sq1_query', { city, defaultValue: `What is the crosswind component at ${city} airport for runway operations?` }), icon: '✈️' },
      { label: t('weathergpt.modes.aviation.sq2_label', 'Ceiling & Vis'), query: t('weathergpt.modes.aviation.sq2_query', { city, defaultValue: `What is the current ceiling and visibility at ${city}?` }), icon: '🌫️' },
      { label: t('weathergpt.modes.aviation.sq3_label', 'Turbulence & Icing'), query: t('weathergpt.modes.aviation.sq3_query', { city, defaultValue: `Assess turbulence and icing risk by altitude near ${city}` }), icon: '🌪️' },
    ],
    status: 'active',
  },

  // ── Marine ───────────────────────────────────────────────────────────────
  {
    id: 'marine',
    label: t('weathergpt.modes.marine.label', 'Marine'),
    description: t('weathergpt.modes.marine.desc', 'Waves, tides, swell, SST & small craft advisories'),
    icon: Ship,
    accentColor: 'teal-500',
    badgeColor: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
    headerAccentClass: 'mode-accent-marine',
    placeholder: (city) => t('weathergpt.modes.marine.placeholder', { city, defaultValue: `Ask about wave height, tides, swell, sea temperature near ${city}...` }),
    quickContextChips: [
      { label: t('weathergpt.modes.marine.chip1_label', '🌊 Wave Height'), attach: t('weathergpt.modes.marine.chip1_attach', 'wave height forecast') },
      { label: t('weathergpt.modes.marine.chip2_label', '🌙 Tides'), attach: t('weathergpt.modes.marine.chip2_attach', 'tide table') },
      { label: t('weathergpt.modes.marine.chip3_label', '⚓ Small Craft Advisory'), attach: t('weathergpt.modes.marine.chip3_attach', 'small craft advisory') },
      { label: t('weathergpt.modes.marine.chip4_label', '💨 Wind & Swell'), attach: t('weathergpt.modes.marine.chip4_attach', 'wind wave and swell split') },
      { label: t('weathergpt.modes.marine.chip5_label', '🚢 Port Conditions'), attach: t('weathergpt.modes.marine.chip5_attach', 'port weather conditions') },
    ],
    suggestedQuestions: (city) => [
      { label: t('weathergpt.modes.marine.sq1_label', 'Wave Height'), query: t('weathergpt.modes.marine.sq1_query', { city, defaultValue: `What is the wave height and swell forecast near ${city}?` }), icon: '🌊' },
      { label: t('weathergpt.modes.marine.sq2_label', 'Tides'), query: t('weathergpt.modes.marine.sq2_query', { city, defaultValue: `Show tide tables and sea level predictions for ${city}` }), icon: '🌙' },
      { label: t('weathergpt.modes.marine.sq3_label', 'Small Craft Advisory'), query: t('weathergpt.modes.marine.sq3_query', { city, defaultValue: `Are there any small craft or gale advisories near ${city}?` }), icon: '⚓' },
    ],
    status: 'active',
  },

  // ── Climate & Research ───────────────────────────────────────────────────
  {
    id: 'research',
    label: t('weathergpt.modes.climate.label', 'Climate Intelligence'),
    description: t('weathergpt.modes.climate.desc', 'Historical weather trends, anomalies, climate baselines & research'),
    icon: Sparkles,
    accentColor: 'indigo-500',
    badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    headerAccentClass: 'mode-accent-research',
    placeholder: (city) => t('weathergpt.modes.climate.placeholder', { city, defaultValue: `Ask about temperature anomalies, historical climate data, or precipitation trends in ${city}...` }),
    quickContextChips: [
      { label: t('weathergpt.modes.climate.chip1_label', '📈 Historical Trends'), attach: t('weathergpt.modes.climate.chip1_attach', 'historical weather trends') },
      { label: t('weathergpt.modes.climate.chip2_label', '🌡️ Temp Anomalies'), attach: t('weathergpt.modes.climate.chip2_attach', 'temperature anomaly vs normal') },
      { label: t('weathergpt.modes.climate.chip3_label', '📊 Rainfall Normal'), attach: t('weathergpt.modes.climate.chip3_attach', 'seasonal rainfall vs historical average') },
      { label: t('weathergpt.modes.climate.chip4_label', '📅 Decadal Changes'), attach: t('weathergpt.modes.climate.chip4_attach', 'climate shift over past decade') },
    ],
    suggestedQuestions: (city) => [
      { label: t('weathergpt.modes.climate.sq1_label', 'Historical Baseline'), query: t('weathergpt.modes.climate.sq1_query', { city, defaultValue: `How do current temperatures in ${city} compare to the 30-year historical baseline?` }), icon: '📈' },
      { label: t('weathergpt.modes.climate.sq2_label', 'Precipitation Trends'), query: t('weathergpt.modes.climate.sq2_query', { city, defaultValue: `Analyze historical monsoon and rainfall variability for ${city}` }), icon: '🌧️' },
      { label: t('weathergpt.modes.climate.sq3_label', 'Extreme Heat Frequency'), query: t('weathergpt.modes.climate.sq3_query', { city, defaultValue: `What is the historical frequency of extreme heat events in ${city}?` }), icon: '🌡️' },
    ],
    status: 'active',
  },

  // ── Urban & Commute ──────────────────────────────────────────────────────
  {
    id: 'urban',
    label: t('weathergpt.modes.urban.label', 'Urban & Commute'),
    description: t('weathergpt.modes.urban.desc', 'Commute impacts, waterlogging risks, rain disruption & city planning'),
    icon: Building2,
    accentColor: 'orange-500',
    badgeColor: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    headerAccentClass: 'mode-accent-urban',
    placeholder: (city) => t('weathergpt.modes.urban.placeholder', { city, defaultValue: `Ask about commute weather, rain delays, or waterlogging risks in ${city}...` }),
    quickContextChips: [
      { label: t('weathergpt.modes.urban.chip1_label', '🚗 Commute Disruption'), attach: t('weathergpt.modes.urban.chip1_attach', 'commute impact and traffic delays') },
      { label: t('weathergpt.modes.urban.chip2_label', '🌊 Waterlogging Risk'), attach: t('weathergpt.modes.urban.chip2_attach', 'urban waterlogging and drain overflow risk') },
      { label: t('weathergpt.modes.urban.chip3_label', '🏗️ Construction Safety'), attach: t('weathergpt.modes.urban.chip3_attach', 'outdoor work and construction safety') },
      { label: t('weathergpt.modes.urban.chip4_label', '🚇 Public Transit'), attach: t('weathergpt.modes.urban.chip4_attach', 'public transport weather disruption') },
    ],
    suggestedQuestions: (city) => [
      { label: t('weathergpt.modes.urban.sq1_label', 'Commute Outlook'), query: t('weathergpt.modes.urban.sq1_query', { city, defaultValue: `Will rain disrupt evening rush hour traffic in ${city}?` }), icon: '🚗' },
      { label: t('weathergpt.modes.urban.sq2_label', 'Waterlogging'), query: t('weathergpt.modes.urban.sq2_query', { city, defaultValue: `Is there any risk of waterlogging or localized urban flooding in ${city}?` }), icon: '🌊' },
      { label: t('weathergpt.modes.urban.sq3_label', 'Outdoor Work'), query: t('weathergpt.modes.urban.sq3_query', { city, defaultValue: `Is it safe for outdoor construction work tomorrow in ${city}?` }), icon: '🏗️' },
    ],
    status: 'active',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Look up a mode config by ID. Falls back to 'auto' if not found. */
export function getModeConfig(modeId: string, t: TFunction): ModeConfig {
  return getModeConfigs(t).find(m => m.id === modeId) || getModeConfigs(t)[0];
}

/** Get all modes that should appear in the dropdown (excludes 'future'). */
export function getSelectableModes(t: TFunction): ModeConfig[] {
  return getModeConfigs(t).filter(m => m.status !== 'future');
}

/** Quick Context chips for the active mode. */
export function getContextChips(modeId: string, t: TFunction): ContextChip[] {
  return getModeConfig(modeId, t).quickContextChips;
}

/** Suggested Questions for the active mode and city. */
export function getSuggestedQuestions(modeId: string, city: string, t: TFunction): SuggestedQuestion[] {
  return getModeConfig(modeId, t).suggestedQuestions(city);
}

/** Placeholder text for the chat input. */
export function getPlaceholder(modeId: string, city: string, t: TFunction): string {
  return getModeConfig(modeId, t).placeholder(city);
}
