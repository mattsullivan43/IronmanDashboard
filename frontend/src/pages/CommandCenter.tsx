import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Volume2,
  Users,
  Truck,
  DollarSign,
  Cpu,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { MetricCard } from '../components/ui/MetricCard';
import HudPanel from '../components/ui/HudPanel';
import AnimatedNumber from '../components/ui/AnimatedNumber';
import { SparkLine } from '../components/charts/SparkLine';
import GlowBadge from '../components/ui/GlowBadge';
import { metrics, calendar, jarvis, clients, commissions } from '../services/api';
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

function mrrHealth(growth: number): 'good' | 'warning' | 'danger' {
  if (growth >= 5) return 'good';
  if (growth >= 0) return 'warning';
  return 'danger';
}

function burnHealth(burn: number, revenue: number): 'good' | 'warning' | 'danger' {
  if (revenue <= 0) return 'danger';
  const ratio = burn / revenue;
  if (ratio < 0.6) return 'good';
  if (ratio < 0.9) return 'warning';
  return 'danger';
}

function runwayHealth(months: number): 'good' | 'warning' | 'danger' {
  if (months >= 12) return 'good';
  if (months >= 6) return 'warning';
  return 'danger';
}

function runwayColor(months: number): string {
  if (months >= 12) return 'text-[#00FF88]';
  if (months >= 6) return 'text-[#FFB800]';
  return 'text-[#FF3B3B]';
}

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

