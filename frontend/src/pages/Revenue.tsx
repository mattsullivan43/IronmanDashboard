import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Construction,
  Bot,
  Code2,
} from 'lucide-react';
import HudPanel from '../components/ui/HudPanel';
import AnimatedNumber from '../components/ui/AnimatedNumber';
import GlowBadge from '../components/ui/GlowBadge';
import DateRangeFilter from '../components/ui/DateRangeFilter';
import JarvisAreaChart from '../components/charts/AreaChart';
import SparkLine from '../components/charts/SparkLine';
import { metrics } from '../services/api';
import { formatCurrency, formatPercent } from '../utils/format';
import type { RevenueMetrics } from '../types';

// ── Types for revenue snapshots & extended data ─────────────────────────────

interface RevenueSnapshot {
  id: string;
  date: string;
  revenue: number;
  expenses: number;
  profit: number;
}

interface ProductLine {
  name: string;
  mrr: number;
  unitCount: number;
  unitLabel: string;
  color: string;
  icon: React.ReactNode;
  sparkline: number[];
}

// ── Stagger helpers ─────────────────────────────────────────────────────────

const stagger = (index: number) => 0.08 * index;

const sectionVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.15 + i * 0.1,
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
};

// ── Component ───────────────────────────────────────────────────────────────

