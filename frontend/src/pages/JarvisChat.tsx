import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Volume2,
  Hexagon,
  Plus,
  Trash2,
  Shield,
  MessageSquare,
} from 'lucide-react';
import { useJarvis } from '../hooks/useJarvis';
import type { ChatMessage, Conversation } from '../types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── JARVIS Avatar ───────────────────────────────────────────────────────────

function JarvisAvatar({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';
  const fontSize = size === 'lg' ? 'text-xs' : 'text-[8px]';

  return (
    <div className={`relative flex-shrink-0 ${dim} flex items-center justify-center`}>
      <Hexagon className={`${dim} text-[#00D4FF]/60 fill-[#00D4FF]/10`} />
      <span className={`absolute ${fontSize} font-bold text-[#00D4FF] font-mono`}>J</span>
    </div>
  );
}

// ── Typing Indicator ────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="flex items-start gap-3"
    >
      <JarvisAvatar size="lg" />
      <div className="bg-[#0D1321]/80 backdrop-blur-sm border border-[#1A2035] rounded-xl rounded-tl-sm px-5 py-3.5">
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

// ── Message Bubble (full page variant) ──────────────────────────────────────

function MessageBubble({ message, index }: { message: ChatMessage; index: number }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.25) }}
      className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && <JarvisAvatar size="lg" />}

      <div className="flex flex-col gap-1 max-w-[70%]">
        <div
          className={`
            px-5 py-3 text-sm leading-relaxed whitespace-pre-wrap
            ${
              isUser
                ? 'bg-[#00D4FF]/15 border border-[#00D4FF]/20 rounded-2xl rounded-tr-sm text-white/90'
                : 'bg-[#0D1321]/80 backdrop-blur-sm border border-[#1A2035] rounded-2xl rounded-tl-sm text-white/80'
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

// ── Conversation Sidebar Item ───────────────────────────────────────────────

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
}: {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
      onClick={onSelect}
      className={`
        group relative cursor-pointer px-4 py-3 rounded-lg transition-all duration-200
        ${
          isActive
            ? 'bg-[#00D4FF]/10 border border-[#00D4FF]/20 shadow-[0_0_12px_rgba(0,212,255,0.1)]'
            : 'hover:bg-white/[0.03] border border-transparent'
        }
      `}
    >
      <div className="flex items-start gap-3">
        <MessageSquare
          className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
            isActive ? 'text-[#00D4FF]' : 'text-white/20'
          }`}
        />
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium truncate ${
              isActive ? 'text-white' : 'text-white/60'
            }`}
          >
            {conversation.title}
          </p>
          {conversation.lastMessage && (
            <p className="text-xs text-white/30 truncate mt-0.5">
              {conversation.lastMessage}
            </p>
          )}
          <p className="text-[10px] text-white/15 font-mono mt-1">
            {formatRelativeDate(conversation.updatedAt)}
          </p>
        </div>
      </div>

      {/* Delete button */}
      <AnimatePresence>
        {showDelete && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute top-3 right-3 p-1.5 rounded-md text-white/30 hover:text-[#FF3B3B] hover:bg-[#FF3B3B]/10 transition-colors"
            aria-label="Delete conversation"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Full-Page Chat ─────────────────────────────────────────────────────

export default function JarvisChat() {
  const {
    messages,
    conversations,
    conversationId,
    isLoading,
    error,
    usage,
    sendMessage,
    loadHistory,
    loadConversations,
    loadUsage,
    deleteConversation,
    startNewConversation,
    clearError,
  } = useJarvis();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initial data load
  useEffect(() => {
    loadConversations();
    loadUsage();
  }, [loadConversations, loadUsage]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input on conversation change
  useEffect(() => {
    inputRef.current?.focus();
  }, [conversationId]);

  const greeting = useMemo(
    () => `${getGreeting()}, Mr. Sullivan. How may I assist you today?`,
    []
  );

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

  const handleSelectConversation = (id: string) => {
    if (id !== conversationId) {
      loadHistory(id);
    }
  };

  const handleNewConversation = () => {
    startNewConversation();
  };

  const handleDeleteConversation = async (id: string) => {
    await deleteConversation(id);
    loadConversations();
  };

  return (
    <div className="flex h-screen bg-[#060A12]">
      {/* ── Left Sidebar ──────────────────────────────────────────── */}
      <div className="w-[280px] flex-shrink-0 flex flex-col border-r border-[#1A2035] bg-[#060A12]">
        {/* Sidebar header */}
        <div className="px-4 py-5 border-b border-[#1A2035]/60">
          <div className="flex items-center gap-3 mb-4">
            <JarvisAvatar size="lg" />
            <div>
              <h1 className="text-sm font-semibold text-white font-mono tracking-wider">
                JARVIS
              </h1>
              <p className="text-[10px] text-white/30 font-mono">AI Assistant</p>
            </div>
          </div>

          <button
            onClick={handleNewConversation}
            className="
              flex items-center justify-center gap-2 w-full
              px-4 py-2.5 rounded-lg
              bg-[#00D4FF]/10 border border-[#00D4FF]/25
              text-[#00D4FF] text-sm font-medium
              hover:bg-[#00D4FF]/15 hover:border-[#00D4FF]/40
              hover:shadow-[0_0_16px_rgba(0,212,255,0.15)]
              transition-all duration-200
            "
          >
            <Plus className="w-4 h-4" />
            New Conversation
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1 scrollbar-thin">
          {conversations.length === 0 && (
            <div className="px-4 py-8 text-center">
              <MessageSquare className="w-8 h-8 text-white/10 mx-auto mb-2" />
              <p className="text-xs text-white/20 font-mono">No conversations yet</p>
            </div>
          )}

          {conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === conversationId}
              onSelect={() => handleSelectConversation(conv.id)}
              onDelete={() => handleDeleteConversation(conv.id)}
            />
          ))}
        </div>

        {/* Usage footer */}
        <div className="px-4 py-3 border-t border-[#1A2035]/60">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-white/20 font-mono">
              {usage.requestsToday}/{usage.limit} requests today
            </p>
          </div>
          <div className="mt-1.5 w-full h-1 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-[#00D4FF]/40"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((usage.requestsToday / usage.limit) * 100, 100)}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>

      {/* ── Main Chat Area ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A2035]/60">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-2.5 h-2.5 rounded-full bg-[#00D4FF] animate-pulse" />
              <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-[#00D4FF] animate-ping opacity-30" />
            </div>
            <h2 className="text-sm font-semibold tracking-wider text-white font-mono">
              {conversationId
                ? conversations.find((c) => c.id === conversationId)?.title ?? 'Conversation'
                : 'New Conversation'}
            </h2>
          </div>

          {/* Context badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00D4FF]/5 border border-[#00D4FF]/15">
            <Shield className="w-3.5 h-3.5 text-[#00D4FF]/60" />
            <span className="text-[10px] text-white/30 font-mono">
              JARVIS has access to your dashboard data
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 scrollbar-thin">
          {/* Greeting for new conversations */}
          {messages.length === 0 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <div className="relative mb-6">
                <Hexagon className="w-20 h-20 text-[#00D4FF]/20 fill-[#00D4FF]/5" />
                <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-[#00D4FF]/40 font-mono">
                  J
                </span>
              </div>
              <p className="text-base text-white/50 font-mono text-center max-w-md leading-relaxed">
                {greeting}
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-6">
                {[
                  'Show revenue summary',
                  'How are my clients doing?',
                  'Analyze cash burn rate',
                  'What needs attention today?',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                    className="
                      px-3 py-1.5 rounded-full text-xs
                      bg-white/[0.03] border border-[#1A2035] text-white/40
                      hover:border-[#00D4FF]/30 hover:text-white/60 hover:bg-[#00D4FF]/5
                      transition-all duration-200
                    "
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={msg.id} message={msg} index={i} />
          ))}

          <AnimatePresence>{isLoading && <TypingIndicator />}</AnimatePresence>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto max-w-lg px-5 py-3.5 rounded-lg bg-[#FF3B3B]/10 border border-[#FF3B3B]/20"
            >
              <p className="text-xs text-[#FF3B3B] font-mono">{error}</p>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-[#1A2035]/60 px-6 py-4">
          <div className="flex items-end gap-3 max-w-4xl mx-auto">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask JARVIS anything..."
              disabled={isLoading}
              rows={1}
              className="
                flex-1 resize-none
                bg-[#0D1321]/80 backdrop-blur-sm
                border border-[#1A2035] rounded-xl
                px-5 py-3 text-sm text-white
                placeholder:text-white/20
                outline-none
                focus:border-[#00D4FF]/40 focus:shadow-[0_0_16px_rgba(0,212,255,0.1)]
                transition-all duration-200
                disabled:opacity-50
                max-h-32
              "
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
              }}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="
                flex items-center justify-center
                w-11 h-11 rounded-xl
                bg-[#00D4FF]/10 border border-[#00D4FF]/30
                text-[#00D4FF] hover:bg-[#00D4FF]/20
                disabled:opacity-30 disabled:cursor-not-allowed
                transition-all duration-200
                hover:shadow-[0_0_20px_rgba(0,212,255,0.3)]
              "
              aria-label="Send message"
            >
              <Send className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
