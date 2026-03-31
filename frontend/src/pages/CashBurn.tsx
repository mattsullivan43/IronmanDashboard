import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Banknote,
  Flame,
  Clock,
  Target,
  Users,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import MetricCard from '../components/ui/MetricCard';
import HudPanel from '../components/ui/HudPanel';
import AnimatedNumber from '../components/ui/AnimatedNumber';
import GlowBadge from '../components/ui/GlowBadge';
import DateRangeFilter from '../components/ui/DateRangeFilter';
import Button from '../components/ui/Button';
import { metrics } from '../services/api';
import { formatCurrency } from '../utils/format';
import type { CashBurnMetrics, MetricsOverview } from '../types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function getRunwayColor(months: number): string {
  if (months > 12) return '#00FF88';
  if (months >= 6) return '#FFB800';
  return '#FF3B3B';
}

function getRunwayStatus(months: number): 'good' | 'warning' | 'danger' {
  if (months > 12) return 'good';
  if (months >= 6) return 'warning';
  return 'danger';
}

function getBurnStatus(burn: number): 'good' | 'warning' | 'danger' {
  if (burn < 5000) return 'good';
  if (burn < 10000) return 'warning';
  return 'danger';
}

function getBurnMultipleStatus(multiple: number): 'good' | 'warning' | 'danger' {
  if (multiple < 2) return 'good';
  if (multiple < 4) return 'warning';
  return 'danger';
}

// ── Stagger animation container ─────────────────────────────────────────────

const stagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
};

// ── Circular Runway Ring ────────────────────────────────────────────────────

function RunwayRing({ months, maxMonths = 24 }: { months: number; maxMonths?: number }) {
  const color = getRunwayColor(months);
  const radius = 80;
  const stroke = 6;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(months / maxMonths, 1);
  const dashOffset = circumference * (1 - progress);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="relative flex items-center justify-center"
    >
      <svg width={200} height={200} viewBox="0 0 200 200">
        {/* Background ring */}
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="#1A2035"
          strokeWidth={stroke}
        />
        {/* Animated progress ring */}
        <motion.circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 1.5, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          transform="rotate(-90 100 100)"
          style={{
            filter: `drop-shadow(0 0 8px ${color}80)`,
          }}
        />
        {/* Glow outer ring */}
        <motion.circle
          cx="100"
          cy="100"
          r={radius + 4}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeOpacity={0.2}
          strokeDasharray={circumference * 1.05}
          initial={{ strokeDashoffset: circumference * 1.05 }}
          animate={{ strokeDashoffset: circumference * 1.05 * (1 - progress) }}
          transition={{ duration: 1.5, delay: 0.5 }}
          transform="rotate(-90 100 100)"
        />
      </svg>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="text-4xl font-bold font-mono"
          style={{ color, textShadow: `0 0 20px ${color}60` }}
        >
          {months.toFixed(1)}
        </motion.span>
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
          className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50 mt-1"
        >
          Months
        </motion.span>
      </div>
    </motion.div>
  );
}

// ── Custom Chart Tooltip ────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0D1321]/95 backdrop-blur-xl border border-[#1A2035] rounded-lg p-3 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
      <p className="text-xs text-white/50 font-mono mb-2">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 mb-1 last:mb-0">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-xs text-white/70">{entry.name}:</span>
          <span className="text-xs font-mono font-semibold text-white">
            {formatCurrency(entry.value, { compact: true })}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Page Component ──────────────────────────────────────────────────────────