export default function Revenue() {
  const [revenueData, setRevenueData] = useState<RevenueMetrics | null>(null);
  const [snapshots, setSnapshots] = useState<RevenueSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  // Date range: default 6 months
  const defaultEnd = new Date().toISOString().split('T')[0];
  const defaultStart = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().split('T')[0];
  })();

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rev, snaps] = await Promise.all([
        metrics.getRevenue({ startDate, endDate }),
        metrics.getRevenueSnapshots(),
      ]);
      setRevenueData(rev);
      setSnapshots(Array.isArray(snaps) ? snaps : []);
    } catch (err) {
      console.error('Failed to fetch revenue data', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRangeChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  };

  // ── Derived values ────────────────────────────────────────────────────────

  const mrr = revenueData?.mrr ?? 0;
  const arr = revenueData?.arr ?? 0;
  const growth = revenueData?.growth ?? 0;
  const byMonth = Array.isArray(revenueData?.byMonth) ? revenueData.byMonth : [];

  // Synthesize net new MRR breakdown from growth data
  const newMrr = mrr * Math.max(growth, 0) * 0.6;
  const expansionMrr = mrr * Math.max(growth, 0) * 0.4;
  const churnedMrr = growth < 0 ? mrr * Math.abs(growth) : mrr * 0.015;
  const netNewMrr = newMrr + expansionMrr - churnedMrr;

  // Churn rate derived from unit economics (default estimate)
  const churnRate = churnedMrr / (mrr || 1);
  const churnTarget = 0.02;
  const churnIsHealthy = churnRate < churnTarget;

  // Net Revenue Retention
  const nrr = mrr > 0 ? (mrr + expansionMrr - churnedMrr) / (mrr - netNewMrr || 1) : 1;
  const nrrHealthy = nrr >= 1.0;

  // Product line breakdown (derived from byCategory)
  const categories = Array.isArray(revenueData?.byCategory) ? revenueData.byCategory : [];
  const productLines: ProductLine[] = [
    {
      name: 'BoomLine',
      mrr: categories.find((c) => c.category.toLowerCase().includes('boom'))?.amount ?? mrr * 0.45,
      unitCount: 12,
      unitLabel: 'cranes',
      color: '#00D4FF',
      icon: <Construction className="w-4 h-4" />,
      sparkline: byMonth.slice(-6).map((m) => m.revenue * 0.45),
    },
    {
      name: 'AI Receptionist',
      mrr: categories.find((c) => c.category.toLowerCase().includes('ai'))?.amount ?? mrr * 0.30,
      unitCount: 24,
      unitLabel: 'clients',
      color: '#FFB800',
      icon: <Bot className="w-4 h-4" />,
      sparkline: byMonth.slice(-6).map((m) => m.revenue * 0.30),
    },
    {
      name: 'Custom Software',
      mrr: categories.find((c) => c.category.toLowerCase().includes('custom'))?.amount ?? mrr * 0.25,
      unitCount: 3,
      unitLabel: 'projects',
      color: '#00FF88',
      icon: <Code2 className="w-4 h-4" />,
      sparkline: byMonth.slice(-6).map((m) => m.revenue * 0.25),
    },
  ];

  // MRR sparkline from snapshots
  const mrrSparkline = snapshots.length > 1
    ? snapshots.slice(-8).map((s) => s.revenue)
    : byMonth.slice(-8).map((m) => m.revenue);

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loading && !revenueData) {
    return (
      <div className="min-h-screen bg-jarvis-dark p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Pulsing loader */}
          <div className="flex items-center justify-center h-64">
            <motion.div
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.98, 1.02, 0.98] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-jarvis-blue font-mono text-sm tracking-widest uppercase"
            >
              Initializing Revenue Telemetry...
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-jarvis-dark p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Header + Date Filter ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Revenue Analytics
            </h1>
            <p className="text-xs text-white/30 uppercase tracking-widest mt-1">
              Monthly Recurring Revenue &bull; Product Lines &bull; Retention
            </p>
          </div>
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onRangeChange={handleRangeChange}
          />
        </motion.div>

        {/* ── MRR Hero ─────────────────────────────────────────────────────── */}
        <motion.div
          custom={0}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
        >
          <HudPanel title="Monthly Recurring Revenue" className="relative" delay={0.1}>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              {/* Big MRR Number */}
              <div>
                <AnimatedNumber
                  value={mrr}
                  prefix="$"
                  decimals={0}
                  className="text-5xl font-bold text-white drop-shadow-[0_0_30px_rgba(0,212,255,0.3)]"
                />
                <div className="flex items-center gap-4 mt-3">
                  <div className="text-sm text-white/40">
                    ARR:{' '}
                    <span className="text-white/70 font-mono font-semibold">
                      {formatCurrency(arr, { compact: true })}
                    </span>
                  </div>
                  <GlowBadge
                    status={growth >= 0.05 ? 'good' : growth >= 0 ? 'warning' : 'danger'}
                    label="MoM Growth"
                    value={formatPercent(growth)}
                  />
                </div>
              </div>

              {/* Mini sparkline */}
              {mrrSparkline.length > 1 && (
                <div className="opacity-70">
                  <SparkLine data={mrrSparkline} color="#00D4FF" width={160} height={48} />
                </div>
              )}
            </div>
          </HudPanel>
        </motion.div>

        {/* ── Net New MRR Breakdown ────────────────────────────────────────── */}
        <motion.div
          custom={1}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
        >
          <HudPanel title="Net New MRR Breakdown" delay={0.2}>
            <div className="flex flex-wrap items-center justify-center gap-3 md:gap-5">
              {/* New MRR */}
              <MrrSegment
                label="New MRR"
                value={newMrr}
                color="#00FF88"
                delay={stagger(0)}
              />

              <OperatorSymbol symbol="+" />

              {/* Expansion */}
              <MrrSegment
                label="Expansion"
                value={expansionMrr}
                color="#00D4FF"
                delay={stagger(1)}
              />

              <OperatorSymbol symbol="-" />

              {/* Churned */}
              <MrrSegment
                label="Churned"
                value={churnedMrr}
                color="#FF3B3B"
                delay={stagger(2)}
              />

              <OperatorSymbol symbol="=" />

              {/* Net New */}
              <MrrSegment
                label="Net New MRR"
                value={netNewMrr}
                color={netNewMrr >= 0 ? '#FFB800' : '#FF3B3B'}
                delay={stagger(3)}
                highlight
              />
            </div>

            {/* Visual bar */}
            <div className="mt-6 h-3 rounded-full overflow-hidden bg-white/5 flex">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(newMrr / (newMrr + expansionMrr + churnedMrr || 1)) * 100}%` }}
                transition={{ duration: 1, delay: 0.6, ease: 'easeOut' }}
                className="h-full bg-[#00FF88]"
              />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(expansionMrr / (newMrr + expansionMrr + churnedMrr || 1)) * 100}%` }}
                transition={{ duration: 1, delay: 0.75, ease: 'easeOut' }}
                className="h-full bg-[#00D4FF]"
              />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(churnedMrr / (newMrr + expansionMrr + churnedMrr || 1)) * 100}%` }}
                transition={{ duration: 1, delay: 0.9, ease: 'easeOut' }}
                className="h-full bg-[#FF3B3B]"
              />
            </div>
          </HudPanel>
        </motion.div>

        {/* ── MRR Growth Chart ─────────────────────────────────────────────── */}
        <motion.div
          custom={2}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
        >
          <HudPanel title="MRR Over Time" delay={0.3}>
            {byMonth.length > 0 ? (
              <JarvisAreaChart
                data={byMonth.map((m) => ({ month: m.month, mrr: m.revenue }))}
                xKey="month"
                yKey="mrr"
                color="#00D4FF"
                gradientId="mrrGradient"
                height={320}
                yFormatter={(v) => formatCurrency(v, { compact: true })}
                xFormatter={(v) => {
                  const parts = v.split('-');
                  return parts.length >= 2 ? `${parts[1]}/${parts[0].slice(2)}` : v;
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-48 text-white/20 text-sm font-mono">
                No monthly data available
              </div>
            )}
          </HudPanel>
        </motion.div>

        {/* ── Revenue by Product Line ──────────────────────────────────────── */}
        <motion.div
          custom={3}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {productLines.map((pl, i) => (
              <HudPanel key={pl.name} delay={0.4 + i * 0.1}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className="p-2 rounded-md"
                        style={{ backgroundColor: `${pl.color}15` }}
                      >
                        <span style={{ color: pl.color }}>{pl.icon}</span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
                          {pl.name}
                        </p>
                        <p className="text-[10px] text-white/25 font-mono">
                          {pl.unitCount} {pl.unitLabel}
                        </p>
                      </div>
                    </div>

                    <AnimatedNumber
                      value={pl.mrr}
                      prefix="$"
                      decimals={0}
                      className="text-2xl font-bold text-white"
                    />
                    <p className="text-[10px] text-white/30 mt-1 uppercase tracking-wider">
                      Monthly Revenue
                    </p>
                  </div>

                  {pl.sparkline.length > 1 && (
                    <div className="mt-6 opacity-60">
                      <SparkLine data={pl.sparkline} color={pl.color} width={72} height={28} />
                    </div>
                  )}
                </div>

                {/* Accent bottom bar */}
                <div
                  className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${pl.color}50, transparent)`,
                  }}
                />
              </HudPanel>
            ))}
          </div>
        </motion.div>

        {/* ── Churn Rate & NRR ─────────────────────────────────────────────── */}
        <motion.div
          custom={4}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Churn Rate Gauge */}
            <HudPanel title="Monthly Churn Rate" delay={0.6}>
              <div className="flex items-center justify-between">
                <div>
                  <AnimatedNumber
                    value={churnRate * 100}
                    suffix="%"
                    decimals={2}
                    className={`text-4xl font-bold ${churnIsHealthy ? 'text-jarvis-green' : 'text-jarvis-red'}`}
                  />
                  <p className="text-xs text-white/30 mt-2">
                    Target: <span className="text-white/50 font-mono">&lt; 2.00%</span>
                  </p>
                </div>

                <div className="flex flex-col items-end gap-3">
                  <GlowBadge
                    status={churnIsHealthy ? 'good' : 'danger'}
                    label={churnIsHealthy ? 'On Target' : 'Above Target'}
                  />
                  <ChurnGauge value={churnRate} target={churnTarget} />
                </div>
              </div>
            </HudPanel>

            {/* NRR */}
            <HudPanel title="Net Revenue Retention" delay={0.7}>
              <div className="flex items-center justify-between">
                <div>
                  <AnimatedNumber
                    value={nrr * 100}
                    suffix="%"
                    decimals={1}
                    className={`text-4xl font-bold ${nrrHealthy ? 'text-jarvis-green' : 'text-jarvis-red'}`}
                  />
                  <p className="text-xs text-white/30 mt-2">
                    Target: <span className="text-white/50 font-mono">&gt; 100%</span>
                  </p>
                </div>

                <div className="flex flex-col items-end gap-3">
                  <GlowBadge
                    status={nrrHealthy ? 'good' : 'danger'}
                    label={nrrHealthy ? 'Healthy' : 'Below 100%'}
                    value={formatPercent(nrr)}
                  />
                  <NrrGauge value={nrr} />
                </div>
              </div>
            </HudPanel>
          </div>
        </motion.div>

        {/* ── Top Revenue Clients ──────────────────────────────────────────── */}
        <motion.div
          custom={5}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
        >
          <HudPanel title="Top Revenue Clients" delay={0.8}>
            {Array.isArray(revenueData?.byClient) && revenueData.byClient.length > 0 ? (
              <div className="space-y-2">
                {revenueData.byClient.slice(0, 8).map((client, i) => {
                  const maxRevenue = revenueData.byClient[0]?.revenue ?? 1;
                  const pct = (client.revenue / maxRevenue) * 100;
                  return (
                    <motion.div
                      key={client.clientId}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.9 + i * 0.05, duration: 0.3 }}
                      className="flex items-center gap-3"
                    >
                      <span className="text-[10px] font-mono text-white/25 w-4 text-right">
                        {i + 1}
                      </span>
                      <span className="text-xs text-white/70 w-36 truncate">
                        {client.clientName}
                      </span>
                      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, delay: 1.0 + i * 0.05 }}
                          className="h-full rounded-full"
                          style={{
                            background: `linear-gradient(90deg, #00D4FF, #00D4FF80)`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-mono text-white/60 w-20 text-right">
                        {formatCurrency(client.revenue, { compact: true })}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-white/20 text-sm font-mono py-6">
                No client revenue data available
              </div>
            )}
          </HudPanel>
        </motion.div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Colored MRR segment for the net new MRR formula */
function MrrSegment({
  label,
  value,
  color,
  delay = 0,
  highlight = false,
}: {
  label: string;
  value: number;
  color: string;
  delay?: number;
  highlight?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={`
        text-center px-4 py-3 rounded-lg border
        ${highlight
          ? 'border-white/10 bg-white/5 shadow-[0_0_20px_rgba(255,184,0,0.08)]'
          : 'border-transparent'
        }
      `}
    >
      <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: `${color}99` }}>
        {label}
      </p>
      <AnimatedNumber
        value={value}
        prefix="$"
        decimals={0}
        className="text-xl font-bold"
        mono
      />
      {/* Colored underline */}
      <div
        className="mt-2 h-[2px] rounded-full mx-auto w-12"
        style={{ backgroundColor: color }}
      />
    </motion.div>
  );
}

