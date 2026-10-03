/**
 * ModeSelector.tsx — Custom dropdown for selecting WeatherGPT agent modes.
 *
 * Replaces the native <select> with a rich dropdown showing per-mode
 * icon, label, description, accent indicator, and "coming soon" badges.
 *
 * Fully keyboard accessible (Enter/Space to toggle, Escape to close,
 * ArrowUp/ArrowDown to navigate, Enter to select). Uses ARIA listbox
 * pattern. Mobile-safe: uses max-width: calc(100vw - 2rem) so it never
 * clips on narrow viewports.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSelectableModes, getModeConfig, type ModeConfig } from './modeConfig';

type ModeSelectorProps = {
  value: string;
  onChange: (modeId: string) => void;
};

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const modes = getSelectableModes(t);
  const current = getModeConfig(value, t);
  const CurrentIcon = current.icon;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFocusedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Scroll focused item into view
  useEffect(() => {
    if (open && focusedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[role="option"]');
      items[focusedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex, open]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setFocusedIndex(modes.findIndex(m => m.id === value));
        } else if (focusedIndex >= 0) {
          onChange(modes[focusedIndex].id);
          setOpen(false);
          setFocusedIndex(-1);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setFocusedIndex(-1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setFocusedIndex(modes.findIndex(m => m.id === value));
        } else {
          setFocusedIndex(prev => (prev + 1) % modes.length);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (open) {
          setFocusedIndex(prev => (prev - 1 + modes.length) % modes.length);
        }
        break;
      case 'Tab':
        if (open) {
          setOpen(false);
          setFocusedIndex(-1);
        }
        break;
    }
  }, [open, focusedIndex, modes, value, onChange]);

  const handleSelect = (mode: ModeConfig) => {
    onChange(mode.id);
    setOpen(false);
    setFocusedIndex(-1);
  };

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      {/* Trigger Button */}
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Agent mode: ${current.label}`}
        onClick={() => {
          setOpen(prev => !prev);
          if (!open) setFocusedIndex(modes.findIndex(m => m.id === value));
        }}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium",
          "border transition-all duration-200 cursor-pointer select-none",
          "bg-sky-surface-elevated border-sky-border",
          "hover:border-sky-ai/40 hover:bg-sky-ai/5",
          "focus:outline-none focus:ring-2 focus:ring-sky-ai/30",
          open && "border-sky-ai/50 bg-sky-ai/5 ring-2 ring-sky-ai/20"
        )}
      >
        <CurrentIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate max-w-28 sm:max-w-none">{current.label}</span>
        {current.status === 'coming_soon' && (
          <span className="hidden sm:inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-warning bg-sky-warning/10 px-1.5 py-0.5 rounded-full border border-sky-warning/20 leading-none">
            <Zap className="h-2 w-2" />
            {t('weathergpt.beta', 'Beta')}
          </span>
        )}
        <ChevronDown className={cn(
          "h-3.5 w-3.5 text-sky-text-secondary transition-transform duration-200 shrink-0",
          open && "rotate-180"
        )} />
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          className={cn(
            "absolute right-0 top-full mt-1.5 z-50",
            "w-72 sm:w-80",
            "max-w-[calc(100vw-2rem)]",
            "bg-sky-surface border border-sky-border rounded-xl shadow-lg",
            "animate-fade-slide-in",
            "overflow-hidden"
          )}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-sky-border/60">
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-text-secondary">
              {t('weathergpt.intelligence_mode', 'Intelligence Mode')}
            </p>
          </div>

          {/* Option List */}
          <ul
            ref={listRef}
            role="listbox"
            aria-label="Agent modes"
            className="max-h-60 overflow-y-auto py-1 scroll-smooth"
          >
            {modes.map((mode, idx) => {
              const ModeIcon = mode.icon;
              const isSelected = mode.id === value;
              const isFocused = idx === focusedIndex;

              return (
                <li
                  key={mode.id}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  onClick={() => handleSelect(mode)}
                  onMouseEnter={() => setFocusedIndex(idx)}
                  className={cn(
                    "flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors duration-100",
                    isFocused && "bg-sky-surface-elevated",
                    isSelected && "bg-sky-ai/5"
                  )}
                >
                  {/* Accent dot + Icon */}
                  <div className={cn(
                    "shrink-0 h-8 w-8 rounded-lg flex items-center justify-center mt-0.5",
                    isSelected
                      ? "bg-sky-ai/15 text-sky-ai"
                      : "bg-sky-surface-elevated text-sky-text-secondary"
                  )}>
                    <ModeIcon className="h-4 w-4" />
                  </div>

                  {/* Label + Description */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-sm font-semibold truncate",
                        isSelected ? "text-sky-ai" : "text-sky-text-primary"
                      )}>
                        {mode.label}
                      </span>
                      {mode.status === 'coming_soon' && (
                        <span className="inline-flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wider text-sky-warning bg-sky-warning/10 px-1.5 py-0.5 rounded-full border border-sky-warning/20 leading-none shrink-0">
                          <Zap className="h-2 w-2" />
                          {t('weathergpt.beta', 'Beta')}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-sky-text-secondary leading-snug mt-0.5 line-clamp-2">
                      {mode.description}
                    </p>
                  </div>

                  {/* Selected indicator */}
                  {isSelected && (
                    <div className="shrink-0 mt-1">
                      <div className="h-2 w-2 rounded-full bg-sky-ai shadow-[0_0_6px] shadow-sky-ai/50" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
