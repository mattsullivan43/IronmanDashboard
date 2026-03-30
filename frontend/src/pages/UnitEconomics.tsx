import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign,
  Heart,
  Ratio,
  Timer,
  Megaphone,
  ArrowRight,
  Target,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Info,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import MetricCard from '../components/ui/MetricCard';
import HudPanel from '../components/ui/HudPanel';
import AnimatedNumber from '../components/ui/AnimatedNumber';
import GlowBadge from '../components/ui/GlowBadge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { metrics } from '../services/api';
import { formatCurrency, formatPercent } from '../utils/format';
import type { UnitEconomics as UnitEconomicsType } from '../types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function getCACStatus(cac: number, firstYearValue: number): 'good' | 'warning' | 'danger' {
  const ratio = firstYearValue > 0 ? cac / firstYearValue : 1;
  if (ratio < 0.25) return 'good';
  if (ratio < 0.5) return 'warning';
  return 'danger';
}

function getLTVCACStatus(ratio: number): 'good' | 'warning' | 'danger' {
  if (ratio >= 3 && ratio <= 5) return 'good';
  if (ratio >= 2 && ratio < 3) return 'warning';
  if (ratio > 7) return 'warning'; // inefficient spend
  return 'danger';
}

function getPaybackStatus(months: number): 'good' | 'warning' | 'danger' {
  if (months < 12) return 'good';
  if (months < 18) return 'warning';
  return 'danger';
}

// ── Animation variants ──────────────────────────────────────────────────────

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

// ── LTV:CAC Circular Gauge ──────────────────────────────────────────────────

function LTVCACGauge({ ratio }: { ratio: number }) {
  const status = getLTVCACStatus(ratio);
  const color = status === 'good' ? '#00FF88' : status === 'warning' ? '#FFB800' : '#FF3B3B';
  const radius = 85;
  const stroke = 8;
  const circumference = 2 * Math.PI * radius;
  // Normalize: 0-10x maps to 0-100%
  const progress = Math.min(ratio / 10, 1);
  const dashOffset = circumference * (1 - progress);

  // Target zone indicators (3x-5x = 30%-50% of arc)
  const targetStart = 0.3; // 3x / 10
  const targetEnd = 0.5; // 5x / 10

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.3 }}
      className="relative flex items-center justify-center"
    >
      <svg width={220} height={220} viewBox="0 0 220 220">
        {/* Background ring */}
        <circle
          cx="110"
          cy="110"
          r={radius}
          fill="none"
          stroke="#1A2035"
          strokeWidth={stroke}
        />

        {/* Target zone ring (3x-5x) */}
        <circle
          cx="110"
          cy="110"
          r={radius}
          fill="none"
          stroke="#00FF88"
          strokeWidth={stroke}
          strokeOpacity={0.15}
          strokeDasharray={`${circumference * (targetEnd - targetStart)} ${circumference * (1 - (targetEnd - targetStart))}`}
          strokeDashoffset={-circumference * targetStart}
          transform="rotate(-90 110 110)"
        />

        {/* Progress ring */}
        <motion.circle
          cx="110"
          cy="110"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 1.5, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          transform="rotate(-90 110 110)"
          style={{ filter: `drop-shadow(0 0 10px ${color}80)` }}
        />

        {/* Outer glow */}
        <motion.circle
          cx="110"
          cy="110"
          r={radius + 5}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeOpacity={0.15}
          strokeDasharray={circumference * 1.06}
          initial={{ strokeDashoffset: circumference * 1.06 }}
          animate={{ strokeDashoffset: circumference * 1.06 * (1 - progress) }}
          transition={{ duration: 1.5, delay: 0.5 }}
          transform="rotate(-90 110 110)"
        />

        {/* Scale markers */}
        {[1, 2, 3, 5, 7, 10].map((mark) => {
          const angle = ((mark / 10) * 360 - 90) * (Math.PI / 180);
          const x1 = 110 + (radius - 15) * Math.cos(angle);
          const y1 = 110 + (radius - 15) * Math.sin(angle);
          const x2 = 110 + (radius - 8) * Math.cos(angle);
          const y2 = 110 + (radius - 8) * Math.sin(angle);
          const tx = 110 + (radius - 25) * Math.cos(angle);
          const ty = 110 + (radius - 25) * Math.sin(angle);
          return (
            <g key={mark}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
              <text
                x={tx}
                y={ty}
                textAnchor="middle"
                dominantBaseline="central"
                fill="rgba(255,255,255,0.25)"
                fontSize={9}
                fontFamily="'JetBrains Mono', monospace"
              >
                {mark}x
              </text>
            </g>
          );
        })}
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="text-4xl font-bold font-mono"
          style={{ color, textShadow: `0 0 20px ${color}60` }}
        >
          {ratio.toFixed(1)}
        </motion.span>
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
          className="text-xs font-semibold uppercase tracking-[0.15em] text-white/50 mt-0.5"
        >
          LTV : CAC
        </motion.span>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="mt-2"
        >
          <span className="text-[10px] text-white/25 font-mono">TARGET 3-5x</span>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ── Formula Card ────────────────────────────────────────────────────────────