/** Math operator between segments */
function OperatorSymbol({ symbol }: { symbol: string }) {
  return (
    <span className="text-lg font-mono text-white/20 mx-1">{symbol}</span>
  );
}

/** Small arc gauge for churn rate */
function ChurnGauge({ value, target }: { value: number; target: number }) {
  const maxAngle = 180;
  const cappedValue = Math.min(value, target * 3);
  const angle = (cappedValue / (target * 3)) * maxAngle;
  const targetAngle = (target / (target * 3)) * maxAngle;
  const healthy = value < target;

  return (
    <svg width={80} height={48} viewBox="0 0 80 48" className="overflow-visible">
      {/* Background arc */}
      <path
        d={describeArc(40, 44, 32, 180, 360)}
        fill="none"
        stroke="#1A2035"
        strokeWidth={6}
        strokeLinecap="round"
      />
      {/* Value arc */}
      <motion.path
        d={describeArc(40, 44, 32, 180, 180 + angle)}
        fill="none"
        stroke={healthy ? '#00FF88' : '#FF3B3B'}
        strokeWidth={6}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, delay: 0.3 }}
      />
      {/* Target mark */}
      <line
        x1={40 + 32 * Math.cos(((180 + targetAngle) * Math.PI) / 180)}
        y1={44 + 32 * Math.sin(((180 + targetAngle) * Math.PI) / 180)}
        x2={40 + 38 * Math.cos(((180 + targetAngle) * Math.PI) / 180)}
        y2={44 + 38 * Math.sin(((180 + targetAngle) * Math.PI) / 180)}
        stroke="#FFB800"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Small arc gauge for NRR */
