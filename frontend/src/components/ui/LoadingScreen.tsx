import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LoadingScreenProps {
  onComplete?: () => void;
  duration?: number;
}

const BOOT_TEXT = 'INITIALIZING JARVIS...';
const SUB_LINES = [
  'Loading neural interface',
  'Connecting data streams',
  'Calibrating HUD overlay',
  'Systems online',
];

export default function LoadingScreen({ onComplete, duration = 3500 }: LoadingScreenProps) {
  const [displayText, setDisplayText] = useState('');
  const [progress, setProgress] = useState(0);
  const [subLineIndex, setSubLineIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  // Typing effect for main text
  useEffect(() => {
    let charIndex = 0;
    const interval = setInterval(() => {
      if (charIndex <= BOOT_TEXT.length) {
        setDisplayText(BOOT_TEXT.slice(0, charIndex));
        charIndex++;
      } else {
        clearInterval(interval);
      }
    }, 60);
    return () => clearInterval(interval);
  }, []);

  // Sub-lines cycling
  useEffect(() => {
    const interval = setInterval(() => {
      setSubLineIndex((prev) => Math.min(prev + 1, SUB_LINES.length - 1));
    }, 700);
    return () => clearInterval(interval);
  }, []);

  // Progress bar
  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(elapsed / duration, 1);
      setProgress(p);
      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        setTimeout(() => {
          setIsComplete(true);
          onComplete?.();
        }, 400);
      }
    };
    requestAnimationFrame(tick);
  }, [duration, onComplete]);

  return (
    <AnimatePresence>
      {!isComplete && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] bg-[#060A12] flex items-center justify-center"
        >
          {/* Background glow pulse */}
          <motion.div
            className="absolute inset-0"
            animate={{
              background: [
                'radial-gradient(circle at 50% 50%, rgba(0, 212, 255, 0.06) 0%, transparent 60%)',
                'radial-gradient(circle at 50% 50%, rgba(0, 212, 255, 0.12) 0%, transparent 60%)',
                'radial-gradient(circle at 50% 50%, rgba(0, 212, 255, 0.06) 0%, transparent 60%)',
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />

          <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-md px-8">
            {/* Arc reactor icon */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
              className="relative"
            >
              <div className="w-16 h-16 rounded-full border-2 border-[#00D4FF]/40 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full border border-[#00D4FF]/30 flex items-center justify-center">
                  <motion.div
                    className="w-4 h-4 rounded-full bg-[#00D4FF]"
                    animate={{
                      boxShadow: [
                        '0 0 20px rgba(0, 212, 255, 0.5), 0 0 40px rgba(0, 212, 255, 0.2)',
                        '0 0 30px rgba(0, 212, 255, 0.8), 0 0 60px rgba(0, 212, 255, 0.4)',
                        '0 0 20px rgba(0, 212, 255, 0.5), 0 0 40px rgba(0, 212, 255, 0.2)',
                      ],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
              </div>
              {/* Spinning ring */}
              <motion.div
                className="absolute inset-[-4px] rounded-full border border-[#00D4FF]/20 border-t-[#00D4FF]/60"
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              />
            </motion.div>

            {/* Main text with cursor */}
            <div className="text-center">
              <h1 className="text-xl font-semibold tracking-[0.2em] text-[#00D4FF] text-glow-blue font-['JetBrains_Mono',monospace]">
                {displayText}
                <span className="initializing-cursor" />
              </h1>
            </div>

            {/* Sub-lines */}
            <div className="h-6 text-center">
              <AnimatePresence mode="wait">
                <motion.p
                  key={subLineIndex}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className="text-xs tracking-wider text-white/30 uppercase"
                >
                  {SUB_LINES[subLineIndex]}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Progress bar */}
            <div className="w-full">
              <div className="h-[2px] w-full bg-[#1A2035] rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    width: `${progress * 100}%`,
                    background: 'linear-gradient(90deg, #00D4FF, #00D4FF)',
                    boxShadow: '0 0 10px rgba(0, 212, 255, 0.5)',
                  }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[10px] text-white/20 font-['JetBrains_Mono',monospace] tracking-wider">
                  STARK INDUSTRIES
                </span>
                <span className="text-[10px] text-[#00D4FF]/60 font-['JetBrains_Mono',monospace]">
                  {Math.round(progress * 100)}%
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
