import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Volume2, Hexagon } from 'lucide-react';
import { useJarvis } from '../../hooks/useJarvis';
import type { ChatMessage } from '../../types';

// ── Typing Indicator ────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="flex items-start gap-3 px-4"
    >
      <JarvisAvatar />
      <div className="bg-[#0D1321]/80 backdrop-blur-sm border border-[#1A2035] rounded-xl rounded-tl-sm px-4 py-3">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="block w-2 h-2 rounded-full bg-[#00D4FF]"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.2,
                ease: 'easeInOut',
              }}
            />
          ))}
          <span className="ml-2 text-xs text-white/40 font-mono">JARVIS is thinking...</span>
        </div>
      </div>
    </motion.div>
  );
}

// ── JARVIS Avatar ───────────────────────────────────────────────────────────

function JarvisAvatar() {
  return (
    <div className="relative flex-shrink-0 w-8 h-8 flex items-center justify-center">
      <Hexagon className="w-8 h-8 text-[#00D4FF]/60 fill-[#00D4FF]/10" />
      <span className="absolute text-[8px] font-bold text-[#00D4FF] font-mono">J</span>
    </div>
  );
}

// ── Speak Button ────────────────────────────────────────────────────────────

function SpeakButton({ text }: { text: string }) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleSpeak = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 0.9;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  return (
    <button
      onClick={handleSpeak}
      className={`
        p-1 rounded transition-colors duration-200
        ${isSpeaking ? 'text-[#00D4FF]' : 'text-white/20 hover:text-white/50'}
      `}
      aria-label={isSpeaking ? 'Stop speaking' : 'Read aloud'}
    >
      <Volume2 className="w-3.5 h-3.5" />
    </button>
  );
}

// ── Message Bubble ──────────────────────────────────────────────────────────

function MessageBubble({ message, index }: { message: ChatMessage; index: number }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.3) }}
      className={`flex items-start gap-3 px-4 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && <JarvisAvatar />}

      <div className="flex flex-col gap-1 max-w-[85%]">
        <div
          className={`
            px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap
            ${
              isUser
                ? 'bg-[#00D4FF]/15 border border-[#00D4FF]/20 rounded-xl rounded-tr-sm text-white/90'
                : 'bg-[#0D1321]/80 backdrop-blur-sm border border-[#1A2035] rounded-xl rounded-tl-sm text-white/80'
            }
          `}
        >
          {message.content}
        </div>

        <div className={`flex items-center gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[10px] text-white/20 font-mono">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {!isUser && <SpeakButton text={message.content} />}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────────────

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  const {
    messages,
    isLoading,
    error,
    usage,
    sendMessage,
    loadUsage,
    clearError,
  } = useJarvis();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
      loadUsage();
    }
  }, [isOpen, loadUsage]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    clearError();
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 z-50 h-full w-[420px] max-w-full flex flex-col bg-[#060A12]/95 backdrop-blur-xl border-l border-[#1A2035]"
          >
            {/* Top edge glow */}
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00D4FF]/30 to-transparent" />

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1A2035]/60">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#00D4FF] animate-pulse" />
                  <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-[#00D4FF] animate-ping opacity-30" />
                </div>
                <h2 className="text-base font-semibold tracking-wider text-white font-mono">
                  JARVIS
                </h2>
                <span className="text-[10px] text-white/30 font-mono uppercase tracking-widest">
                  Online
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors"
                aria-label="Close chat panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── Messages ───────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 scrollbar-thin">
              {messages.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center h-full px-8 text-center">
                  <div className="relative mb-4">
                    <Hexagon className="w-16 h-16 text-[#00D4FF]/20 fill-[#00D4FF]/5" />
                    <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-[#00D4FF]/40 font-mono">
                      J
                    </span>
                  </div>
                  <p className="text-sm text-white/40 font-mono leading-relaxed">
                    How may I assist you today, sir?
                  </p>
                  <p className="text-xs text-white/20 mt-2">
                    Ask about revenue, clients, metrics, or anything else.
                  </p>
                </div>
              )}

              {messages.map((msg, i) => (
                <MessageBubble key={msg.id} message={msg} index={i} />
              ))}

              <AnimatePresence>{isLoading && <TypingIndicator />}</AnimatePresence>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mx-4 px-4 py-3 rounded-lg bg-[#FF3B3B]/10 border border-[#FF3B3B]/20"
                >
                  <p className="text-xs text-[#FF3B3B] font-mono">{error}</p>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* ── Input Area ─────────────────────────────────────────── */}
            <div className="border-t border-[#1A2035]/60 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask JARVIS anything..."
                  disabled={isLoading}
                  className="
                    flex-1
                    bg-[#0D1321]/80 backdrop-blur-sm
                    border border-[#1A2035] rounded-lg
                    px-4 py-2.5 text-sm text-white
                    placeholder:text-white/20
                    outline-none
                    focus:border-[#00D4FF]/40 focus:shadow-[0_0_12px_rgba(0,212,255,0.1)]
                    transition-all duration-200
                    disabled:opacity-50
                  "
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="
                    flex items-center justify-center
                    w-10 h-10 rounded-lg
                    bg-[#00D4FF]/10 border border-[#00D4FF]/30
                    text-[#00D4FF] hover:bg-[#00D4FF]/20
                    disabled:opacity-30 disabled:cursor-not-allowed
                    transition-all duration-200
                    hover:shadow-[0_0_16px_rgba(0,212,255,0.25)]
                  "
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              {/* Usage indicator */}
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-white/20 font-mono">
                  {usage.requestsToday}/{usage.limit} requests today
                </p>
                <p className="text-[10px] text-white/15 font-mono">
                  Cmd+J to toggle
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