function FormulaCard({
  items,
  result,
  resultLabel,
  delay = 0,
}: {
  items: Array<{ label: string; value: string }>;
  result: string;
  resultLabel: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="flex items-center gap-2 flex-wrap"
    >
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          {i > 0 && (
            <span className="text-jarvis-blue/60 text-lg font-mono">
              {i === items.length - 1 ? '=' : '/'}
            </span>
          )}
          <div className="bg-[#0D1321]/80 border border-[#1A2035] rounded-lg px-3 py-2 backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">{item.label}</div>
            <div className="text-sm font-mono font-semibold text-white">{item.value}</div>
          </div>
        </div>
      ))}
      <ArrowRight className="w-4 h-4 text-jarvis-blue/40 mx-1" />
      <div className="bg-jarvis-blue/10 border border-jarvis-blue/30 rounded-lg px-4 py-2 shadow-[0_0_12px_rgba(0,212,255,0.15)]">
        <div className="text-[10px] uppercase tracking-wider text-jarvis-blue/60 mb-0.5">{resultLabel}</div>
        <div className="text-sm font-mono font-bold text-jarvis-blue">{result}</div>
      </div>
    </motion.div>
  );
}

// ── Benchmark Item ──────────────────────────────────────────────────────────

function BenchmarkItem({
  label,
  target,
  current,
  status,
}: {
  label: string;
  target: string;
  current: string;
  status: 'good' | 'warning' | 'danger';
}) {
  const statusColors = {
    good: 'text-jarvis-green',
    warning: 'text-jarvis-gold',
    danger: 'text-jarvis-red',
  };
  const statusIcons = {
    good: <CheckCircle2 className="w-3.5 h-3.5" />,
    warning: <AlertTriangle className="w-3.5 h-3.5" />,
    danger: <AlertTriangle className="w-3.5 h-3.5" />,
  };

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-jarvis-border/50 last:border-0">
      <div className="flex items-center gap-2.5">
        <span className={statusColors[status]}>{statusIcons[status]}</span>
        <span className="text-sm text-white/70">{label}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-white/30 font-mono">Target: {target}</span>
        <span className={`text-sm font-mono font-semibold ${statusColors[status]}`}>{current}</span>
      </div>
    </div>
  );
}

// ── Custom Tooltip ──────────────────────────────────────────────────────────

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