export default function CashBurn() {
  const [cashData, setCashData] = useState<CashBurnMetrics | null>(null);
  const [overview, setOverview] = useState<MetricsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date range state
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const [startDate, setStartDate] = useState(yearAgo.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(now.toISOString().split('T')[0]);

  // Manual cash balance update
  const [cashInput, setCashInput] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [cashRes, overviewRes] = await Promise.all([
        metrics.getCashBurn(),
        metrics.getOverview(),
      ]);
      setCashData(cashRes);
      setOverview(overviewRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cash burn data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCashUpdate = async () => {
    const value = parseFloat(cashInput);
    if (isNaN(value) || value < 0) return;

    try {
      setUpdating(true);
      await metrics.updateCashBalance(value);
      setUpdateSuccess(true);
      setCashInput('');
      setTimeout(() => setUpdateSuccess(false), 3000);
      fetchData();
    } catch {
      setError('Failed to update cash balance');
    } finally {
      setUpdating(false);
    }
  };

  const handleDateRangeChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  };

  // Derived calculations
  const cashBalance = cashData?.cashBalance ?? 0;
  const monthlyBurn = cashData?.monthlyBurn ?? 0;
  const runway = cashData?.runway ?? 0;
  const burnTrend = cashData?.burnTrend ?? 'stable';
  const monthlyData = Array.isArray(cashData?.byMonth) ? cashData.byMonth : [];
  const burnRates = monthlyData.map((m) => m.outflow);

  // Burn Multiple = Net Burn / Net New ARR (derived from overview)
  const netNewARR = (overview?.mrr ?? 0) * 12 * (overview?.revenueGrowth ?? 0);
  const netBurn = monthlyBurn;
  const burnMultiple = netNewARR > 0 ? netBurn / (netNewARR / 12) : Infinity;

  // Break-Even = Fixed Costs / Gross Profit Per Customer
  const totalExpenses = overview?.totalExpenses ?? 0;
  const activeClients = overview?.activeClients ?? 1;
  const mrr = overview?.mrr ?? 0;
  const grossProfitPerClient = activeClients > 0 ? (mrr - totalExpenses / activeClients) : 0;
  const breakEvenCustomers = grossProfitPerClient > 0
    ? Math.ceil(totalExpenses / grossProfitPerClient)
    : 0;

  // Filter monthly data by date range
  const filteredMonthly = monthlyData.filter((m) => {
    const d = m.month;
    return d >= startDate.slice(0, 7) && d <= endDate.slice(0, 7);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
        >
          <RefreshCw className="w-8 h-8 text-jarvis-blue" />
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="space-y-8 pb-12"
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Cash &amp; Burn
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Financial runway analysis and burn rate monitoring
          </p>
        </div>
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onRangeChange={handleDateRangeChange}
        />
      </motion.div>

      {/* ── Error Banner ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-jarvis-red/10 border border-jarvis-red/30 rounded-lg px-4 py-3 flex items-center gap-3"
          >
            <AlertTriangle className="w-4 h-4 text-jarvis-red flex-shrink-0" />
            <span className="text-sm text-jarvis-red">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cash Balance Hero + Manual Update ───────────────────────────── */}
      <motion.div variants={fadeUp}>
        <HudPanel className="text-center py-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            <div className="flex items-center justify-center gap-2 mb-3">
              <Banknote className="w-5 h-5 text-jarvis-blue" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Cash Balance
              </span>
            </div>
            <div
              className="flex items-center justify-center"
              style={{ textShadow: '0 0 40px rgba(0,212,255,0.3), 0 0 80px rgba(0,212,255,0.1)' }}
            >
              <AnimatedNumber
                value={cashBalance}
                prefix="$"
                duration={2}
                className="text-5xl md:text-6xl font-bold text-white"
              />
            </div>

            {/* Inline balance update */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
              className="mt-6 max-w-md mx-auto"
            >
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 font-mono text-sm">$</span>
                  <input
                    type="number"
                    placeholder="Enter new balance..."
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCashUpdate(); }}
                    className="w-full bg-[#0D1321]/80 border border-[#1A2035] rounded-lg pl-7 pr-3 py-2.5 text-sm font-mono text-white placeholder-white/20 focus:outline-none focus:border-jarvis-blue/50 focus:ring-1 focus:ring-jarvis-blue/30 transition-colors"
                  />
                </div>
                <Button
                  onClick={handleCashUpdate}
                  loading={updating}
                  disabled={!cashInput || isNaN(parseFloat(cashInput))}
                  icon={<RefreshCw className="w-4 h-4" />}
                >
                  Update Balance
                </Button>
                <AnimatePresence>
                  {updateSuccess && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8, x: -10 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.8, x: 10 }}
                      className="flex items-center gap-1.5 text-jarvis-green"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-xs font-medium">Saved</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Runway calculation breakdown */}
              {cashInput && !isNaN(parseFloat(cashInput)) && monthlyBurn > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 bg-[#0D1321]/60 border border-[#1A2035] rounded-lg px-4 py-3"
                >
                  <div className="flex items-center justify-center gap-2 text-xs font-mono text-white/50">
                    <span className="text-jarvis-blue">{formatCurrency(parseFloat(cashInput))}</span>
                    <span className="text-white/30">/</span>
                    <span className="text-jarvis-red">{formatCurrency(monthlyBurn)}/mo burn</span>
                    <span className="text-white/30">=</span>
                    <span
                      className="font-semibold"
                      style={{ color: getRunwayColor(parseFloat(cashInput) / monthlyBurn) }}
                    >
                      {(parseFloat(cashInput) / monthlyBurn).toFixed(1)} months runway
                    </span>
                  </div>
                </motion.div>
              )}
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="text-xs text-white/30 mt-4 font-mono"
            >
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </motion.p>
          </motion.div>
        </HudPanel>
      </motion.div>

      {/* ── Key Metrics Row ──────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<Flame />}
          label="Monthly Burn Rate"
          value={monthlyBurn}
          prefix="$"
          health={getBurnStatus(monthlyBurn)}
          sparklineData={burnRates}
          delay={0.1}
        />
        <MetricCard
          icon={<Clock />}
          label="Runway"
          value={runway}
          suffix=" mo"
          health={getRunwayStatus(runway)}
          decimals={1}
          delay={0.2}
        />
        <MetricCard
          icon={<Target />}
          label="Burn Multiple"
          value={burnMultiple === Infinity ? 0 : burnMultiple}
          suffix="x"
          health={getBurnMultipleStatus(burnMultiple)}
          decimals={1}
          delay={0.3}
        />
        <MetricCard
          icon={<Users />}
          label="Break-Even Customers"
          value={breakEvenCustomers}
          health="neutral"
          delay={0.4}
        />
      </motion.div>

      {/* ── Runway Countdown + Burn Multiple ─────────────────────────────── */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Runway Countdown */}
        <HudPanel title="Runway Countdown" delay={0.3}>
          <div className="flex flex-col items-center py-4">
            <RunwayRing months={runway} />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="mt-4 text-center"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/30">
                At Current Burn Rate
              </span>
              <div className="mt-3">
                <GlowBadge
                  status={getRunwayStatus(runway)}
                  label={
                    runway > 12
                      ? 'Healthy Runway'
                      : runway >= 6
                        ? 'Monitor Closely'
                        : 'Critical'
                  }
                  value={`${runway.toFixed(1)} mo`}
                />
              </div>
            </motion.div>
          </div>
        </HudPanel>

        {/* Burn Multiple & Break-Even */}
        <HudPanel title="Financial Health" delay={0.4}>
          <div className="space-y-6 py-2">
            {/* Burn Multiple */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium uppercase tracking-wider text-white/50">
                  Burn Multiple
                </span>
                <GlowBadge
                  status={getBurnMultipleStatus(burnMultiple)}
                  label={burnMultiple < 2 ? 'Efficient' : burnMultiple < 4 ? 'Moderate' : 'High'}
                  value={burnMultiple === Infinity ? 'N/A' : `${burnMultiple.toFixed(1)}x`}
                />
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold font-mono text-white">
                  {burnMultiple === Infinity ? '--' : burnMultiple.toFixed(1)}
                </span>
                <span className="text-sm text-white/30">x</span>
              </div>
              <p className="text-xs text-white/30 mt-1">
                Net Burn / Net New ARR &mdash; Target: &lt; 2x
              </p>
            </div>

            <div className="border-t border-jarvis-border" />

            {/* Break-Even Point */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium uppercase tracking-wider text-white/50">
                  Break-Even Point
                </span>
                <GlowBadge
                  status={breakEvenCustomers <= activeClients ? 'good' : 'warning'}
                  label={breakEvenCustomers <= activeClients ? 'Achieved' : 'In Progress'}
                />
              </div>
              <div className="flex items-baseline gap-3">
                <AnimatedNumber
                  value={breakEvenCustomers}
                  className="text-3xl font-bold text-white"
                />
                <span className="text-sm text-white/30">customers needed</span>
              </div>
              <p className="text-xs text-white/30 mt-1">
                Fixed Costs / Gross Profit Per Customer &mdash; Currently at{' '}
                <span className="text-jarvis-blue font-mono">{activeClients}</span> active
              </p>
            </div>
          </div>
        </HudPanel>
      </motion.div>

      {/* ── Monthly Cash Flow Chart ──────────────────────────────────────── */}
      <motion.div variants={fadeUp}>
        <HudPanel title="Monthly Cash Flow" delay={0.5}>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={filteredMonthly} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00FF88" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00FF88" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outflowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF3B3B" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#FF3B3B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A2035" vertical={false} />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
                  tickFormatter={(v: number) => formatCurrency(v, { compact: true })}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: "'JetBrains Mono', monospace" }}
                />
                <Area
                  type="monotone"
                  dataKey="inflow"
                  name="Cash In"
                  stroke="#00FF88"
                  strokeWidth={2}
                  fill="url(#inflowGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#00FF88', stroke: '#0D1321', strokeWidth: 2 }}
                  animationDuration={1200}
                />
                <Area
                  type="monotone"
                  dataKey="outflow"
                  name="Cash Out"
                  stroke="#FF3B3B"
                  strokeWidth={2}
                  fill="url(#outflowGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#FF3B3B', stroke: '#0D1321', strokeWidth: 2 }}
                  animationDuration={1200}
                />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        </HudPanel>
      </motion.div>

      {/* ── Burn Rate Trend ──────────────────────────────────────────────── */}
      <motion.div variants={fadeUp}>
        <HudPanel title="Burn Rate Trend" delay={0.6}>
          <div className="flex items-center gap-3 mb-4">
            {burnTrend === 'increasing' && (
              <GlowBadge status="danger" label="Increasing" value="" />
            )}
            {burnTrend === 'decreasing' && (
              <GlowBadge status="good" label="Decreasing" value="" />
            )}
            {burnTrend === 'stable' && (
              <GlowBadge status="warning" label="Stable" value="" />
            )}
            <span className="text-xs text-white/30">
              {burnTrend === 'increasing'
                ? 'Burn rate is trending upward'
                : burnTrend === 'decreasing'
                  ? 'Burn rate is trending downward'
                  : 'Burn rate is holding steady'}
            </span>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          >
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={filteredMonthly} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="burnLineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#FFB800" />
                    <stop offset="100%" stopColor="#FF3B3B" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A2035" vertical={false} />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
                  tickFormatter={(v: number) => formatCurrency(v, { compact: true })}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="outflow"
                  name="Monthly Burn"
                  stroke="url(#burnLineGrad)"
                  strokeWidth={2.5}
                  dot={{ fill: '#FFB800', stroke: '#0D1321', strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5, fill: '#FFB800', stroke: '#0D1321', strokeWidth: 2 }}
                  animationDuration={1200}
                />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        </HudPanel>
      </motion.div>

      {/* ── Projected Runway Chart ───────────────────────────────────────── */}
      {Array.isArray(cashData?.projectedRunway) && cashData.projectedRunway.length > 0 && (
        <motion.div variants={fadeUp}>
          <HudPanel title="Projected Cash Runway" delay={0.8}>
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.9 }}
            >
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={cashData.projectedRunway} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="projectedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00D4FF" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1A2035" vertical={false} />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
                    tickFormatter={(v: number) => formatCurrency(v, { compact: true })}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    name="Projected Balance"
                    stroke="#00D4FF"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    fill="url(#projectedGrad)"
                    dot={false}
                    animationDuration={1200}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          </HudPanel>
        </motion.div>
      )}
    </motion.div>
  );
}
