import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Volume2,
  Users,
  ArrowRight,
  AlertCircle,
  CheckSquare,
  Square,
  X,
  Plus,
} from 'lucide-react';
import { MetricCard } from '../components/ui/MetricCard';
import HudPanel from '../components/ui/HudPanel';
import AnimatedNumber from '../components/ui/AnimatedNumber';
import { metrics, calendar, jarvis, clients, commissions, actionItems } from '../services/api';
import { getGreeting, formatDate } from '../utils/format';
import { formatTime } from '../utils/format';
import type {
  MetricsOverview,
  CashBurnMetrics,
  CalendarEvent,
  AIUsage,
} from '../types';

// ── Types ───────────────────────────────────────────────────────────────────

interface DashboardData {
  overview: MetricsOverview | null;
  cashBurn: CashBurnMetrics | null;
  events: CalendarEvent[];
  briefing: { briefing: string; generatedAt: string } | null;
  clientStats: { total: number; active: number } | null;
  commissionStats: { totalPending: number } | null;
  aiUsage: AIUsage | null;
  calendarConnected: boolean;
}

// ── Stagger helpers ─────────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

// ── Health helpers ──────────────────────────────────────────────────────────



// ── Loading Screen ──────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#060A12]"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Arc reactor pulse */}
      <motion.div
        className="w-20 h-20 rounded-full border-2 border-[#00D4FF]/40 mb-8 relative"
        animate={{
          boxShadow: [
            '0 0 20px rgba(0,212,255,0.2), inset 0 0 20px rgba(0,212,255,0.1)',
            '0 0 40px rgba(0,212,255,0.5), inset 0 0 40px rgba(0,212,255,0.3)',
            '0 0 20px rgba(0,212,255,0.2), inset 0 0 20px rgba(0,212,255,0.1)',
          ],
        }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <motion.div
          className="absolute inset-3 rounded-full border border-[#00D4FF]/60"
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />
        <div className="absolute inset-6 rounded-full bg-[#00D4FF]/20" />
      </motion.div>

      <motion.p
        className="text-[#00D4FF] font-['JetBrains_Mono',monospace] text-sm tracking-[0.3em] uppercase initializing-cursor"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        Initializing Command Center
      </motion.p>
    </motion.div>
  );
}

// ── Typing animation for briefing ───────────────────────────────────────────

function TypingText({ text, className = '' }: { text: string; className?: string }) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 12);
    return () => clearInterval(interval);
  }, [text]);

  return <span className={className}>{displayed}</span>;
}

// ── Mini bar chart for income vs expenses ───────────────────────────────────

// ── Calendar source dot ─────────────────────────────────────────────────────

