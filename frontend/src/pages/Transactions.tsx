import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Download,
  Search,
  Pencil,
  Trash2,
  Tags,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  DollarSign,
  BarChart3,
  List,
} from 'lucide-react';
import HudPanel from '../components/ui/HudPanel';
import MetricCard from '../components/ui/MetricCard';
import DataTable, { Column } from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import DateRangeFilter from '../components/ui/DateRangeFilter';
import GlowBadge from '../components/ui/GlowBadge';
import AnimatedNumber from '../components/ui/AnimatedNumber';
import JarvisBarChart from '../components/charts/BarChart';
import JarvisPieChart from '../components/charts/PieChart';
import { transactions, settings, clients as clientsApi, analytics } from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';
import type { Transaction, ExpenseCategory, Client, ApiResponse } from '../types';

// ── Category color map ──────────────────────────────────────────────────────

const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  'Software': '#00D4FF',
  'Marketing': '#FFB800',
  'Payroll': '#FF3B3B',
  'Rent': '#9333EA',
  'Utilities': '#F97316',
  'Revenue': '#00FF88',
  'Consulting': '#00FF88',
  'Subscriptions': '#06B6D4',
  'Office': '#8B5CF6',
  'Travel': '#EC4899',
  'Insurance': '#EAB308',
  'Taxes': '#FF3B3B',
  'Equipment': '#14B8A6',
};

function getCategoryColor(category: string, categories: ExpenseCategory[]): string {
  const found = categories.find((c) => c.name === category);
  if (found) return found.color;
  return DEFAULT_CATEGORY_COLORS[category] || '#00D4FF';
}

// ── Summary Card ────────────────────────────────────────────────────────────

