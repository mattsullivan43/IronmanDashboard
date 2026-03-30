import { useState, useCallback, useEffect, useRef } from 'react';

interface VoiceOptions {
  rate?: number;
  pitch?: number;
  enabled?: boolean;
}

interface UseVoiceReturn {
  speak: (text: string) => void;
  stop: () => void;
  isSpeaking: boolean;
}

/**
 * Hook for JARVIS voice output using the Web Speech Synthesis API.
 * Selects a British English male voice when available.
 */
export function useVoice(options: VoiceOptions = {}): UseVoiceReturn {
  const { rate = 1.0, pitch = 1.0, enabled = true } = options;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Select the best British English voice once voices are loaded
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;

      // Prefer British English male voices
      const britishMale = voices.find(
        (v) =>
          v.lang.startsWith('en-GB') &&
          (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('daniel'))
      );

      const britishAny = voices.find((v) => v.lang.startsWith('en-GB'));

      const englishMale = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('daniel'))
      );

      const englishAny = voices.find((v) => v.lang.startsWith('en'));

      voiceRef.current = britishMale || britishAny || englishMale || englishAny || voices[0];
    };

    pickVoice();

    // Voices may load asynchronously in some browsers
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', pickVoice);
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!enabled || typeof window === 'undefined' || !window.speechSynthesis) return;

      // Cancel any current speech first
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = 1;

      if (voiceRef.current) {
        utterance.voice = voiceRef.current;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [enabled, rate, pitch]
  );

  const stop = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return { speak, stop, isSpeaking };
}

export default useVoice;