function MiniBarChart({
  income,
  expenses,
}: {
  income: number;
  expenses: number;
}) {
  const max = Math.max(income, expenses, 1);
  const incomePercent = (income / max) * 100;
  const expensePercent = (expenses / max) * 100;

  return (
    <div className="flex items-end gap-3 h-10 mt-2">
      <div className="flex flex-col items-center gap-1 flex-1">
        <motion.div
          className="w-full bg-[#00FF88]/20 rounded-sm relative overflow-hidden"
          initial={{ height: 0 }}
          animate={{ height: `${incomePercent}%` }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          <div className="absolute inset-0 bg-[#00FF88]/40" />
        </motion.div>
        <span className="text-[10px] text-white/40 uppercase">In</span>
      </div>
      <div className="flex flex-col items-center gap-1 flex-1">
        <motion.div
          className="w-full bg-[#FF3B3B]/20 rounded-sm relative overflow-hidden"
          initial={{ height: 0 }}
          animate={{ height: `${expensePercent}%` }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <div className="absolute inset-0 bg-[#FF3B3B]/40" />
        </motion.div>
        <span className="text-[10px] text-white/40 uppercase">Out</span>
      </div>
    </div>
  );
}

// ── Calendar source dot ─────────────────────────────────────────────────────

function SourceDot({ source }: { source: string }) {
  const colors: Record<string, string> = {
    google: 'bg-blue-400',
    microsoft: 'bg-purple-400',
    manual: 'bg-[#00D4FF]',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[source] || colors.manual}`} />;
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
  const mrr = overview?.mrr ?? 0;
  const arr = mrr * 12;
  const cashBalance = cashBurn?.cashBalance ?? overview?.cashBalance ?? 0;
  const monthlyBurn = cashBurn?.monthlyBurn ?? 0;
  const runway = cashBurn?.runway ?? overview?.runway ?? 0;
  const revenueGrowth = overview?.revenueGrowth ?? 0;
  const totalRevenue = overview?.totalRevenue ?? 0;
  const totalExpenses = overview?.totalExpenses ?? 0;
  const netProfit = overview?.netProfit ?? 0;
  const isProfit = netProfit >= 0;

  // Sparkline data from cashBurn history
  const burnHistory = (cashBurn as any)?.burn_history ?? [];
  const mrrSparkData = burnHistory.length > 0 ? burnHistory.map((m: any) => parseFloat(m.income ?? m.inflow ?? 0)) : [0, 0];
  const cashSparkData = burnHistory.length > 0 ? burnHistory.map((m: any) => parseFloat(m.income ?? 0) - parseFloat(m.expenses ?? 0)) : [0, 0];
  const burnSparkData = burnHistory.length > 0 ? burnHistory.map((m: any) => parseFloat(m.expenses ?? m.outflow ?? 0)) : [0, 0];

  // Upcoming events (next 5, sorted by start time)
  const upcomingEvents = [...data.events]
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 5);

  // AI usage today — backend returns { requests, tokens, limit } directly, no byDay array
  const aiUsageAny = data.aiUsage as any;
  let aiRequestsToday = 0;
  let aiDailyLimit = 50;
  if (aiUsageAny) {
    if (typeof aiUsageAny.requests === 'number') {
      aiRequestsToday = aiUsageAny.requests;
      aiDailyLimit = aiUsageAny.limit ?? 50;
    } else if (Array.isArray(aiUsageAny.byDay)) {
      const todayStr = new Date().toISOString().split('T')[0];
      const aiToday = aiUsageAny.byDay.find((d: any) => d.date === todayStr);
      aiRequestsToday = aiToday?.requests ?? 0;
      aiDailyLimit = 500;
    }
  }

  // Total cranes = active clients (crane companies on platform)
  const totalCranes = data.clientStats?.total ?? 0;
  const activeClients = data.clientStats?.active ?? 0;
  const commissionsOutstanding = data.commissionStats?.totalPending ?? 0;

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

            {/* ── Key Metrics Row ────────────────────────────────────── */}
            <motion.div
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4"
              variants={containerVariants}
            >
              {/* MRR */}
              <motion.div variants={itemVariants}>
                <MetricCard
                  label="Monthly Recurring Revenue"
                  health={mrrHealth(revenueGrowth)}
                  footer={
                    <div className="flex items-center justify-between">
                      <SparkLine data={mrrSparkData} color="#00FF88" />
                      <GlowBadge
                        status={mrrHealth(revenueGrowth)}
                        label={revenueGrowth >= 0 ? 'Growing' : 'Declining'}
                        value={`${revenueGrowth >= 0 ? '+' : ''}${revenueGrowth.toFixed(1)}%`}
                      />
                    </div>
                  }
                >
                  <AnimatedNumber
                    value={mrr}
                    prefix="$"
                    className="text-2xl font-bold text-white"
                  />
                </MetricCard>
              </motion.div>

              {/* ARR */}
              <motion.div variants={itemVariants}>
                <MetricCard
                  label="Annual Recurring Revenue"
                  health={mrrHealth(revenueGrowth)}
                >
                  <AnimatedNumber
                    value={arr}
                    prefix="$"
                    className="text-2xl font-bold text-white"
                  />
                  <p className="text-xs text-white/30 mt-1 font-['JetBrains_Mono',monospace]">
                    MRR x 12
                  </p>
                </MetricCard>
              </motion.div>

              {/* Cash Balance */}
              <motion.div variants={itemVariants}>
                <MetricCard
                  label="Cash Balance"
                  footer={<SparkLine data={cashSparkData} color="#00D4FF" />}
                >
                  <div className="flex items-center gap-2">
                    <AnimatedNumber
                      value={cashBalance}
                      prefix="$"
                      className="text-2xl font-bold text-white"
                    />
                    {cashBurn?.burnTrend === 'increasing' ? (
                      <TrendingDown className="w-4 h-4 text-[#FF3B3B]" />
                    ) : (
                      <TrendingUp className="w-4 h-4 text-[#00FF88]" />
                    )}
                  </div>
                </MetricCard>
              </motion.div>

              {/* Burn Rate */}
              <motion.div variants={itemVariants}>
                <MetricCard
                  label="Monthly Burn Rate"
                  health={burnHealth(monthlyBurn, totalRevenue)}
                  footer={
                    <div className="flex items-center justify-between">
                      <SparkLine data={burnSparkData} color="#FFB800" />
                      <GlowBadge
                        status={burnHealth(monthlyBurn, totalRevenue)}
                        label={cashBurn?.burnTrend === 'decreasing' ? 'Improving' : cashBurn?.burnTrend === 'increasing' ? 'Rising' : 'Stable'}
                      />
                    </div>
                  }
                >
                  <AnimatedNumber
                    value={monthlyBurn}
                    prefix="$"
                    className="text-2xl font-bold text-white"
                  />
                </MetricCard>
              </motion.div>

              {/* Runway */}
              <motion.div variants={itemVariants}>
                <MetricCard
                  label="Runway"
                  health={runwayHealth(runway)}
                  className="col-span-2 md:col-span-1"
                >
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-3xl font-bold font-['JetBrains_Mono',monospace] hud-countdown ${runwayColor(runway)}`}
                    >
                      <AnimatedNumber value={runway} className={runwayColor(runway)} />
                    </span>
                    <span className="text-sm text-white/40 uppercase tracking-wider">months</span>
                  </div>
                  {runway < 6 && (
                    <motion.div
                      className="flex items-center gap-1 mt-2 text-[#FF3B3B] text-xs"
                      animate={{ opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <AlertCircle className="w-3 h-3" />
                      <span>Critical runway warning</span>
                    </motion.div>
                  )}
                </MetricCard>
              </motion.div>
            </motion.div>

            {/* ── Two-column layout: Agenda + Briefing ───────────────── */}
            <motion.div
              className="grid grid-cols-1 lg:grid-cols-2 gap-6"
              variants={containerVariants}
            >
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

            {/* ── Net Profit/Loss + Quick Stats ──────────────────────── */}
            <motion.div
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
              variants={containerVariants}
            >
              {/* Net Profit/Loss This Month */}
              <motion.div variants={itemVariants}>
                <HudPanel title="Net Profit/Loss This Month" delay={0.9}>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div
                        className={`text-3xl font-bold font-['JetBrains_Mono',monospace] ${
                          isProfit ? 'text-[#00FF88] text-glow-blue' : 'text-[#FF3B3B]'
                        }`}
                        style={
                          isProfit
                            ? { textShadow: '0 0 15px rgba(0,255,136,0.4)' }
                            : { textShadow: '0 0 15px rgba(255,59,59,0.4)' }
                        }
                      >
                        <AnimatedNumber
                          value={Math.abs(netProfit)}
                          prefix={isProfit ? '+$' : '-$'}
                          className={isProfit ? 'text-[#00FF88]' : 'text-[#FF3B3B]'}
                        />
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        {isProfit ? (
                          <TrendingUp className="w-3 h-3 text-[#00FF88]" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-[#FF3B3B]" />
                        )}
                        <span className="text-xs text-white/40">
                          {isProfit ? 'Profitable' : 'Net loss'} this period
                        </span>
                      </div>
                    </div>

                    <MiniBarChart income={totalRevenue} expenses={totalExpenses} />
                  </div>
                </HudPanel>
              </motion.div>

              {/* Quick Stats */}
              <motion.div className="lg:col-span-2" variants={itemVariants}>
                <HudPanel title="Quick Stats" delay={1.0}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Active Clients */}
                    <div className="flex flex-col items-center p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <Users className="w-5 h-5 text-[#00D4FF] mb-2" />
                      <AnimatedNumber
                        value={activeClients}
                        className="text-xl font-bold text-white"
                      />
                      <span className="text-[10px] text-white/40 uppercase tracking-wider mt-1">
                        Active Clients
                      </span>
                    </div>

                    {/* Total Cranes */}
                    <div className="flex flex-col items-center p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <Truck className="w-5 h-5 text-[#FFB800] mb-2" />
                      <AnimatedNumber
                        value={totalCranes}
                        className="text-xl font-bold text-white"
                      />
                      <span className="text-[10px] text-white/40 uppercase tracking-wider mt-1">
                        Cranes on Platform
                      </span>
                    </div>

                    {/* Commissions Outstanding */}
                    <div className="flex flex-col items-center p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <DollarSign className="w-5 h-5 text-[#00FF88] mb-2" />
                      <AnimatedNumber
                        value={commissionsOutstanding}
                        prefix="$"
                        className="text-xl font-bold text-white"
                      />
                      <span className="text-[10px] text-white/40 uppercase tracking-wider mt-1">
                        Commissions Owed
                      </span>
                    </div>

                    {/* AI Requests Today */}
                    <div className="flex flex-col items-center p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <Cpu className="w-5 h-5 text-[#00D4FF] mb-2" />
                      <div className="flex items-baseline gap-1">
                        <AnimatedNumber
                          value={aiRequestsToday}
                          className="text-xl font-bold text-white"
                        />
                        <span className="text-xs text-white/30 font-['JetBrains_Mono',monospace]">
                          / {aiDailyLimit}
                        </span>
                      </div>
                      <span className="text-[10px] text-white/40 uppercase tracking-wider mt-1">
                        AI Requests Today
                      </span>
                      {/* Usage bar */}
                      <div className="w-full h-1 bg-white/[0.06] rounded-full mt-2 overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${
                            aiRequestsToday / aiDailyLimit > 0.9
                              ? 'bg-[#FF3B3B]'
                              : aiRequestsToday / aiDailyLimit > 0.7
                                ? 'bg-[#FFB800]'
                                : 'bg-[#00D4FF]'
                          }`}
                          initial={{ width: 0 }}
                          animate={{
                            width: `${Math.min((aiRequestsToday / aiDailyLimit) * 100, 100)}%`,
                          }}
                          transition={{ duration: 1, delay: 1.2 }}
                        />
                      </div>
                    </div>
                  </div>
                </HudPanel>
              </motion.div>
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
