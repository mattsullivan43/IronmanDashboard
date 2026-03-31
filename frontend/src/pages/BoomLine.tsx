import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Construction, DollarSign, TrendingUp, CreditCard, BarChart3 } from 'lucide-react';
import MetricCard from '../components/ui/MetricCard';
import HudPanel from '../components/ui/HudPanel';
import GlowBadge from '../components/ui/GlowBadge';
import DataTable, { Column } from '../components/ui/DataTable';
import JarvisAreaChart from '../components/charts/AreaChart';
import { metrics, clients } from '../services/api';
import { formatCurrency, formatPercent } from '../utils/format';

// ── Local types for BoomLine economics data ─────────────────────────────────

interface BoomLineEconomics {
  totalCranes: number;
  revenuePerCrane: number;
  costPerCrane: number;
  costPercentage: number;
  grossProfitPerCrane: number;
  grossMargin: number;
  totalMRR: number;
  implementationFeesCollected: number;
  implementationFeesOutstanding: number;
  cranesOverTime: Array<{ month: string; cranes: number }>;
}

interface BoomLineClient {
  id: string;
  company: string;
  craneCount: number;
  perCraneRate: number;
  monthlyRevenue: number;
  implementationFee: number;
  implementationCollected: boolean;
  margin: number;
}

// ── Stagger helpers ─────────────────────────────────────────────────────────

const stagger = {
  container: {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08 },
    },
  },
  item: {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
  },
};

// ── Health helpers ──────────────────────────────────────────────────────────

function revenueHealth(val: number): 'good' | 'warning' | 'danger' {
  if (val >= 30) return 'good';
  if (val >= 20) return 'warning';
  return 'danger';
}

function marginHealth(val: number): 'good' | 'warning' | 'danger' {
  if (val >= 0.8) return 'good';
  if (val >= 0.6) return 'warning';
  return 'danger';
}

function costHealth(pct: number): 'good' | 'warning' | 'danger' {
  if (pct <= 0.2) return 'good';
  if (pct <= 0.35) return 'warning';
  return 'danger';
}

// ── Component ───────────────────────────────────────────────────────────────

