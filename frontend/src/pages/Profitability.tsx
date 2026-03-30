import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  PiggyBank,
  Receipt,
  BarChart3,
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';
import HudPanel from '../components/ui/HudPanel';
import AnimatedNumber from '../components/ui/AnimatedNumber';
import GlowBadge from '../components/ui/GlowBadge';
import DateRangeFilter from '../components/ui/DateRangeFilter';
import JarvisBarChart from '../components/charts/BarChart';
import JarvisPieChart from '../components/charts/PieChart';
import { metrics, transactions } from '../services/api';
import { formatCurrency } from '../utils/format';
import type { ProfitabilityMetrics } from '../types';

// ── Types ───────────────────────────────────────────────────────────────────

interface CategoryBreakdown {
  category: string;
  income: number;
  expense: number;
}

// ── Animation helpers ───────────────────────────────────────────────────────

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

const EXPENSE_COLORS = ['#00D4FF', '#FFB800', '#FF3B3B', '#00FF88', '#A855F7', '#F472B6', '#67E8F9', '#FBBF24'];

// ── Component ───────────────────────────────────────────────────────────────

export default function Profitability() {
  const [profData, setProfData] = useState<ProfitabilityMetrics | null>(null);
  const [_categoryData, setCategoryData] = useState<CategoryBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  // Date range defaults (6 months)
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
      const [prof, cats] = await Promise.all([
        metrics.getProfitability({ period: '6m' }),
        transactions.getByCategory({ startDate, endDate }),
      ]);
      setProfData(prof);
      setCategoryData(Array.isArray(cats) ? cats : []);
    } catch (err) {
      console.error('Failed to fetch profitability data', err);
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

  const grossMargin = profData?.grossMargin ?? 0;
  const netMargin = profData?.netMargin ?? 0;
  const operatingExpenses = profData?.operatingExpenses ?? 0;
  const ebitda = profData?.ebitda ?? 0;
  const byMonth = Array.isArray(profData?.byMonth) ? profData.byMonth : [];
  const expenseBreakdown = Array.isArray(profData?.expenseBreakdown) ? profData.expenseBreakdown : [];

  // Health checks
  const grossMarginHealthy = grossMargin >= 0.70;
  const grossMarginStatus = grossMargin >= 0.70 ? 'good' : grossMargin >= 0.55 ? 'warning' : 'danger';
  const netMarginStatus = netMargin >= 0.10 ? 'good' : netMargin >= 0.05 ? 'warning' : 'danger';

  // Chart data
  const revenueVsExpensesData = byMonth.map((m) => ({
    month: m.month,
    revenue: m.revenue,
    expenses: m.cogs + m.opex,
  }));

  const cogsData = expenseBreakdown.map((e) => ({
    name: e.category,
    value: e.amount,
  }));

  // Expense table: merge profData.expenseBreakdown with category data
  const totalRevenue = byMonth.reduce((sum, m) => sum + m.revenue, 0) || 1;
  const expenseTableRows = expenseBreakdown.map((e) => {
    const pctOfRevenue = e.amount / totalRevenue;
    // Calculate a pseudo-trend from monthly data
    const recentMonths = byMonth.slice(-3);
    const olderMonths = byMonth.slice(-6, -3);
    const recentAvg = recentMonths.length > 0
      ? recentMonths.reduce((s, m) => s + m.opex, 0) / recentMonths.length
      : 0;
    const olderAvg = olderMonths.length > 0
      ? olderMonths.reduce((s, m) => s + m.opex, 0) / olderMonths.length
      : recentAvg;
    const trend = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;

    return {
      category: e.category,
      amount: e.amount,
      percentage: e.percentage,
      pctOfRevenue,
      trend,
    };
  });

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading && !profData) {
    return (
      <div className="min-h-screen bg-jarvis-dark p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <motion.div
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.98, 1.02, 0.98] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-jarvis-blue font-mono text-sm tracking-widest uppercase"
            >
              Computing Profitability Matrix...
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

        {/* ── Header + Filter ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Profitability &amp; P&amp;L
            </h1>
            <p className="text-xs text-white/30 uppercase tracking-widest mt-1">
              Margins &bull; Cost Structure &bull; Monthly Income Statement
            </p>
          </div>
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onRangeChange={handleRangeChange}
          />
        </motion.div>

        {/* ── Margin Heroes ────────────────────────────────────────────────── */}
        <motion.div
          custom={0}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Gross Margin */}
            <HudPanel delay={0.1}>
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-md bg-jarvis-green/10">
                    <PiggyBank className="w-4 h-4 text-jarvis-green" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                    Gross Margin
                  </span>
                </div>
                <AnimatedNumber
                  value={grossMargin * 100}
                  suffix="%"
                  decimals={1}
                  className={`text-3xl font-bold ${grossMarginHealthy ? 'text-jarvis-green' : 'text-jarvis-red'}`}
                />
                <div className="flex items-center gap-2 mt-2">
                  <GlowBadge
                    status={grossMarginStatus as 'good' | 'warning' | 'danger'}
                    label={grossMarginHealthy ? 'On Target' : 'Below 70%'}
                  />
                </div>
                <p className="text-[10px] text-white/25 mt-2 font-mono">
                  Target: 70%+
                </p>
              </div>
            </HudPanel>

            {/* Net Profit Margin */}
            <HudPanel delay={0.15}>
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-md bg-jarvis-gold/10">
                    <TrendingUp className="w-4 h-4 text-jarvis-gold" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                    Net Profit Margin
                  </span>
                </div>
                <AnimatedNumber
                  value={netMargin * 100}
                  suffix="%"
                  decimals={1}
                  className={`text-3xl font-bold ${netMargin >= 0.10 ? 'text-jarvis-green' : netMargin >= 0.05 ? 'text-jarvis-gold' : 'text-jarvis-red'}`}
                />
                <div className="flex items-center gap-2 mt-2">
                  <GlowBadge
                    status={netMarginStatus as 'good' | 'warning' | 'danger'}
                    label={netMargin >= 0.10 ? 'Healthy' : netMargin >= 0.05 ? 'Watch' : 'Critical'}
                  />
                </div>
                <p className="text-[10px] text-white/25 mt-2 font-mono">
                  Target: 10-20%
                </p>
              </div>
            </HudPanel>

            {/* EBITDA */}
            <HudPanel delay={0.2}>
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-md bg-jarvis-blue/10">
                    <BarChart3 className="w-4 h-4 text-jarvis-blue" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                    EBITDA
                  </span>
                </div>
                <AnimatedNumber
                  value={ebitda}
                  prefix="$"
                  decimals={0}
                  className="text-3xl font-bold text-white"
                />
                <p className="text-[10px] text-white/25 mt-2 font-mono">
                  Operating Earnings
                </p>
              </div>
            </HudPanel>

            {/* Operating Expenses */}
            <HudPanel delay={0.25}>
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-md bg-jarvis-red/10">
                    <Receipt className="w-4 h-4 text-jarvis-red" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                    Operating Expenses
                  </span>
                </div>
                <AnimatedNumber
                  value={operatingExpenses}
                  prefix="$"
                  decimals={0}
                  className="text-3xl font-bold text-jarvis-red"
                />
                <p className="text-[10px] text-white/25 mt-2 font-mono">
                  Total OpEx This Period
                </p>
              </div>
            </HudPanel>
          </div>
        </motion.div>

        {/* ── Revenue vs Expenses Chart ─────────────────────────────────────── */}
        <motion.div
          custom={1}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
        >
          <HudPanel title="Revenue vs Expenses" delay={0.3}>
            {revenueVsExpensesData.length > 0 ? (
              <JarvisBarChart
                data={revenueVsExpensesData}
                xKey="month"
                bars={[
                  { dataKey: 'revenue', color: '#00D4FF', name: 'Revenue' },
                  { dataKey: 'expenses', color: '#FF3B3B', name: 'Expenses' },
                ]}
                height={320}
                yFormatter={(v) => formatCurrency(v, { compact: true })}
                xFormatter={(v) => {
                  const parts = v.split('-');
                  return parts.length >= 2 ? `${parts[1]}/${parts[0].slice(2)}` : v;
                }}
              />
            ) : (
              <EmptyState message="No monthly data available" />
            )}
          </HudPanel>
        </motion.div>

        {/* ── COGS Breakdown + Expense Categories ──────────────────────────── */}
        <motion.div
          custom={2}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* COGS Pie */}
            <HudPanel title="Cost Structure" delay={0.4}>
              {cogsData.length > 0 ? (
                <JarvisPieChart
                  data={cogsData}
                  colors={EXPENSE_COLORS}
                  height={300}
                  innerRadius={55}
                  outerRadius={95}
                  valueFormatter={(v) => formatCurrency(v, { compact: true })}
                />
              ) : (
                <EmptyState message="No expense breakdown available" />
              )}
            </HudPanel>

            {/* Expense Category Table */}
            <HudPanel title="Expense Categories" delay={0.45}>
              {expenseTableRows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-jarvis-border">
                        <th className="pb-3 text-[10px] uppercase tracking-widest text-white/30 font-semibold">
                          Category
                        </th>
                        <th className="pb-3 text-[10px] uppercase tracking-widest text-white/30 font-semibold text-right">
                          Spend
                        </th>
                        <th className="pb-3 text-[10px] uppercase tracking-widest text-white/30 font-semibold text-right">
                          % Rev
                        </th>
                        <th className="pb-3 text-[10px] uppercase tracking-widest text-white/30 font-semibold text-right">
                          Trend
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseTableRows.map((row, i) => (
                        <motion.tr
                          key={row.category}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.5 + i * 0.05, duration: 0.3 }}
                          className="border-b border-jarvis-border/40 hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }}
                              />
                              <span className="text-xs text-white/70">{row.category}</span>
                            </div>
                          </td>
                          <td className="py-3 text-right">
                            <span className="text-xs font-mono text-white/70">
                              {formatCurrency(row.amount, { compact: true })}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <span className="text-xs font-mono text-white/50">
                              {(row.pctOfRevenue * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <span className={`inline-flex items-center gap-1 text-xs font-mono ${row.trend > 0 ? 'text-jarvis-red' : 'text-jarvis-green'}`}>
                              {row.trend > 0 ? (
                                <ArrowUpRight className="w-3 h-3" />
                              ) : (
                                <ArrowDownRight className="w-3 h-3" />
                              )}
                              {Math.abs(row.trend * 100).toFixed(1)}%
                            </span>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState message="No category data available" />
              )}
            </HudPanel>
          </div>
        </motion.div>

        {/* ── Monthly P&L Summary Table ─────────────────────────────────────── */}
        <motion.div
          custom={3}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
        >
          <HudPanel title="Monthly P&L Summary" delay={0.55}>
            {byMonth.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[640px]">
                  <thead>
                    <tr className="border-b border-jarvis-border">
                      <th className="pb-3 text-[10px] uppercase tracking-widest text-white/30 font-semibold sticky left-0 bg-jarvis-card/80">
                        Line Item
                      </th>
                      {byMonth.slice(-6).map((m) => (
                        <th
                          key={m.month}
                          className="pb-3 text-[10px] uppercase tracking-widest text-white/30 font-semibold text-right font-mono"
                        >
                          {formatMonth(m.month)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Revenue */}
                    <PLRow
                      label="Revenue"
                      values={byMonth.slice(-6).map((m) => m.revenue)}
                      className="text-jarvis-blue font-semibold"
                      rowDelay={0}
                    />

                    {/* COGS */}
                    <PLRow
                      label="COGS"
                      values={byMonth.slice(-6).map((m) => m.cogs)}
                      className="text-white/50"
                      negative
                      rowDelay={1}
                    />

                    {/* Gross Profit */}
                    <PLRow
                      label="Gross Profit"
                      values={byMonth.slice(-6).map((m) => m.grossProfit)}
                      className="text-jarvis-green font-semibold"
                      isBold
                      rowDelay={2}
                    />

                    {/* Operating Expenses */}
                    <PLRow
                      label="Operating Expenses"
                      values={byMonth.slice(-6).map((m) => m.opex)}
                      className="text-white/50"
                      negative
                      rowDelay={3}
                    />

                    {/* Divider row */}
                    <tr>
                      <td
                        colSpan={byMonth.slice(-6).length + 1}
                        className="py-1"
                      >
                        <div className="h-[1px] bg-gradient-to-r from-transparent via-jarvis-blue/20 to-transparent" />
                      </td>
                    </tr>

                    {/* Net Income */}
                    <PLRow
                      label="Net Income"
                      values={byMonth.slice(-6).map((m) => m.netProfit)}
                      className="text-white font-bold"
                      isBold
                      rowDelay={4}
                    />

                    {/* Margin row */}
                    <tr className="border-t border-jarvis-border/30">
                      <td className="py-3 sticky left-0 bg-jarvis-card/80">
                        <span className="text-[10px] uppercase tracking-widest text-white/20 italic">
                          Net Margin
                        </span>
                      </td>
                      {byMonth.slice(-6).map((m) => {
                        const margin = m.revenue > 0 ? m.netProfit / m.revenue : 0;
                        return (
                          <td key={`margin-${m.month}`} className="py-3 text-right">
                            <span
                              className={`text-[11px] font-mono ${
                                margin >= 0.10
                                  ? 'text-jarvis-green'
                                  : margin >= 0
                                    ? 'text-jarvis-gold'
                                    : 'text-jarvis-red'
                              }`}
                            >
                              {(margin * 100).toFixed(1)}%
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="No monthly P&L data available" />
            )}
          </HudPanel>
        </motion.div>

        {/* ── Profit Trend Mini-bar ────────────────────────────────────────── */}
        <motion.div
          custom={4}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
        >
          <HudPanel title="Net Profit Trend" delay={0.7}>
            <div className="flex items-end gap-2 h-32">
              {byMonth.slice(-6).map((m, i) => {
                const maxProfit = Math.max(...byMonth.slice(-6).map((x) => Math.abs(x.netProfit)), 1);
                const heightPct = Math.abs(m.netProfit) / maxProfit;
                const isPositive = m.netProfit >= 0;

                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end justify-center h-24">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${heightPct * 100}%` }}
                        transition={{ duration: 0.6, delay: 0.8 + i * 0.08, ease: 'easeOut' }}
                        className={`w-full max-w-8 rounded-t-md ${
                          isPositive
                            ? 'bg-gradient-to-t from-jarvis-green/60 to-jarvis-green'
                            : 'bg-gradient-to-t from-jarvis-red/60 to-jarvis-red'
                        }`}
                        style={{
                          boxShadow: isPositive
                            ? '0 0 12px rgba(0,255,136,0.2)'
                            : '0 0 12px rgba(255,59,59,0.2)',
                        }}
                      />
                    </div>
                    <span className="text-[9px] font-mono text-white/30">
                      {formatMonth(m.month)}
                    </span>
                    <span className={`text-[10px] font-mono ${isPositive ? 'text-jarvis-green' : 'text-jarvis-red'}`}>
                      {formatCurrency(m.netProfit, { compact: true })}
                    </span>
                  </div>
                );
              })}
            </div>
          </HudPanel>
        </motion.div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PLRow({
  label,
  values,
  className = '',
  isBold = false,
  negative = false,
  rowDelay = 0,
}: {
  label: string;
  values: number[];
  className?: string;
  isBold?: boolean;
  negative?: boolean;
  rowDelay?: number;
}) {
  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.6 + rowDelay * 0.06, duration: 0.3 }}
      className={`border-b border-jarvis-border/20 ${isBold ? 'bg-white/[0.02]' : ''}`}
    >
      <td className="py-3 sticky left-0 bg-jarvis-card/80">
        <span className={`text-xs ${isBold ? 'font-semibold' : ''} ${className}`}>
          {negative ? '\u2003' : ''}{label}
        </span>
      </td>
      {values.map((val, i) => (
        <td key={i} className="py-3 text-right">
          <span className={`text-xs font-mono ${className}`}>
            {negative ? '(' : ''}{formatCurrency(Math.abs(val), { compact: true })}{negative ? ')' : ''}
          </span>
        </td>
      ))}
    </motion.tr>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-48 text-white/20 text-sm font-mono">
      {message}
    </div>
  );
}

function formatMonth(monthStr: string): string {
  const parts = monthStr.split('-');
  if (parts.length >= 2) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const idx = parseInt(parts[1], 10) - 1;
    return `${monthNames[idx] ?? parts[1]} '${parts[0].slice(2)}`;
  }
  return monthStr;
}
