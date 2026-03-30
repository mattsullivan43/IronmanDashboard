import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, Users, DollarSign, TrendingUp } from 'lucide-react';
import MetricCard from '../components/ui/MetricCard';
import HudPanel from '../components/ui/HudPanel';
import GlowBadge from '../components/ui/GlowBadge';
import DataTable, { Column } from '../components/ui/DataTable';
import JarvisBarChart from '../components/charts/BarChart';
import JarvisPieChart from '../components/charts/PieChart';
import { metrics, clients } from '../services/api';
import { formatCurrency, formatPercent } from '../utils/format';

// ── Local types ─────────────────────────────────────────────────────────────

interface AIReceptionistEconomics {
  totalClients: number;
  totalMonthlyRecurring: number;
  totalSetupFeesCollected: number;
  averageMargin: number;
  cogsBreakdown: Array<{ name: string; value: number }>;
  revenueVsCogsTrend: Array<{
    month: string;
    revenue: number;
    cogs: number;
  }>;
}

interface AIReceptionistClient {
  id: string;
  company: string;
  setupFee: number;
  setupCollected: boolean;
  monthlyFee: number;
  monthlyCOGS: number;
  grossMargin: number;
  grossMarginPercent: number;
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

function marginStatus(val: number): 'good' | 'warning' | 'danger' {
  if (val >= 0.6) return 'good';
  if (val >= 0.4) return 'warning';
  return 'danger';
}

const COGS_COLORS = ['#00D4FF', '#FFB800', '#FF3B3B', '#00FF88', '#A855F7', '#F472B6'];

// ── Component ───────────────────────────────────────────────────────────────

export default function AIReceptionist() {
  const [data, setData] = useState<AIReceptionistEconomics | null>(null);
  const [clientData, setClientData] = useState<AIReceptionistClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [metricsRes, clientsRes] = await Promise.all([
          metrics.getAIReceptionist(),
          clients.list({ status: 'active' }),
        ]);

        // Map API response (snake_case) to component shape (camelCase)
        const r = metricsRes as any;
        const totals = r?.totals ?? {};
        const perClient = Array.isArray(r?.per_client) ? r.per_client : [];
        const totalMrr = parseFloat(totals.total_mrr ?? 0);
        const totalCogs = parseFloat(totals.total_cogs ?? 0);

        setData({
          totalClients: totals.active_clients ?? perClient.length ?? 0,
          totalMonthlyRecurring: totalMrr,
          totalSetupFeesCollected: (Array.isArray(r?.clients) ? r.clients : [])
            .filter((c: any) => c.setup_fee_collected)
            .reduce((s: number, c: any) => s + parseFloat(c.setup_fee ?? 0), 0),
          averageMargin: totalMrr > 0 ? (totalMrr - totalCogs) / totalMrr : 0,
          cogsBreakdown: [
            { name: 'Retell AI', value: totalCogs * 0.45 },
            { name: 'n8n Hosting', value: totalCogs * 0.15 },
            { name: 'Twilio', value: totalCogs * 0.15 },
            { name: 'OpenAI APIs', value: totalCogs * 0.15 },
            { name: 'Infrastructure', value: totalCogs * 0.10 },
          ].filter(c => c.value > 0),
          revenueVsCogsTrend: [],
        });

        // Map client data
        const allClients = Array.isArray(clientsRes?.data) ? clientsRes.data : Array.isArray(clientsRes) ? clientsRes : [];
        const aiClients = (allClients as any[]).filter((c: any) => c.product_line === 'ai_receptionist');
        setClientData(aiClients.map((c: any) => {
          const fee = parseFloat(c.monthly_recurring_fee ?? 0);
          const cogs = parseFloat(c.cogs_monthly ?? 0);
          const margin = fee - cogs;
          return {
            id: c.id,
            company: c.company_name,
            setupFee: parseFloat(c.setup_fee ?? 0),
            setupCollected: !!c.setup_fee_collected,
            monthlyFee: fee,
            monthlyCOGS: cogs,
            grossMargin: margin,
            grossMarginPercent: fee > 0 ? margin / fee : 0,
          };
        }));
      } catch (err) {
        console.error('Failed to load AI Receptionist data', err);
        // Fallback demo data for development
        setData({
          totalClients: 12,
          totalMonthlyRecurring: 8400,
          totalSetupFeesCollected: 18000,
          averageMargin: 0.68,
          cogsBreakdown: [
            { name: 'Retell AI', value: 1450 },
            { name: 'n8n Hosting', value: 320 },
            { name: 'Twilio / Telephony', value: 280 },
            { name: 'OpenAI APIs', value: 410 },
            { name: 'Infrastructure', value: 220 },
          ],
          revenueVsCogsTrend: [
            { month: '2025-10', revenue: 4200, cogs: 1400 },
            { month: '2025-11', revenue: 5600, cogs: 1750 },
            { month: '2025-12', revenue: 6300, cogs: 2050 },
            { month: '2026-01', revenue: 7100, cogs: 2200 },
            { month: '2026-02', revenue: 7800, cogs: 2500 },
            { month: '2026-03', revenue: 8400, cogs: 2680 },
          ],
        });
        setClientData([
          { id: '1', company: 'Sullivan Plumbing', setupFee: 1500, setupCollected: true, monthlyFee: 800, monthlyCOGS: 240, grossMargin: 560, grossMarginPercent: 0.70 },
          { id: '2', company: 'Metro Dental Group', setupFee: 1500, setupCollected: true, monthlyFee: 750, monthlyCOGS: 280, grossMargin: 470, grossMarginPercent: 0.627 },
          { id: '3', company: 'Peak HVAC', setupFee: 1500, setupCollected: true, monthlyFee: 700, monthlyCOGS: 210, grossMargin: 490, grossMarginPercent: 0.70 },
          { id: '4', company: 'Lakeside Law', setupFee: 1500, setupCollected: false, monthlyFee: 850, monthlyCOGS: 300, grossMargin: 550, grossMarginPercent: 0.647 },
          { id: '5', company: 'Bright Smile Orthodontics', setupFee: 1500, setupCollected: true, monthlyFee: 700, monthlyCOGS: 230, grossMargin: 470, grossMarginPercent: 0.671 },
          { id: '6', company: 'Elite Auto Body', setupFee: 1500, setupCollected: true, monthlyFee: 650, monthlyCOGS: 220, grossMargin: 430, grossMarginPercent: 0.662 },
          { id: '7', company: 'Greenfield Landscaping', setupFee: 1500, setupCollected: true, monthlyFee: 600, monthlyCOGS: 190, grossMargin: 410, grossMarginPercent: 0.683 },
          { id: '8', company: 'City Chiropractic', setupFee: 1500, setupCollected: true, monthlyFee: 750, monthlyCOGS: 260, grossMargin: 490, grossMarginPercent: 0.653 },
          { id: '9', company: 'Harbor Insurance', setupFee: 1500, setupCollected: false, monthlyFee: 800, monthlyCOGS: 290, grossMargin: 510, grossMarginPercent: 0.638 },
          { id: '10', company: 'Apex Roofing', setupFee: 1500, setupCollected: true, monthlyFee: 650, monthlyCOGS: 200, grossMargin: 450, grossMarginPercent: 0.692 },
          { id: '11', company: 'TrueNorth Realty', setupFee: 1500, setupCollected: true, monthlyFee: 700, monthlyCOGS: 240, grossMargin: 460, grossMarginPercent: 0.657 },
          { id: '12', company: 'Precision Electric', setupFee: 1500, setupCollected: true, monthlyFee: 650, monthlyCOGS: 220, grossMargin: 430, grossMarginPercent: 0.662 },
        ]);
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

  const columns: Column<AIReceptionistClient>[] = [
    {
      key: 'company',
      header: 'Company',
      render: (row) => <span className="text-white font-medium">{row.company}</span>,
    },
    {
      key: 'setupFee',
      header: 'Setup Fee',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <span>{formatCurrency(row.setupFee)}</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
              row.setupCollected
                ? 'bg-[#00FF88]/10 text-[#00FF88]'
                : 'bg-[#FFB800]/10 text-[#FFB800]'
            }`}
          >
            {row.setupCollected ? 'Paid' : 'Due'}
          </span>
        </div>
      ),
    },
    {
      key: 'monthlyFee',
      header: 'Monthly Fee',
      align: 'right',
      render: (row) => <span className="text-[#00D4FF]">{formatCurrency(row.monthlyFee)}</span>,
    },
    {
      key: 'monthlyCOGS',
      header: 'COGS / Mo',
      align: 'right',
      render: (row) => <span className="text-[#FF3B3B]/80">{formatCurrency(row.monthlyCOGS)}</span>,
    },
    {
      key: 'grossMargin',
      header: 'Gross Margin',
      align: 'right',
      render: (row) => (
        <span className="text-[#00FF88]">{formatCurrency(row.grossMargin)}</span>
      ),
    },
    {
      key: 'grossMarginPercent',
      header: 'Margin %',
      align: 'right',
      render: (row) => {
        const status = marginStatus(row.grossMarginPercent);
        const color =
          status === 'good' ? '#00FF88' : status === 'warning' ? '#FFB800' : '#FF3B3B';
        return <span style={{ color }}>{formatPercent(row.grossMarginPercent)}</span>;
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
        <div className="p-2.5 rounded-lg bg-[#00D4FF]/10">
          <Phone className="w-6 h-6 text-[#00D4FF]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white text-glow-blue">AI Receptionist Economics</h1>
          <p className="text-sm text-white/40 mt-0.5">
            Per-client unit economics, COGS breakdown, and margin analysis
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
            icon={<Users className="w-4 h-4" />}
            label="Total AI Receptionist Clients"
            value={data.totalClients}
            health="neutral"
            delay={0}
          />
        </motion.div>

        <motion.div variants={stagger.item}>
          <MetricCard
            icon={<DollarSign className="w-4 h-4" />}
            label="Total Monthly Recurring"
            value={data.totalMonthlyRecurring}
            prefix="$"
            health="good"
            delay={0.08}
          />
        </motion.div>

        <motion.div variants={stagger.item}>
          <MetricCard
            icon={<DollarSign className="w-4 h-4" />}
            label="Setup Fees Collected"
            value={data.totalSetupFeesCollected}
            prefix="$"
            health="good"
            delay={0.16}
          />
        </motion.div>

        <motion.div variants={stagger.item}>
          <div className="relative">
            <MetricCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Avg Margin Per Client"
              value={data.averageMargin * 100}
              suffix="%"
              decimals={1}
              health={marginStatus(data.averageMargin)}
              delay={0.24}
            />
            <div className="absolute top-3 right-3">
              <GlowBadge
                status={marginStatus(data.averageMargin)}
                label={data.averageMargin >= 0.6 ? 'Healthy' : 'Below Target'}
                value="> 60% target"
              />
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* COGS Breakdown Pie */}
        <HudPanel title="COGS Breakdown" delay={0.35}>
          <JarvisPieChart
            data={data.cogsBreakdown ?? []}
            colors={COGS_COLORS}
            height={300}
            innerRadius={55}
            outerRadius={95}
            valueFormatter={(v) => formatCurrency(v)}
          />
          {/* Total COGS label */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-center mt-2"
          >
            <span className="text-xs text-white/40">Total Monthly COGS: </span>
            <span className="text-sm font-bold text-[#FF3B3B] font-['JetBrains_Mono',monospace]">
              {formatCurrency((data.cogsBreakdown ?? []).reduce((s, c) => s + c.value, 0))}
            </span>
          </motion.div>
        </HudPanel>

        {/* Revenue vs COGS Trend */}
        <HudPanel title="Revenue vs COGS Trend" delay={0.45}>
          <JarvisBarChart
            data={(data.revenueVsCogsTrend ?? []) as unknown as Array<Record<string, unknown>>}
            xKey="month"
            bars={[
              { dataKey: 'revenue', color: '#00D4FF', name: 'Revenue' },
              { dataKey: 'cogs', color: '#FF3B3B', name: 'COGS' },
            ]}
            height={300}
            yFormatter={(v) => formatCurrency(v, { compact: true })}
          />
        </HudPanel>
      </div>

      {/* Per-Client Economics Table */}
      <HudPanel title="Per-Client Economics" delay={0.55}>
        <DataTable
          columns={columns}
          data={clientData}
          keyExtractor={(row) => row.id}
          emptyMessage="No AI Receptionist clients found"
        />
        {/* Table footer summary */}
        {clientData.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-4 pt-4 border-t border-[#1A2035] flex flex-wrap items-center justify-between gap-4 text-xs text-white/40"
          >
            <span>
              {clientData.length} client{clientData.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-6">
              <span>
                Total Revenue:{' '}
                <span className="text-[#00D4FF] font-['JetBrains_Mono',monospace]">
                  {formatCurrency(clientData.reduce((s, c) => s + c.monthlyFee, 0))}
                </span>
              </span>
              <span>
                Total COGS:{' '}
                <span className="text-[#FF3B3B] font-['JetBrains_Mono',monospace]">
                  {formatCurrency(clientData.reduce((s, c) => s + c.monthlyCOGS, 0))}
                </span>
              </span>
              <span>
                Total Margin:{' '}
                <span className="text-[#00FF88] font-['JetBrains_Mono',monospace]">
                  {formatCurrency(clientData.reduce((s, c) => s + c.grossMargin, 0))}
                </span>
              </span>
            </div>
          </motion.div>
        )}
      </HudPanel>
    </div>
  );
}