function SourceDot({ source }: { source: string }) {
  const colors: Record<string, string> = {
    google: 'bg-blue-400',
    microsoft: 'bg-purple-400',
    manual: 'bg-[#00D4FF]',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[source] || colors.manual}`} />;
}

// ── Action Items Widget ────────────────────────────────────────────────────

interface ActionItem {
  id: string;
  title: string;
  completed: number;
  due_date: string;
  priority: string;
  created_at: string;
}

function ActionItemsWidget() {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'normal' | 'high'>('normal');
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(async () => {
    try {
      const data = await actionItems.list();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const addItem = async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      await actionItems.create({ title, priority: newPriority });
      setNewTitle('');
      setNewPriority('normal');
      fetchItems();
    } catch {
      // silent
    }
  };

  const toggleItem = async (item: ActionItem) => {
    try {
      await actionItems.update(item.id, { completed: !item.completed });
      fetchItems();
    } catch {
      // silent
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await actionItems.delete(id);
      fetchItems();
    } catch {
      // silent
    }
  };

  const completedCount = items.filter((i) => i.completed).length;

  return (
    <HudPanel title="Action Items" delay={0.65}>
      {/* Progress indicator */}
      {items.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#00D4FF] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(completedCount / items.length) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <span className="text-[10px] text-white/40 font-['JetBrains_Mono',monospace] shrink-0">
            {completedCount}/{items.length}
          </span>
        </div>
      )}

      {/* Item list */}
      <div className="space-y-1 max-h-[260px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-white/[0.03] transition-colors group"
            >
              {/* Priority indicator */}
              {item.priority === 'high' && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B3B] shadow-[0_0_6px_rgba(255,59,59,0.6)] shrink-0" />
              )}

              {/* Checkbox */}
              <button
                onClick={() => toggleItem(item)}
                className="shrink-0 text-[#00D4FF]/60 hover:text-[#00D4FF] transition-colors"
              >
                {item.completed ? (
                  <CheckSquare className="w-4 h-4 text-[#00FF88]" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>

              {/* Title */}
              <span
                className={`text-sm flex-1 truncate transition-all ${
                  item.completed
                    ? 'line-through text-white/30'
                    : 'text-white/80'
                }`}
              >
                {item.title}
              </span>

              {/* Delete */}
              <button
                onClick={() => deleteItem(item.id)}
                className="opacity-0 group-hover:opacity-100 shrink-0 text-white/20 hover:text-[#FF3B3B] transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <CheckSquare className="w-8 h-8 text-[#00D4FF]/20 mb-2" />
            <p className="text-white/30 text-sm">No action items for today, sir.</p>
          </div>
        )}
      </div>

      {/* Add new item */}
      <div className="mt-4 flex items-center gap-2">
        {/* Priority toggle */}
        <button
          onClick={() => setNewPriority(newPriority === 'normal' ? 'high' : 'normal')}
          className={`shrink-0 w-6 h-6 rounded flex items-center justify-center transition-colors ${
            newPriority === 'high'
              ? 'bg-[#FF3B3B]/20 text-[#FF3B3B]'
              : 'bg-white/[0.04] text-white/30 hover:text-white/50'
          }`}
          title={newPriority === 'high' ? 'High priority' : 'Normal priority'}
        >
          <AlertCircle className="w-3 h-3" />
        </button>

        <input
          ref={inputRef}
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
          placeholder="Add action item..."
          className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-1.5 text-sm text-white/80 placeholder-white/20 outline-none focus:border-[#00D4FF]/40 transition-colors font-['JetBrains_Mono',monospace]"
        />

        <button
          onClick={addItem}
          className="shrink-0 w-7 h-7 rounded-md bg-[#00D4FF]/10 text-[#00D4FF] hover:bg-[#00D4FF]/20 transition-colors flex items-center justify-center"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </HudPanel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ██  COMMAND CENTER
// ═══════════════════════════════════════════════════════════════════════════

export default function CommandCenter() {
  const [loading, setLoading] = useState(true);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [data, setData] = useState<DashboardData>({
    overview: null,
    cashBurn: null,
    events: [],
    briefing: null,
    clientStats: null,
    commissionStats: null,
    aiUsage: null,
    calendarConnected: true,
  });

  // ── Fetch all data ──────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchAll() {
      try {
        const [overviewRes, cashBurnRes, eventsRes, clientStatsRes, commissionStatsRes, aiUsageRes] =
          await Promise.allSettled([
            metrics.getOverview(),
            metrics.getCashBurn(),
            calendar.getToday(),
            clients.getStats(),
            commissions.getSummary(),
            jarvis.getUsage(),
          ]);

        // Safely extract data — API shapes vary
        const overview = overviewRes.status === 'fulfilled' ? overviewRes.value : null;
        const cashBurn = cashBurnRes.status === 'fulfilled' ? cashBurnRes.value : null;
        const eventsVal = eventsRes.status === 'fulfilled' ? eventsRes.value : [];
        const statsVal: any = clientStatsRes.status === 'fulfilled' ? clientStatsRes.value : null;
        const commVal: any = commissionStatsRes.status === 'fulfilled' ? commissionStatsRes.value : null;
        const usageVal = aiUsageRes.status === 'fulfilled' ? aiUsageRes.value : null;

        setData((prev) => ({
          ...prev,
          overview,
          cashBurn,
          events: Array.isArray(eventsVal) ? eventsVal : [],
          calendarConnected: eventsRes.status === 'fulfilled',
          clientStats: statsVal
            ? { total: statsVal.total_active ?? statsVal.total ?? 0, active: statsVal.total_active ?? statsVal.active ?? 0 }
            : null,
          commissionStats: commVal
            ? { totalPending: parseFloat(commVal.totals?.total_outstanding ?? commVal.totalPending ?? '0') }
            : null,
          aiUsage: usageVal,
        }));
      } catch {
        // Errors handled per-request via allSettled
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, []);

  // ── Fetch briefing separately (may be slow) ────────────────────────────

  useEffect(() => {
    async function fetchBriefing() {
      try {
        const res = await jarvis.getBriefing();
        setData((prev) => ({ ...prev, briefing: res }));
      } catch {
        // Briefing unavailable
      } finally {
        setBriefingLoading(false);
      }
    }
    fetchBriefing();
  }, []);

  // ── Read aloud ─────────────────────────────────────────────────────────

  const speakBriefing = useCallback(() => {
    if (!data.briefing?.briefing) return;
    const utterance = new SpeechSynthesisUtterance(data.briefing.briefing);
    utterance.rate = 1.0;
    utterance.pitch = 0.9;
    utterance.lang = 'en-US';
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }, [data.briefing]);

  // ── Derived data ───────────────────────────────────────────────────────

  const overview = data.overview;
  const cashBurn = data.cashBurn;
  const cashBalance = cashBurn?.cashBalance ?? overview?.cashBalance ?? 0;
  const totalRevenue = overview?.totalRevenue ?? 0;
  const totalExpenses = overview?.totalExpenses ?? 0;
  const netProfit = overview?.netProfit ?? 0;
  const isProfit = netProfit >= 0;

  // Upcoming events (next 5, sorted by start time)
  const upcomingEvents = [...data.events]
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 5);

  const activeClients = data.clientStats?.active ?? 0;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      <AnimatePresence>{loading && <LoadingScreen />}</AnimatePresence>

      {!loading && (
        <motion.div
          className="min-h-screen grid-overlay mesh-gradient"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="max-w-[1600px] mx-auto px-6 py-8 space-y-8">
            {/* ── Greeting ───────────────────────────────────────────── */}
            <motion.div variants={itemVariants}>
              <motion.h1
                className="text-4xl md:text-5xl font-bold text-white text-glow-blue"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
              >
                {getGreeting()},{' '}
                <span className="text-[#00D4FF]">Mr. Sullivan</span>
              </motion.h1>
              <motion.p
                className="mt-2 text-white/40 font-['JetBrains_Mono',monospace] text-sm tracking-wide"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.6 }}
              >
                {formatDate(new Date())}
              </motion.p>
            </motion.div>

            {/* ── Key Metrics ───────────────────────────────────────── */}
            <motion.div
              className="grid grid-cols-2 lg:grid-cols-4 gap-4"
              variants={containerVariants}
            >
              <motion.div variants={itemVariants}>
                <MetricCard label="Cash Balance">
                  <AnimatedNumber value={cashBalance} prefix="$" className="text-2xl font-bold text-white" />
                </MetricCard>
              </motion.div>
              <motion.div variants={itemVariants}>
                <MetricCard label="Monthly Expenses">
                  <AnimatedNumber value={totalExpenses} prefix="$" className="text-2xl font-bold text-[#FF3B3B]" />
                </MetricCard>
              </motion.div>
              <motion.div variants={itemVariants}>
                <MetricCard label="Monthly Income">
                  <AnimatedNumber value={totalRevenue} prefix="$" className="text-2xl font-bold text-[#00FF88]" />
                </MetricCard>
              </motion.div>
              <motion.div variants={itemVariants}>
                <MetricCard label={isProfit ? 'Net Profit' : 'Net Loss'}>
                  <AnimatedNumber value={Math.abs(netProfit)} prefix={isProfit ? '+$' : '-$'} className={`text-2xl font-bold ${isProfit ? 'text-[#00FF88]' : 'text-[#FF3B3B]'}`} />
                </MetricCard>
              </motion.div>
            </motion.div>

            {/* ── Three-column layout: Action Items + Agenda + Briefing ── */}
            <motion.div
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
              variants={containerVariants}
            >
              {/* Action Items */}
              <motion.div variants={itemVariants}>
                <ActionItemsWidget />
              </motion.div>

              {/* Today's Agenda */}
              <motion.div variants={itemVariants}>
                <HudPanel title="Today's Agenda" delay={0.6}>
                  {!data.calendarConnected || upcomingEvents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Calendar className="w-10 h-10 text-[#00D4FF]/30 mb-3" />
                      {!data.calendarConnected ? (
                        <>
                          <p className="text-white/50 text-sm">
                            Calendar systems offline, sir.
                          </p>
                          <Link
                            to="/settings"
                            className="text-[#00D4FF] text-sm mt-1 hover:underline flex items-center gap-1"
                          >
                            Connect in Settings <ArrowRight className="w-3 h-3" />
                          </Link>
                        </>
                      ) : (
                        <p className="text-white/40 text-sm">
                          No meetings scheduled today, sir.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {upcomingEvents.map((event, i) => (
                        <motion.div
                          key={event.id}
                          className="flex items-center gap-4 px-3 py-2.5 rounded-md hover:bg-white/[0.03] transition-colors"
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.7 + i * 0.08 }}
                        >
                          {/* Time */}
                          <span className="text-sm font-['JetBrains_Mono',monospace] text-[#00D4FF] w-14 shrink-0">
                            {formatTime(event.startTime)}
                          </span>

                          {/* Source dot */}
                          <SourceDot source={event.source} />

                          {/* Title */}
                          <span className="text-sm text-white/80 truncate flex-1">
                            {event.title}
                          </span>

                          {/* Source label */}
                          <span className="text-[10px] text-white/30 uppercase tracking-wider shrink-0">
                            {event.source === 'google'
                              ? 'Google'
                              : event.source === 'microsoft'
                                ? 'Outlook'
                                : 'Manual'}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </HudPanel>
              </motion.div>

              {/* JARVIS Daily Briefing */}
              <motion.div variants={itemVariants}>
                <HudPanel title="JARVIS Daily Briefing" delay={0.7}>
                  {/* Pulsing status indicator */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-[#00D4FF] opacity-75 animate-ping" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#00D4FF]" />
                      </span>
                      <span className="text-xs text-white/40 uppercase tracking-widest font-['JetBrains_Mono',monospace]">
                        {briefingLoading ? 'Compiling...' : 'Live'}
                      </span>
                    </div>

                    {data.briefing && (
                      <button
                        onClick={speakBriefing}
                        className="p-2 rounded-md hover:bg-white/[0.05] text-white/40 hover:text-[#00D4FF] transition-colors"
                        title="Read aloud"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Briefing content */}
                  <div className="min-h-[120px]">
                    {briefingLoading ? (
                      <motion.p
                        className="text-white/40 text-sm font-['JetBrains_Mono',monospace] initializing-cursor"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        Compiling briefing, sir...
                      </motion.p>
                    ) : data.briefing ? (
                      <p className="text-white/70 text-sm leading-relaxed">
                        <TypingText text={data.briefing.briefing} />
                      </p>
                    ) : (
                      <p className="text-white/30 text-sm">
                        Briefing system unavailable. JARVIS will retry shortly.
                      </p>
                    )}
                  </div>
                </HudPanel>
              </motion.div>
            </motion.div>

            {/* ── Clients ───────────────────────────────────────────── */}
            <motion.div variants={itemVariants}>
              <div className="flex items-center gap-6 px-5 py-3 bg-[#0D1321]/80 border border-[#1A2035] rounded-lg">
                <Users className="w-4 h-4 text-[#00D4FF]" />
                <span className="text-sm text-white/80">{activeClients} active clients</span>
                <Link to="/clients" className="text-xs text-[#00D4FF] hover:underline ml-auto">View all</Link>
              </div>
            </motion.div>

            {/* ── Bottom edge scanline ───────────────────────────────── */}
            <motion.div
              className="h-[1px] bg-gradient-to-r from-transparent via-[#00D4FF]/10 to-transparent"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1.5, delay: 1.4 }}
            />
          </div>
        </motion.div>
      )}
    </>
  );
}