export default function UnitEconomicsPage() {
  const [data, setData] = useState<UnitEconomicsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable S&M spend
  const [smSpend, setSmSpend] = useState('');
  const [customCAC, setCustomCAC] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await metrics.getUnitEconomics();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load unit economics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived values
  const cac = data?.customerAcquisitionCost ?? 0;
  const ltv = data?.lifetimeValue ?? 0;
  const ltvCacRatio = data?.ltvCacRatio ?? 0;
  const paybackPeriod = data?.paybackPeriod ?? 0;
  const arpu = data?.averageRevenuePerClient ?? 0;
  const churnRate = data?.churnRate ?? 0;
  const retentionRate = data?.retentionRate ?? 0;
  const monthlyData = Array.isArray(data?.monthlyData) ? data.monthlyData : [];

  // First year contract value approximation
  const firstYearValue = arpu * 12;
  const cacStatus = getCACStatus(cac, firstYearValue);

  // Gross margin estimate (LTV = ARPU * Gross Margin / Churn)
  // Solve for gross margin: GM = LTV * Churn / ARPU
  const grossMargin = arpu > 0 && churnRate > 0 ? (ltv * churnRate) / arpu : 0.7;

  // Custom CAC from S&M input
  const handleSMUpdate = () => {
    const spend = parseFloat(smSpend);
    if (!isNaN(spend) && spend > 0 && monthlyData.length > 0) {
      // Use last month's new customers estimate
      // (difference in cumulative, or fallback to simple calculation)
      const newCustomersEstimate = Math.max(1, Math.round(cac > 0 ? spend / cac : 5));
      setCustomCAC(spend / newCustomersEstimate);
    }
  };

  const displayCAC = customCAC ?? cac;

  // Sparkline data
  const cacTrend = monthlyData.map((m) => m.cac);
  const ltvTrend = monthlyData.map((m) => m.ltv);

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
            Unit Economics
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Customer value analysis and acquisition efficiency
          </p>
        </div>
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

      {/* ── Key Metrics Row ──────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<DollarSign />}
          label="CAC"
          value={displayCAC}
          prefix="$"
          health={cacStatus}
          sparklineData={cacTrend}
          delay={0.1}
        />
        <MetricCard
          icon={<Heart />}
          label="Lifetime Value"
          value={ltv}
          prefix="$"
          health="good"
          sparklineData={ltvTrend}
          delay={0.2}
        />
        <MetricCard
          icon={<Ratio />}
          label="LTV:CAC Ratio"
          value={ltvCacRatio}
          suffix="x"
          health={getLTVCACStatus(ltvCacRatio)}
          decimals={1}
          delay={0.3}
        />
        <MetricCard
          icon={<Timer />}
          label="CAC Payback"
          value={paybackPeriod}
          suffix=" mo"
          health={getPaybackStatus(paybackPeriod)}
          decimals={1}
          delay={0.4}
        />
      </motion.div>

      {/* ── CAC + LTV Big Numbers ────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CAC */}
        <HudPanel title="Customer Acquisition Cost" delay={0.3}>
          <div className="text-center py-4">
            <AnimatedNumber
              value={displayCAC}
              prefix="$"
              duration={1.8}
              className="text-4xl font-bold text-white"
            />
            <div className="mt-3">
              <GlowBadge
                status={cacStatus}
                label={
                  cacStatus === 'good'
                    ? 'Efficient'
                    : cacStatus === 'warning'
                      ? 'Moderate'
                      : 'High'
                }
                value={`${((displayCAC / Math.max(firstYearValue, 1)) * 100).toFixed(0)}% of 1st yr`}
              />
            </div>
            <p className="text-xs text-white/30 mt-3">
              Benchmark: &lt; 25% of first-year contract value ({formatCurrency(firstYearValue * 0.25, { compact: true })})
            </p>
          </div>
        </HudPanel>

        {/* LTV:CAC Gauge */}
        <HudPanel title="LTV:CAC Ratio" delay={0.4}>
          <div className="flex flex-col items-center py-2">
            <LTVCACGauge ratio={ltvCacRatio} />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.3 }}
              className="mt-2"
            >
              <GlowBadge
                status={getLTVCACStatus(ltvCacRatio)}
                label={
                  ltvCacRatio >= 3 && ltvCacRatio <= 5
                    ? 'Optimal'
                    : ltvCacRatio > 7
                      ? 'Under-investing'
                      : ltvCacRatio >= 2
                        ? 'Improving'
                        : 'Needs Work'
                }
              />
            </motion.div>
          </div>
        </HudPanel>

        {/* LTV */}
        <HudPanel title="Lifetime Value" delay={0.5}>
          <div className="text-center py-4">
            <AnimatedNumber
              value={ltv}
              prefix="$"
              duration={1.8}
              className="text-4xl font-bold text-white"
            />
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/40">ARPU</span>
                <span className="font-mono text-white/70">{formatCurrency(arpu)}/mo</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/40">Gross Margin</span>
                <span className="font-mono text-white/70">{formatPercent(grossMargin)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/40">Monthly Churn</span>
                <span className="font-mono text-white/70">{formatPercent(churnRate)}</span>
              </div>
              <div className="border-t border-jarvis-border pt-2 flex items-center justify-between text-xs">
                <span className="text-white/50 font-medium">LTV Formula</span>
                <span className="font-mono text-jarvis-blue text-[11px]">
                  ARPU x GM / Churn
                </span>
              </div>
            </div>
          </div>
        </HudPanel>
      </motion.div>

      {/* ── CAC Payback ──────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp}>
        <HudPanel title="CAC Payback Period" delay={0.5}>
          <div className="flex flex-col sm:flex-row items-center gap-8 py-4">
            <div className="text-center sm:text-left">
              <div className="flex items-baseline gap-2">
                <AnimatedNumber
                  value={paybackPeriod}
                  decimals={1}
                  duration={1.5}
                  className="text-5xl font-bold text-white"
                />
                <span className="text-xl text-white/30 font-mono">months</span>
              </div>
              <div className="mt-3">
                <GlowBadge
                  status={getPaybackStatus(paybackPeriod)}
                  label={
                    paybackPeriod < 12
                      ? 'Within Target'
                      : paybackPeriod < 18
                        ? 'Above Target'
                        : 'Exceeds Target'
                  }
                  value={`Target < 12 mo`}
                />
              </div>
            </div>
            {/* Visual bar */}
            <div className="flex-1 w-full max-w-md">
              <div className="relative h-4 bg-[#1A2035] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((paybackPeriod / 24) * 100, 100)}%` }}
                  transition={{ duration: 1.2, delay: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, #00FF88, ${paybackPeriod < 12 ? '#00FF88' : paybackPeriod < 18 ? '#FFB800' : '#FF3B3B'})`,
                    boxShadow: `0 0 12px ${paybackPeriod < 12 ? '#00FF8840' : paybackPeriod < 18 ? '#FFB80040' : '#FF3B3B40'}`,
                  }}
                />
                {/* 12-month marker */}
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" />
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-white/30 font-mono">
                  12 mo
                </div>
              </div>
            </div>
          </div>
        </HudPanel>
      </motion.div>

      {/* ── Visual Formula Display ───────────────────────────────────────── */}
      <motion.div variants={fadeUp}>
        <HudPanel title="Calculation Breakdown" delay={0.6}>
          <div className="space-y-6 py-2">
            {/* CAC Formula */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-3 bg-jarvis-blue rounded-full" />
                <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  Customer Acquisition Cost
                </span>
              </div>
              <FormulaCard
                items={[
                  { label: 'Total S&M Spend', value: formatCurrency(displayCAC * 10, { compact: true }) },
                  { label: 'New Customers', value: '10' },
                  { label: 'CAC', value: formatCurrency(displayCAC) },
                ]}
                result={formatCurrency(displayCAC)}
                resultLabel="CAC"
                delay={0.7}
              />
            </div>

            {/* LTV Formula */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-3 bg-jarvis-green rounded-full" />
                <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  Lifetime Value
                </span>
              </div>
              <FormulaCard
                items={[
                  { label: 'ARPU', value: `${formatCurrency(arpu)}/mo` },
                  { label: 'Gross Margin', value: formatPercent(grossMargin) },
                  { label: 'Monthly Churn', value: formatPercent(churnRate) },
                ]}
                result={formatCurrency(ltv)}
                resultLabel="LTV"
                delay={0.8}
              />
            </div>

            {/* Ratio Formula */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-3 bg-jarvis-gold rounded-full" />
                <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  LTV:CAC Ratio
                </span>
              </div>
              <FormulaCard
                items={[
                  { label: 'LTV', value: formatCurrency(ltv) },
                  { label: 'CAC', value: formatCurrency(displayCAC) },
                  { label: 'Ratio', value: `${ltvCacRatio.toFixed(1)}x` },
                ]}
                result={`${ltvCacRatio.toFixed(1)}x`}
                resultLabel="LTV:CAC"
                delay={0.9}
              />
            </div>
          </div>
        </HudPanel>
      </motion.div>

      {/* ── S&M Spend Input ──────────────────────────────────────────────── */}
      <motion.div variants={fadeUp}>
        <HudPanel title="Sales & Marketing Spend" delay={0.65}>
          <div className="flex flex-col sm:flex-row items-end gap-4">
            <div className="flex-1 w-full">
              <Input
                label="Total S&M Spend (Monthly)"
                type="number"
                placeholder="Enter total sales & marketing spend..."
                value={smSpend}
                onChange={(e) => setSmSpend(e.target.value)}
                icon={<Megaphone className="w-4 h-4" />}
                className="font-mono"
              />
            </div>
            <Button
              onClick={handleSMUpdate}
              disabled={!smSpend || isNaN(parseFloat(smSpend))}
              icon={<Target className="w-4 h-4" />}
            >
              Calculate CAC
            </Button>
          </div>
          {customCAC !== null && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-center gap-3"
            >
              <Info className="w-4 h-4 text-jarvis-blue/60" />
              <span className="text-xs text-white/40">
                Custom CAC based on your S&M spend:{' '}
                <span className="text-jarvis-blue font-mono font-semibold">{formatCurrency(customCAC)}</span>
              </span>
              <button
                onClick={() => setCustomCAC(null)}
                className="text-xs text-white/30 hover:text-white/60 transition-colors underline"
              >
                Reset
              </button>
            </motion.div>
          )}
        </HudPanel>
      </motion.div>

      {/* ── Trend Charts ─────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CAC Trend */}
        <HudPanel title="CAC Over Time" delay={0.7}>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.8 }}
          >
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthlyData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
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
                  tickFormatter={(v: number) => `$${v}`}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="cac"
                  name="CAC"
                  stroke="#FFB800"
                  strokeWidth={2.5}
                  dot={{ fill: '#FFB800', stroke: '#0D1321', strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5, fill: '#FFB800', stroke: '#0D1321', strokeWidth: 2 }}
                  animationDuration={1200}
                />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        </HudPanel>

        {/* LTV Trend */}
        <HudPanel title="LTV Over Time" delay={0.8}>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.9 }}
          >
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthlyData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
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
                  dataKey="ltv"
                  name="LTV"
                  stroke="#00FF88"
                  strokeWidth={2.5}
                  dot={{ fill: '#00FF88', stroke: '#0D1321', strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5, fill: '#00FF88', stroke: '#0D1321', strokeWidth: 2 }}
                  animationDuration={1200}
                />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        </HudPanel>
      </motion.div>

      {/* ── Benchmark Reference Panel ────────────────────────────────────── */}
      <motion.div variants={fadeUp}>
        <HudPanel title="Benchmark Reference" delay={0.9}>
          <div className="divide-y-0">
            <BenchmarkItem
              label="Customer Acquisition Cost"
              target={`< ${formatCurrency(firstYearValue * 0.25, { compact: true })} (25% of 1st yr)`}
              current={formatCurrency(displayCAC)}
              status={cacStatus}
            />
            <BenchmarkItem
              label="LTV:CAC Ratio"
              target="3x - 5x"
              current={`${ltvCacRatio.toFixed(1)}x`}
              status={getLTVCACStatus(ltvCacRatio)}
            />
            <BenchmarkItem
              label="CAC Payback Period"
              target="< 12 months"
              current={`${paybackPeriod.toFixed(1)} mo`}
              status={getPaybackStatus(paybackPeriod)}
            />
            <BenchmarkItem
              label="Monthly Churn Rate"
              target="< 5%"
              current={formatPercent(churnRate)}
              status={churnRate < 0.05 ? 'good' : churnRate < 0.1 ? 'warning' : 'danger'}
            />
            <BenchmarkItem
              label="Retention Rate"
              target="> 90%"
              current={formatPercent(retentionRate)}
              status={retentionRate > 0.9 ? 'good' : retentionRate > 0.8 ? 'warning' : 'danger'}
            />
            <BenchmarkItem
              label="Gross Margin"
              target="> 70%"
              current={formatPercent(grossMargin)}
              status={grossMargin > 0.7 ? 'good' : grossMargin > 0.5 ? 'warning' : 'danger'}
            />
          </div>
        </HudPanel>
      </motion.div>
    </motion.div>
  );
}
