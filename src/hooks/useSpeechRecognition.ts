import { useState, useEffect, useCallback, useRef } from 'react';

export type VoiceState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'ERROR';

interface SpeechRecognitionHook {
  voiceState: VoiceState;
  isListening: boolean;
  transcript: string;
  isSupported: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

const BCP47_LANG_MAP: Record<string, string> = {
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

export function useSpeechRecognition({
  onResult,
  onFinalResult,
  continuous = false,
  lang = 'en'
}: {
  onResult?: (text: string) => void;
  onFinalResult?: (text: string) => void;
  continuous?: boolean;
  lang?: string;
} = {}): SpeechRecognitionHook {
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isSupported = typeof window !== 'undefined' && 
    !!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const bcp47Lang = BCP47_LANG_MAP[lang] || lang || 'en-US';

  const clearAutoStopTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const resetAutoStopTimer = useCallback(() => {
    clearAutoStopTimer();
    // Automatically stop listening after 10 seconds of idle to not keep mic open indefinitely
    timeoutRef.current = setTimeout(() => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setVoiceState(prev => prev === 'LISTENING' ? 'IDLE' : prev);
    }, 10000);
  }, []);

  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = bcp47Lang;

    recognition.onresult = (event: any) => {
      let currentText = '';
      let isFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        currentText += event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          isFinal = true;
        }
      }

      setTranscript(currentText);
      resetAutoStopTimer();

      if (onResult && currentText.trim()) {
        onResult(currentText);
      }

      if (isFinal && onFinalResult && currentText.trim()) {
        setVoiceState('PROCESSING');
        onFinalResult(currentText.trim());
      }
    };

    recognition.onerror = (event: any) => {
      clearAutoStopTimer();
      let friendlyError = 'Speech recognition error';
      switch (event.error) {
        case 'not-allowed':
          friendlyError = 'Microphone permission was denied. Please allow microphone access in browser settings.';
          break;
        case 'no-speech':
          friendlyError = 'No speech was detected. Please try again.';
          break;
        case 'network':
          friendlyError = 'Network error during speech recognition.';
          break;
        case 'audio-capture':
          friendlyError = 'No microphone was found on this device.';
          break;
        default:
          friendlyError = event.message || event.error || 'Failed to capture voice input.';
      }
      setError(friendlyError);
      setVoiceState('ERROR');
    };

    recognition.onend = () => {
      clearAutoStopTimer();
      setVoiceState(prev => (prev === 'LISTENING' ? 'IDLE' : prev));
    };

    recognitionRef.current = recognition;

    return () => {
      clearAutoStopTimer();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch { /* silent */ }
      }
    };
  }, [isSupported, continuous, bcp47Lang, onResult, onFinalResult, resetAutoStopTimer]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || !isSupported) {
      setError('Speech recognition is not supported in this browser.');
      setVoiceState('ERROR');
      return;
    }
    setError(null);
    setTranscript('');
    setVoiceState('LISTENING');
    resetAutoStopTimer();

    try {
      recognitionRef.current.start();
    } catch (err: any) {
      if (err.name !== 'InvalidStateError') {
        setError(err.message || 'Failed to start speech recognition');
        setVoiceState('ERROR');
      }
    }
  }, [isSupported, resetAutoStopTimer]);

  const stopListening = useCallback(() => {
    clearAutoStopTimer();
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
      setVoiceState('IDLE');
    } catch { /* silent */ }
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
    setVoiceState('IDLE');
  }, []);

  return {
    voiceState,
    isListening: voiceState === 'LISTENING',
    transcript,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript
  };
}
