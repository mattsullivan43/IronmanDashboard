import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MessageSquare, Bell } from 'lucide-react';

interface TopBarProps {
  title: string;
}

/** Typing animation hook -- replays on every `text` change. */
function useTypingText(text: string, speed = 40) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    setDisplayed('');
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return displayed;
}

export default function TopBar({ title }: TopBarProps) {
  const typedTitle = useTypingText(title, 35);
  const [searchOpen, setSearchOpen] = useState(false);

  // Global Cmd+K / Cmd+J shortcuts
  const handleKeydown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setSearchOpen((v) => !v);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
      e.preventDefault();
      // TODO: open JARVIS chat panel
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [handleKeydown]);

  return (
    <>
      <header
        className="sticky top-0 z-40 w-full h-16 flex items-center justify-between px-6
          bg-[#060A12]/70 backdrop-blur-xl
          border-b border-transparent"
        style={{
          borderImage:
            'linear-gradient(90deg, transparent, rgba(0,212,255,0.25), transparent) 1',
        }}
      >
        {/* ---- Left: Page Title ---- */}
        <div className="flex items-center gap-3">
          <AnimatePresence mode="wait">
            <motion.h1
              key={title}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="text-lg font-semibold text-white/90 tracking-wide"
            >
              {typedTitle}
              <span className="inline-block w-[2px] h-[18px] ml-0.5 bg-jarvis-blue/80 align-middle animate-pulse" />
            </motion.h1>
          </AnimatePresence>
        </div>

        {/* ---- Right: Actions ---- */}
        <div className="flex items-center gap-2">
          {/* Quick search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 h-9 px-3 rounded-lg
              bg-white/[0.03] border border-white/[0.06]
              text-white/40 hover:text-white/60 hover:border-white/10 hover:bg-white/[0.05]
              transition-all duration-200 group"
          >
            <Search size={15} />
            <span className="text-xs hidden sm:inline">Search</span>
            <kbd
              className="ml-1 text-[10px] font-mono bg-white/[0.04] border border-white/[0.08]
                rounded px-1.5 py-0.5 text-white/25 group-hover:text-white/35 transition-colors"
            >
              {'\u2318'}K
            </kbd>
          </button>

          {/* JARVIS chat */}
          <button
            className="flex items-center gap-2 h-9 px-3 rounded-lg
              bg-jarvis-blue/[0.06] border border-jarvis-blue/[0.12]
              text-jarvis-blue/70 hover:text-jarvis-blue hover:border-jarvis-blue/25
              hover:bg-jarvis-blue/[0.10] transition-all duration-200 group"
          >
            <MessageSquare size={15} />
            <span className="text-xs hidden sm:inline">JARVIS</span>
            <kbd
              className="ml-1 text-[10px] font-mono bg-jarvis-blue/[0.06] border border-jarvis-blue/[0.12]
                rounded px-1.5 py-0.5 text-jarvis-blue/30 group-hover:text-jarvis-blue/50 transition-colors"
            >
              {'\u2318'}J
            </kbd>
          </button>

          {/* Notification bell */}
          <button
            className="relative h-9 w-9 flex items-center justify-center rounded-lg
              text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all duration-200"
          >
            <Bell size={17} />
            {/* Unread dot */}
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-jarvis-blue shadow-[0_0_6px_rgba(0,212,255,0.5)]" />
          </button>

          {/* User avatar */}
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center
              bg-gradient-to-br from-jarvis-blue/20 to-jarvis-blue/5
              border border-jarvis-blue/20 text-jarvis-blue text-xs font-bold
              hover:border-jarvis-blue/40 hover:shadow-[0_0_12px_rgba(0,212,255,0.15)]
              transition-all duration-300 cursor-pointer select-none"
          >
            MS
          </div>
        </div>
      </header>

      {/* ---- Quick search overlay (placeholder) ---- */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]
              bg-black/60 backdrop-blur-sm"
            onClick={() => setSearchOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg mx-4 rounded-xl overflow-hidden
                bg-jarvis-card/95 backdrop-blur-xl border border-jarvis-border
                shadow-2xl shadow-black/60"
            >
              <div className="flex items-center gap-3 px-4 h-14 border-b border-jarvis-border">
                <Search size={18} className="text-jarvis-blue/60 flex-shrink-0" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search commands, pages, clients..."
                  className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/25
                    outline-none"
                />
                <kbd
                  className="text-[10px] font-mono text-white/20 bg-white/[0.04]
                    border border-white/[0.08] rounded px-1.5 py-0.5"
                >
                  ESC
                </kbd>
              </div>
              <div className="px-4 py-8 text-center text-sm text-white/20">
                Start typing to search...
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
