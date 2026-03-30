import { useCallback, useRef } from 'react';

type SoundEffect =
  | 'notification'
  | 'success'
  | 'error'
  | 'click'
  | 'whoosh'
  | 'chime'
  | 'alert';

interface SoundOptions {
  enabled?: boolean;
  volume?: number;
}

interface UseSoundReturn {
  play: (effect: SoundEffect) => void;
  stop: () => void;
  setVolume: (volume: number) => void;
}

/**
 * Hook stub for UI sound effects.
 * Checks the `enabled` setting before playing. Currently a no-op
 * but exposes the full interface so audio files can be wired in later.
 *
 * To add real sounds, populate the `soundMap` with paths to audio files
 * in the /public/sounds/ directory.
 */
export function useSound(options: SoundOptions = {}): UseSoundReturn {
  const { enabled = false, volume: initialVolume = 0.5 } = options;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const volumeRef = useRef(initialVolume);

  // Map effect names to audio file paths. Populate when sound files are added.
  const soundMap: Partial<Record<SoundEffect, string>> = {
    // notification: '/sounds/notification.mp3',
    // success: '/sounds/success.mp3',
    // error: '/sounds/error.mp3',
    // click: '/sounds/click.mp3',
    // whoosh: '/sounds/whoosh.mp3',
    // chime: '/sounds/chime.mp3',
    // alert: '/sounds/alert.mp3',
  };

  const play = useCallback(
    (effect: SoundEffect) => {
      if (!enabled) return;

      const src = soundMap[effect];
      if (!src) return;

      try {
        // Reuse or create an Audio element
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }

        const audio = new Audio(src);
        audio.volume = volumeRef.current;
        audioRef.current = audio;
        audio.play().catch(() => {
          // Autoplay may be blocked; silently ignore
        });
      } catch {
        // Audio not supported or file not found; silently ignore
      }
    },
    [enabled, soundMap]
  );

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  const setVolume = useCallback((v: number) => {
    volumeRef.current = Math.max(0, Math.min(1, v));
    if (audioRef.current) {
      audioRef.current.volume = volumeRef.current;
    }
  }, []);

  return { play, stop, setVolume };
}

export default useSound;
