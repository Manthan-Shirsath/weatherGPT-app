import { useState, useEffect, useCallback, useRef } from 'react';

export interface SpeechSynthesisHook {
  isSpeaking: boolean;
  isPaused: boolean;
  isSupported: boolean;
  activeId: string | null;
  speak: (id: string, text: string, lang?: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

const LANG_MAP: Record<string, string> = {
  en: 'en-US',
  hi: 'hi-IN',
  mr: 'mr-IN',
  gu: 'gu-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  bn: 'bn-IN',
  pa: 'pa-IN',
  ml: 'ml-IN',
  or: 'or-IN',
  ur: 'ur-PK'
};

function stripMarkdown(text: string): string {
  return text
    .replace(/[*#_`~>]/g, '') // Remove formatting characters
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert markdown links to text
    .replace(/\s+/g, ' ')
    .trim();
}

export function useSpeechSynthesis(): SpeechSynthesisHook {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (isSupported) {
      synthRef.current = window.speechSynthesis;
    }
    return () => {
      if (synthRef.current) {
        try {
          synthRef.current.cancel();
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [isSupported]);

  const stop = useCallback(() => {
    if (!synthRef.current) return;
    try {
      synthRef.current.cancel();
    } catch {
      // ignore
    }
    setIsSpeaking(false);
    setIsPaused(false);
    setActiveId(null);
  }, []);

  const pause = useCallback(() => {
    if (!synthRef.current) return;
    try {
      synthRef.current.pause();
      setIsPaused(true);
    } catch {
      // ignore
    }
  }, []);

  const resume = useCallback(() => {
    if (!synthRef.current) return;
    try {
      synthRef.current.resume();
      setIsPaused(false);
    } catch {
      // ignore
    }
  }, []);

  const speak = useCallback((id: string, text: string, lang = 'en') => {
    if (!synthRef.current || !isSupported) return;

    // If currently speaking this same utterance, toggle pause/stop
    if (activeId === id && isSpeaking) {
      stop();
      return;
    }

    // Stop any previous utterance
    stop();

    const cleanText = stripMarkdown(text);
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const targetLang = LANG_MAP[lang] || lang || 'en-US';
    utterance.lang = targetLang;

    // Pick best matching voice if available
    const voices = synthRef.current.getVoices();
    const matchingVoice = voices.find(v => v.lang.toLowerCase() === targetLang.toLowerCase()) ||
                          voices.find(v => v.lang.toLowerCase().startsWith(targetLang.slice(0, 2).toLowerCase()));
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
      setActiveId(id);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      setActiveId(null);
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      setActiveId(null);
    };

    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  }, [activeId, isSpeaking, isSupported, stop]);

  return {
    isSpeaking,
    isPaused,
    isSupported,
    activeId,
    speak,
    pause,
    resume,
    stop
  };
}