function SummaryCard({
  title,
  value,
  icon,
  color,
  glowColor,
  delay,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  glowColor: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="relative bg-[#0D1321]/80 backdrop-blur-xl border border-[#1A2035] rounded-lg p-5 overflow-hidden"
    >
      <div className={`absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[${glowColor}]/30 to-transparent`} />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-1">
            {title}
          </p>
          <AnimatedNumber
            value={value}
            prefix={value < 0 ? '-$' : '$'}
            decimals={0}
            className={`text-2xl font-bold ${color}`}
          />
        </div>
        <div
          className="p-3 rounded-lg"
          style={{
            backgroundColor: `${glowColor}15`,
            boxShadow: `0 0 20px ${glowColor}20`,
          }}
        >
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

// ── Analytics Types ─────────────────────────────────────────────────────────

interface MonthlyBreakdown {
  month: string;
  total_income: number;
  total_expenses: number;
  net: number;
  transaction_count: number;
  top_expense_category: string;
  categories: Array<{ name: string; total: number }>;
}

interface CategoryBreakdown {
  category: string;
  total: number;
  count: number;
  avg_amount: number;
  pct_of_total: number;
}

interface AnalyticsTotals {
  total_income: number;
  total_expenses: number;
  net: number;
  avg_monthly_income: number;
  avg_monthly_expenses: number;
  largest_expense: { amount: number; description: string; date: string; category: string } | null;
  largest_income: { amount: number; description: string; date: string; category: string } | null;
  transaction_count: number;
}

// ── Category Colors for Charts ──────────────────────────────────────────────

const CHART_COLORS = [
  '#00D4FF', '#FFB800', '#FF3B3B', '#00FF88', '#A855F7',
  '#F472B6', '#06B6D4', '#F97316', '#14B8A6', '#EAB308',
  '#8B5CF6', '#EC4899',
];

// ── Analytics View Component ────────────────────────────────────────────────

function AnalyticsView({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [monthlyData, setMonthlyData] = useState<MonthlyBreakdown[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryBreakdown[]>([]);
  const [totals, setTotals] = useState<AnalyticsTotals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = { start: startDate, end: endDate };
        const [monthly, categories, tots] = await Promise.all([
          analytics.getMonthlyBreakdown(params),
          analytics.getCategoryBreakdown(params),
          analytics.getTotals(params),
        ]);
        if (!cancelled) {
          setMonthlyData(Array.isArray(monthly) ? monthly : []);
          setCategoryData(Array.isArray(categories) ? categories : []);
          setTotals(tots ?? null);
        }
      } catch (err) {
        console.error('Failed to load analytics', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-[#00D4FF]/20 border-t-[#00D4FF] rounded-full"
        />
      </div>
    );
  }

  const formatMonth = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const fmtCurrency = (v: number) => {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
  };

  // Chart data for monthly bar chart
  const barChartData = monthlyData.map((m) => ({
    month: formatMonth(m.month),
    Income: m.total_income,
    Expenses: m.total_expenses,
    Net: m.net,
  }));

  // Category pie chart data
  const pieData = categoryData.slice(0, 10).map((c) => ({
    name: c.category,
    value: c.total,
  }));

  // Category horizontal bar data
  const categoryBarData = categoryData.slice(0, 12).map((c) => ({
    category: c.category.length > 16 ? c.category.substring(0, 14) + '...' : c.category,
    Amount: c.total,
  }));

  return (
    <div className="space-y-6">
      {/* Total Summary Cards */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Total Income" health="good" delay={0}>
            <AnimatedNumber
              value={totals.total_income}
              prefix="$"
              decimals={0}
              className="text-2xl font-bold text-[#00FF88]"
            />
          </MetricCard>
          <MetricCard label="Total Expenses" health="danger" delay={0.05}>
            <AnimatedNumber
              value={totals.total_expenses}
              prefix="$"
              decimals={0}
              className="text-2xl font-bold text-[#FF3B3B]"
            />
          </MetricCard>
          <MetricCard label="Net Profit/Loss" health={totals.net >= 0 ? 'good' : 'danger'} delay={0.1}>
            <AnimatedNumber
              value={Math.abs(totals.net)}
              prefix={totals.net >= 0 ? '$' : '-$'}
              decimals={0}
              className={`text-2xl font-bold ${totals.net >= 0 ? 'text-[#00FF88]' : 'text-[#FF3B3B]'}`}
            />
          </MetricCard>
          <MetricCard label="Transaction Count" delay={0.15}>
            <AnimatedNumber
              value={totals.transaction_count}
              decimals={0}
              className="text-2xl font-bold text-[#00D4FF]"
            />
          </MetricCard>
        </div>
      )}

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Avg Monthly Income" delay={0.2}>
            <AnimatedNumber
              value={totals.avg_monthly_income}
              prefix="$"
              decimals={0}
              className="text-xl font-bold text-[#00FF88]"
            />
          </MetricCard>
          <MetricCard label="Avg Monthly Expenses" delay={0.25}>
            <AnimatedNumber
              value={totals.avg_monthly_expenses}
              prefix="$"
              decimals={0}
              className="text-xl font-bold text-[#FF3B3B]"
            />
          </MetricCard>
          <MetricCard label="Largest Expense" delay={0.3}>
            {totals.largest_expense ? (
              <div>
                <span className="text-xl font-bold text-[#FF3B3B]">
                  {formatCurrency(totals.largest_expense.amount, { decimals: 0 })}
                </span>
                <p className="text-[10px] text-white/40 mt-1 truncate">
                  {totals.largest_expense.description}
                </p>
              </div>
            ) : (
              <span className="text-white/30 text-sm">N/A</span>
            )}
          </MetricCard>
          <MetricCard label="Largest Income" delay={0.35}>
            {totals.largest_income ? (
              <div>
                <span className="text-xl font-bold text-[#00FF88]">
                  {formatCurrency(totals.largest_income.amount, { decimals: 0 })}
                </span>
                <p className="text-[10px] text-white/40 mt-1 truncate">
                  {totals.largest_income.description}
                </p>
              </div>
            ) : (
              <span className="text-white/30 text-sm">N/A</span>
            )}
          </MetricCard>
        </div>
      )}

      {/* Monthly Breakdown Section */}
      <HudPanel title="Monthly Income vs Expenses" delay={0.2}>
        {barChartData.length > 0 ? (
          <JarvisBarChart
            data={barChartData}
            xKey="month"
            bars={[
              { dataKey: 'Income', color: '#00FF88', name: 'Income' },
              { dataKey: 'Expenses', color: '#FF3B3B', name: 'Expenses' },
            ]}
            height={340}
            stacked={false}
            yFormatter={fmtCurrency}
          />
        ) : (
          <p className="text-white/30 text-sm text-center py-8">No data available for the selected period.</p>
        )}
      </HudPanel>

      {/* Net Income Trend */}
      {barChartData.length > 0 && (
        <HudPanel title="Net Income Trend" delay={0.25}>
          <JarvisBarChart
            data={barChartData}
            xKey="month"
            bars={[
              { dataKey: 'Net', color: '#00D4FF', name: 'Net Income' },
            ]}
            height={260}
            yFormatter={fmtCurrency}
          />
        </HudPanel>
      )}

      {/* Monthly Breakdown Table */}
      {monthlyData.length > 0 && (
        <HudPanel title="Monthly Breakdown Table" delay={0.3}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1A2035]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/40">Month</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white/40">Income</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white/40">Expenses</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white/40">Net</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white/40">Txns</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/40">Top Expense</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((m) => (
                  <tr key={m.month} className="border-b border-[#1A2035]/30 hover:bg-[#00D4FF]/3 transition-colors">
                    <td className="px-4 py-3 text-white/80 font-medium">{formatMonth(m.month)}</td>
                    <td className="px-4 py-3 text-right font-mono text-[#00FF88]">
                      {formatCurrency(m.total_income, { decimals: 0 })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#FF3B3B]">
                      {formatCurrency(m.total_expenses, { decimals: 0 })}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${m.net >= 0 ? 'text-[#00FF88]' : 'text-[#FF3B3B]'}`}>
                      {m.net >= 0 ? '+' : '-'}{formatCurrency(Math.abs(m.net), { decimals: 0 })}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-white/60">{m.transaction_count}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-[#FF3B3B]/10 text-[#FF3B3B]/80">
                        {m.top_expense_category}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </HudPanel>
      )}

      {/* Category Breakdown Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <HudPanel title="Expense Distribution by Category" delay={0.35}>
          {pieData.length > 0 ? (
            <JarvisPieChart
              data={pieData}
              colors={CHART_COLORS}
              height={340}
              innerRadius={70}
              outerRadius={120}
              centerLabel="Expenses"
              centerValue={totals ? fmtCurrency(totals.total_expenses) : '$0'}
            />
          ) : (
            <p className="text-white/30 text-sm text-center py-8">No expense data available.</p>
          )}
        </HudPanel>

        {/* Horizontal Bar - Category Ranking */}
        <HudPanel title="Category Spend Ranking" delay={0.4}>
          {categoryBarData.length > 0 ? (
            <JarvisBarChart
              data={categoryBarData}
              xKey="category"
              bars={[{ dataKey: 'Amount', color: '#00D4FF', name: 'Total Spend' }]}
              height={340}
              yFormatter={fmtCurrency}
            />
          ) : (
            <p className="text-white/30 text-sm text-center py-8">No category data available.</p>
          )}
        </HudPanel>
      </div>

      {/* Category Detail Table */}
      {categoryData.length > 0 && (
        <HudPanel title="Category Detail" delay={0.45}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1A2035]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/40">Category</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white/40">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white/40">% of Total</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white/40">Txns</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white/40">Avg Size</th>
                </tr>
              </thead>
              <tbody>
                {categoryData.map((c, idx) => (
                  <tr key={c.category} className="border-b border-[#1A2035]/30 hover:bg-[#00D4FF]/3 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                        />
                        <span className="text-white/80 font-medium">{c.category}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#FF3B3B]">
                      {formatCurrency(c.total, { decimals: 0 })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-[#1A2035] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(c.pct_of_total, 100)}%`,
                              backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                            }}
                          />
                        </div>
                        <span className="font-mono text-white/60 text-xs w-12 text-right">{c.pct_of_total}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-white/60">{c.count}</td>
                    <td className="px-4 py-3 text-right font-mono text-white/60">
                      {formatCurrency(c.avg_amount, { decimals: 0 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </HudPanel>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function Transactions() {
  // View toggle
  const [view, setView] = useState<'list' | 'analytics'>('list');

  // Data state
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [clientList, setClientList] = useState<Client[]>([]);
  const [summary, setSummary] = useState<{
    totalIncome: number;
    totalExpenses: number;
    netIncome: number;
  }>({ totalIncome: 0, totalExpenses: 0, netIncome: 0 });

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Filters
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = now.toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(monthEnd);
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    type: 'expense' as 'income' | 'expense',
    category: '',
    clientId: '',
    notes: '',
  });
  const [formLoading, setFormLoading] = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────────

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page,
        limit: pageSize,
        startDate,
        endDate,
      };
      if (typeFilter) params.type = typeFilter;
      if (categoryFilter) params.category = categoryFilter;
      if (searchText) params.search = searchText;
      if (amountMin) params.amountMin = amountMin;
      if (amountMax) params.amountMax = amountMax;

      const res: ApiResponse<Transaction[]> = await transactions.list(params);
      const txData = Array.isArray(res?.data) ? res.data : [];
      setData(txData);
      setTotal(res?.pagination?.total ?? txData.length);
    } catch (err) {
      console.error('Failed to load transactions', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, startDate, endDate, typeFilter, categoryFilter, searchText, amountMin, amountMax]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await transactions.getSummary({ startDate, endDate });
      setSummary(res ?? { totalIncome: 0, totalExpenses: 0, netIncome: 0 });
    } catch (err) {
      console.error('Failed to load summary', err);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadTransactions();
    loadSummary();
  }, [loadTransactions, loadSummary]);

  useEffect(() => {
    (async () => {
      try {
        const [cats, cls] = await Promise.all([
          settings.getCategories(),
          clientsApi.list({ limit: 200 }),
        ]);
        setCategories(Array.isArray(cats) ? cats : []);
        setClientList(Array.isArray(cls?.data) ? cls.data : []);
      } catch {
        // Graceful fallback
      }
    })();
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleDateRangeChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    setPage(1);
  };

  const resetForm = () => {
    setForm({
      date: new Date().toISOString().split('T')[0],
      description: '',
      amount: '',
      type: 'expense',
      category: '',
      clientId: '',
      notes: '',
    });
  };

  const handleAddOpen = () => {
    resetForm();
    setEditingTx(null);
    setShowAddModal(true);
  };

  const handleEditOpen = (tx: Transaction) => {
    setEditingTx(tx);
    setForm({
      date: (tx.date ?? '').split('T')[0],
      description: tx.description,
      amount: String(tx.amount),
      type: tx.type,
      category: tx.category,
      clientId: tx.clientId || '',
      notes: tx.notes || '',
    });
    setShowAddModal(true);
  };

  const handleFormSubmit = async () => {
    if (!form.description || !form.amount || !form.category) return;
    setFormLoading(true);
    try {
      const payload = {
        date: form.date,
        description: form.description,
        amount: parseFloat(form.amount),
        type: form.type,
        category: form.category,
        clientId: form.clientId || undefined,
        notes: form.notes || undefined,
      };
      if (editingTx) {
        await transactions.update(editingTx.id, payload);
      } else {
        await transactions.create(payload);
      }
      setShowAddModal(false);
      resetForm();
      loadTransactions();
      loadSummary();
    } catch (err) {
      console.error('Failed to save transaction', err);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await transactions.delete(id);
      setDeleteConfirm(null);
      loadTransactions();
      loadSummary();
    } catch (err) {
      console.error('Failed to delete transaction', err);
    }
  };

  const handleBulkCategorize = async () => {
    if (!bulkCategory || selectedIds.size === 0) return;
    try {
      await transactions.bulkCategorize({ ids: Array.from(selectedIds), category: bulkCategory });
      setSelectedIds(new Set());
      setBulkCategory('');
      loadTransactions();
      loadSummary();
    } catch (err) {
      console.error('Bulk categorize failed', err);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.map((t) => t.id)));
    }
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    params.set('startDate', startDate);
    params.set('endDate', endDate);
    if (typeFilter) params.set('type', typeFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    if (searchText) params.set('search', searchText);
    if (amountMin) params.set('amountMin', amountMin);
    if (amountMax) params.set('amountMax', amountMax);

    const link = document.createElement('a');
    link.href = `/api/transactions/export?${params.toString()}`;
    link.setAttribute('download', `transactions-${startDate}-to-${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // ── Category options ──────────────────────────────────────────────────────

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.name, label: c.name })),
    [categories]
  );

  const clientOptions = useMemo(
    () => clientList.map((c) => ({ value: c.id, label: c.name })),
    [clientList]
  );

  // ── Table columns ─────────────────────────────────────────────────────────

  const columns: Column<Transaction>[] = [
    {
      key: 'select',
      header: '',
      width: '40px',
      render: (row) => (
        <button onClick={() => toggleSelect(row.id)} className="text-white/40 hover:text-white/80 transition-colors">
          {selectedIds.has(row.id) ? (
            <CheckSquare className="w-4 h-4 text-[#00D4FF]" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </button>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      width: '120px',
      render: (row) => (
        <span className="text-white/70">{formatDate(row.date, 'MMM d, yyyy')}</span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (row) => (
        <span className="text-white/90 font-medium truncate max-w-[300px] block">
          {row.description}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      width: '140px',
      render: (row) => (
        <span
          className={`font-semibold ${
            row.type === 'income' ? 'text-[#00FF88]' : 'text-[#FF3B3B]'
          }`}
        >
          {row.type === 'income' ? '+' : '-'}
          {formatCurrency(Math.abs(row.amount), { decimals: 2 })}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      width: '160px',
      render: (row) => {
        const color = getCategoryColor(row.category, categories);
        return (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{
              backgroundColor: `${color}15`,
              color,
              boxShadow: `0 0 6px ${color}30`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {row.category}
          </span>
        );
      },
    },
    {
      key: 'source',
      header: 'Source',
      width: '90px',
      render: (row) =>
        row.csvUploadId ? (
          <GlowBadge status="warning" label="CSV" />
        ) : (
          <GlowBadge status="good" label="Manual" />
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center',
      width: '120px',
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => handleEditOpen(row)}
            className="p-1.5 rounded-md text-white/30 hover:text-[#00D4FF] hover:bg-[#00D4FF]/10 transition-all"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDeleteConfirm(row.id)}
            className="p-1.5 rounded-md text-white/30 hover:text-[#FF3B3B] hover:bg-[#FF3B3B]/10 transition-all"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleEditOpen(row)}
            className="p-1.5 rounded-md text-white/30 hover:text-[#FFB800] hover:bg-[#FFB800]/10 transition-all"
            title="Re-categorize"
          >
            <Tags className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  const net = summary.totalIncome - summary.totalExpenses;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Transaction Ledger
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Financial transaction monitoring and management
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center bg-[#0D1321]/80 border border-[#1A2035] rounded-lg p-0.5">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${
                view === 'list'
                  ? 'bg-[#00D4FF]/15 text-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.2)]'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              List
            </button>
            <button
              onClick={() => setView('analytics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${
                view === 'analytics'
                  ? 'bg-[#00D4FF]/15 text-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.2)]'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Analytics
            </button>
          </div>
          {view === 'list' && (
            <>
              <Button variant="ghost" size="sm" icon={<Download className="w-4 h-4" />} onClick={handleExport}>
                Export CSV
              </Button>
              <Button variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={handleAddOpen}>
                Add Transaction
              </Button>
            </>
          )}
        </div>
      </motion.div>

      {/* Date Range (shared between views) */}
      {view === 'analytics' && (
        <HudPanel title="Date Range" delay={0.1}>
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onRangeChange={handleDateRangeChange}
          />
        </HudPanel>
      )}

      {/* Analytics View */}
      {view === 'analytics' && (
        <AnalyticsView startDate={startDate} endDate={endDate} />
      )}

      {/* List View */}
      {view === 'list' && (
        <>
      {/* Monthly Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          title="Total Inflows"
          value={summary.totalIncome}
          icon={<TrendingUp className="w-5 h-5 text-[#00FF88]" />}
          color="text-[#00FF88]"
          glowColor="#00FF88"
          delay={0}
        />
        <SummaryCard
          title="Total Outflows"
          value={summary.totalExpenses}
          icon={<TrendingDown className="w-5 h-5 text-[#FF3B3B]" />}
          color="text-[#FF3B3B]"
          glowColor="#FF3B3B"
          delay={0.1}
        />
        <SummaryCard
          title="Net"
          value={Math.abs(net)}
          icon={<ArrowLeftRight className="w-5 h-5" style={{ color: net >= 0 ? '#00D4FF' : '#FF3B3B' }} />}
          color={net >= 0 ? 'text-[#00D4FF]' : 'text-[#FF3B3B]'}
          glowColor={net >= 0 ? '#00D4FF' : '#FF3B3B'}
          delay={0.2}
        />
      </div>

      {/* Filters */}
      <HudPanel title="Filters" delay={0.15}>
        <div className="space-y-4">
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onRangeChange={handleDateRangeChange}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Select
              options={[
                { value: '', label: 'All Types' },
                { value: 'income', label: 'Income' },
                { value: 'expense', label: 'Expense' },
              ]}
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              placeholder="Type"
            />
            <Select
              options={[{ value: '', label: 'All Categories' }, ...categoryOptions]}
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              placeholder="Category"
            />
            <Input
              placeholder="Min amount"
              type="number"
              value={amountMin}
              onChange={(e) => {
                setAmountMin(e.target.value);
                setPage(1);
              }}
              icon={<DollarSign className="w-4 h-4" />}
            />
            <Input
              placeholder="Max amount"
              type="number"
              value={amountMax}
              onChange={(e) => {
                setAmountMax(e.target.value);
                setPage(1);
              }}
              icon={<DollarSign className="w-4 h-4" />}
            />
            <Input
              placeholder="Search description..."
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setPage(1);
              }}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
        </div>
      </HudPanel>

      {/* Bulk Actions */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-4 px-5 py-3 bg-[#00D4FF]/5 border border-[#00D4FF]/20 rounded-lg">
              <span className="text-sm text-[#00D4FF] font-medium">
                {selectedIds.size} selected
              </span>
              <div className="flex items-center gap-2 flex-1">
                <Select
                  options={categoryOptions}
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                  placeholder="Re-categorize to..."
                  className="max-w-[220px]"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Tags className="w-3.5 h-3.5" />}
                  onClick={handleBulkCategorize}
                  disabled={!bulkCategory}
                >
                  Apply
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transaction Table */}
      <HudPanel title="Transactions" delay={0.2}>
        {/* Select all toggle */}
        <div className="flex items-center justify-between mb-3 px-1">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            {selectedIds.size === data.length && data.length > 0 ? (
              <CheckSquare className="w-3.5 h-3.5 text-[#00D4FF]" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            Select all
          </button>
          <span className="text-xs text-white/30 font-mono">
            {total} total records
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="w-8 h-8 border-2 border-[#00D4FF]/20 border-t-[#00D4FF] rounded-full"
            />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={data}
            keyExtractor={(row) => row.id}
            emptyMessage="No transactions found, sir. Adjust your filters or add a new record."
          />
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#1A2035]/40">
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40">Rows per page:</span>
            <Select
              options={[
                { value: '10', label: '10' },
                { value: '25', label: '25' },
                { value: '50', label: '50' },
                { value: '100', label: '100' },
              ]}
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="!w-20"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40 font-mono">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronLeft className="w-4 h-4" />}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronRight className="w-4 h-4" />}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </HudPanel>

        </>
      )}

      {/* Add / Edit Transaction Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={editingTx ? 'Edit Transaction' : 'New Transaction'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
            <Select
              label="Type"
              options={[
                { value: 'income', label: 'Income' },
                { value: 'expense', label: 'Expense' },
              ]}
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({ ...f, type: e.target.value as 'income' | 'expense' }))
              }
            />
          </div>
          <Input
            label="Description"
            placeholder="Enter transaction description..."
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              icon={<DollarSign className="w-4 h-4" />}
            />
            <Select
              label="Category"
              options={categoryOptions}
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Select category..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Client (optional)"
              options={clientOptions}
              value={form.clientId}
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
              placeholder="None"
            />
            <Input
              label="Notes (optional)"
              placeholder="Additional notes..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[#1A2035]">
            <Button variant="ghost" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleFormSubmit}
              loading={formLoading}
              disabled={!form.description || !form.amount || !form.category}
            >
              {editingTx ? 'Update Transaction' : 'Create Transaction'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Confirm Deletion"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/60">
            Are you sure you want to permanently delete this transaction? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              Delete Transaction
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