export default function BoomLine() {
  const [data, setData] = useState<BoomLineEconomics | null>(null);
  const [clientData, setClientData] = useState<BoomLineClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [metricsRes, clientsRes] = await Promise.all([
          metrics.getBoomLine(),
          clients.list({ status: 'active' }),
        ]);

        // Map API response (snake_case) to component shape (camelCase)
        const r = metricsRes as any;
        const totals = r?.totals ?? r ?? {};
        const apiClients = Array.isArray(r?.clients) ? r.clients : [];
        const revPerCrane = parseFloat(totals.rev_per_crane ?? totals.revenuePerCrane ?? 0);
        const costPerCrane = parseFloat(totals.cost_per_crane ?? totals.costPerCrane ?? 0);
        const totalRev = parseFloat(totals.total_monthly_revenue ?? totals.totalMRR ?? 0);

        setData({
          totalCranes: totals.total_cranes ?? totals.totalCranes ?? 0,
          revenuePerCrane: revPerCrane,
          costPerCrane: costPerCrane,
          costPercentage: revPerCrane > 0 ? costPerCrane / revPerCrane : 0,
          grossProfitPerCrane: parseFloat(totals.margin_per_crane ?? totals.grossProfitPerCrane ?? (revPerCrane - costPerCrane)),
          grossMargin: totalRev > 0 ? (totalRev - parseFloat(totals.total_monthly_cogs ?? 0)) / totalRev : 0,
          totalMRR: totalRev,
          implementationFeesCollected: apiClients.filter((c: any) => c.implementation_fee_collected).reduce((s: number, c: any) => s + parseFloat(c.implementation_fee ?? 0), 0),
          implementationFeesOutstanding: apiClients.filter((c: any) => !c.implementation_fee_collected).reduce((s: number, c: any) => s + parseFloat(c.implementation_fee ?? 0), 0),
          cranesOverTime: Array.isArray(r?.history) ? r.history.map((h: any) => ({ month: h.month, cranes: h.crane_count ?? 0 })) : [],
        });

        // Map client data
        const allClients = Array.isArray(clientsRes?.data) ? clientsRes.data : Array.isArray(clientsRes) ? clientsRes : [];
        const boomlineClients = (allClients as any[]).filter((c: any) => c.product_line === 'boomline');
        setClientData(boomlineClients.map((c: any) => ({
          id: c.id,
          company: c.company_name,
          craneCount: c.crane_count ?? 0,
          perCraneRate: parseFloat(c.per_crane_rate ?? 0),
          monthlyRevenue: parseFloat(c.monthly_revenue ?? 0),
          implementationFee: parseFloat(c.implementation_fee ?? 0),
          implementationCollected: !!c.implementation_fee_collected,
          margin: parseFloat(c.monthly_revenue ?? 0) > 0 ? (parseFloat(c.monthly_revenue ?? 0) - parseFloat(c.cogs_monthly ?? 0)) / parseFloat(c.monthly_revenue ?? 0) : 0,
        })));
      } catch (err) {
        console.error('Failed to load BoomLine data', err);
        // No fallback data — show empty state when API is unavailable
        setData({
          totalCranes: 0,
          revenuePerCrane: 0,
          costPerCrane: 0,
          costPercentage: 0,
          grossProfitPerCrane: 0,
          grossMargin: 0,
          totalMRR: 0,
          implementationFeesCollected: 0,
          implementationFeesOutstanding: 0,
          cranesOverTime: [],
        });
        setClientData([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
          className="w-8 h-8 border-2 border-[#00D4FF] border-t-transparent rounded-full"
        />
      </div>
    );
  }

  // ── Table columns ─────────────────────────────────────────────────────────

  const columns: Column<BoomLineClient>[] = [
    {
      key: 'company',
      header: 'Company',
      render: (row) => (
        <span className="text-white font-medium">{row.company}</span>
      ),
    },
    {
      key: 'craneCount',
      header: 'Cranes',
      align: 'right',
      render: (row) => (
        <span className="text-[#00D4FF]">{row.craneCount}</span>
      ),
    },
    {
      key: 'perCraneRate',
      header: '$/Crane',
      align: 'right',
      render: (row) => formatCurrency(row.perCraneRate),
    },
    {
      key: 'monthlyRevenue',
      header: 'Monthly Revenue',
      align: 'right',
      render: (row) => (
        <span className="text-[#00FF88]">{formatCurrency(row.monthlyRevenue)}</span>
      ),
    },
    {
      key: 'implementationFee',
      header: 'Impl. Fee',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <span>{formatCurrency(row.implementationFee)}</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
              row.implementationCollected
                ? 'bg-[#00FF88]/10 text-[#00FF88]'
                : 'bg-[#FFB800]/10 text-[#FFB800]'
            }`}
          >
            {row.implementationCollected ? 'Paid' : 'Due'}
          </span>
        </div>
      ),
    },
    {
      key: 'margin',
      header: 'Margin',
      align: 'right',
      render: (row) => {
        const status = marginHealth(row.margin);
        const color =
          status === 'good' ? '#00FF88' : status === 'warning' ? '#FFB800' : '#FF3B3B';
        return <span style={{ color }}>{formatPercent(row.margin)}</span>;
      },
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-3"
      >
        <div className="p-2.5 rounded-lg bg-[#FFB800]/10">
          <Construction className="w-6 h-6 text-[#FFB800]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white text-glow-blue">BoomLine Crane Economics</h1>
          <p className="text-sm text-white/40 mt-0.5">
            Per-crane unit economics and client breakdown
          </p>
        </div>
      </motion.div>

      {/* Top metric cards */}
      <motion.div
        variants={stagger.container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <motion.div variants={stagger.item}>
          <MetricCard
            icon={<Construction className="w-4 h-4" />}
            label="Total Cranes on Platform"
            value={data.totalCranes}
            health="neutral"
            delay={0}
          />
        </motion.div>

        <motion.div variants={stagger.item}>
          <div className="relative">
            <MetricCard
              icon={<DollarSign className="w-4 h-4" />}
              label="Revenue Per Crane"
              value={data.revenuePerCrane}
              prefix="$"
              suffix="/mo"
              decimals={2}
              health={revenueHealth(data.revenuePerCrane)}
              delay={0.08}
            />
            <div className="absolute top-3 right-3">
              <GlowBadge
                status={revenueHealth(data.revenuePerCrane)}
                label={data.revenuePerCrane >= 30 ? 'On Target' : 'Below Target'}
              />
            </div>
          </div>
        </motion.div>

        <motion.div variants={stagger.item}>
          <MetricCard
            icon={<CreditCard className="w-4 h-4" />}
            label="Cost Per Crane"
            value={data.costPerCrane}
            prefix="$"
            decimals={2}
            health={costHealth(data.costPercentage)}
            delay={0.16}
          />
          <div className="mt-2 flex items-center justify-between px-1">
            <span className="text-xs text-white/40">% of Revenue</span>
            <GlowBadge
              status={costHealth(data.costPercentage)}
              label={formatPercent(data.costPercentage)}
              value={data.costPercentage <= 0.2 ? '< 20% target' : '> 20% target'}
            />
          </div>
        </motion.div>

        <motion.div variants={stagger.item}>
          <div className="relative">
            <MetricCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Gross Profit / Crane"
              value={data.grossProfitPerCrane}
              prefix="$"
              decimals={2}
              health={marginHealth(data.grossMargin)}
              delay={0.24}
            />
            <div className="absolute top-3 right-3">
              <GlowBadge
                status={marginHealth(data.grossMargin)}
                label={formatPercent(data.grossMargin) + ' margin'}
              />
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* MRR + Implementation fees row */}
      <motion.div
        variants={stagger.container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        <motion.div variants={stagger.item}>
          <MetricCard
            icon={<BarChart3 className="w-4 h-4" />}
            label="Total BoomLine MRR"
            value={data.totalMRR}
            prefix="$"
            health="good"
            delay={0.32}
          />
        </motion.div>

        <motion.div variants={stagger.item}>
          <MetricCard
            icon={<DollarSign className="w-4 h-4" />}
            label="Impl. Fees Collected"
            value={data.implementationFeesCollected}
            prefix="$"
            health="good"
            delay={0.4}
          />
        </motion.div>

        <motion.div variants={stagger.item}>
          <MetricCard
            icon={<DollarSign className="w-4 h-4" />}
            label="Impl. Fees Outstanding"
            value={data.implementationFeesOutstanding}
            prefix="$"
            health={data.implementationFeesOutstanding > 0 ? 'warning' : 'good'}
            delay={0.48}
          />
        </motion.div>
      </motion.div>

      {/* Cranes Over Time chart */}
      <HudPanel title="Cranes Over Time" delay={0.5}>
        <JarvisAreaChart
          data={(data.cranesOverTime ?? []) as unknown as Array<Record<string, unknown>>}
          xKey="month"
          yKey="cranes"
          color="#FFB800"
          gradientId="craneGrowth"
          height={280}
          yFormatter={(v) => `${v}`}
        />
      </HudPanel>

      {/* Per-Client Breakdown Table */}
      <HudPanel title="Per-Client Breakdown" delay={0.6}>
        <DataTable
          columns={columns}
          data={clientData}
          keyExtractor={(row) => row.id}
          emptyMessage="No BoomLine clients found"
        />
        {/* Table footer summary */}
        {clientData.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-4 pt-4 border-t border-[#1A2035] flex items-center justify-between text-xs text-white/40"
          >
            <span>
              {clientData.length} client{clientData.length !== 1 ? 's' : ''} |{' '}
              <span className="text-[#00D4FF]">
                {clientData.reduce((s, c) => s + c.craneCount, 0)} total cranes
              </span>
            </span>
            <span>
              Total MRR:{' '}
              <span className="text-[#00FF88] font-['JetBrains_Mono',monospace]">
                {formatCurrency(clientData.reduce((s, c) => s + c.monthlyRevenue, 0))}
              </span>
            </span>
          </motion.div>
        )}
      </HudPanel>
    </div>
  );
}