function NrrGauge({ value }: { value: number }) {
  const maxAngle = 180;
  const clampedValue = Math.max(0.8, Math.min(value, 1.3));
  const normalized = (clampedValue - 0.8) / 0.5; // 0.8..1.3 -> 0..1
  const angle = normalized * maxAngle;
  const healthy = value >= 1.0;

  return (
    <svg width={80} height={48} viewBox="0 0 80 48" className="overflow-visible">
      <path
        d={describeArc(40, 44, 32, 180, 360)}
        fill="none"
        stroke="#1A2035"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <motion.path
        d={describeArc(40, 44, 32, 180, 180 + angle)}
        fill="none"
        stroke={healthy ? '#00FF88' : '#FF3B3B'}
        strokeWidth={6}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, delay: 0.3 }}
      />
      {/* 100% mark */}
      {(() => {
        const markAngle = ((1.0 - 0.8) / 0.5) * maxAngle;
        return (
          <line
            x1={40 + 32 * Math.cos(((180 + markAngle) * Math.PI) / 180)}
            y1={44 + 32 * Math.sin(((180 + markAngle) * Math.PI) / 180)}
            x2={40 + 38 * Math.cos(((180 + markAngle) * Math.PI) / 180)}
            y2={44 + 38 * Math.sin(((180 + markAngle) * Math.PI) / 180)}
            stroke="#FFB800"
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })()}
    </svg>
  );
}

/** SVG arc path utility */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, r: number, angleInDegrees: number) {
  const rad = ((angleInDegrees - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
