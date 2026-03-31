import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import {
  Plus,
  Download,
  Search,
  Pencil,
  Trash2,
  Tags,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  DollarSign,
} from 'lucide-react';
import HudPanel from '../components/ui/HudPanel';
import MetricCard from '../components/ui/MetricCard';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import DateRangeFilter from '../components/ui/DateRangeFilter';
import AnimatedNumber from '../components/ui/AnimatedNumber';
import JarvisBarChart from '../components/charts/BarChart';
import JarvisPieChart from '../components/charts/PieChart';
import { transactions, settings, clients as clientsApi, analytics } from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';
import type { Transaction, ExpenseCategory, Client } from '../types';

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
  // Suppress unused warnings for features kept but hidden from UI
  void AnalyticsView;

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
  const [pageSize, setPageSize] = useState(100);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Filters — default to 12 months back
  const now = new Date();
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const defaultStart = `${yearAgo.getFullYear()}-${String(yearAgo.getMonth() + 1).padStart(2, '0')}-01`;
  const defaultEnd = now.toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [amountMin, _setAmountMin] = useState('');
  const [amountMax, _setAmountMax] = useState('');
  void _setAmountMin; void _setAmountMax; // filters available but not shown in simplified UI

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
        start_date: startDate,
        end_date: endDate,
      };
      if (typeFilter) params.type = typeFilter;
      if (categoryFilter) params.category = categoryFilter;
      if (searchText) params.search = searchText;
      if (amountMin) params.min_amount = amountMin;
      if (amountMax) params.max_amount = amountMax;

      const res: any = await transactions.list(params);
      // unwrapFull returns { success, data: { transactions: [...], pagination: {...} } }
      const inner = res?.data ?? res;
      const txData = Array.isArray(inner?.transactions) ? inner.transactions : (Array.isArray(inner) ? inner : []);
      setData(txData);
      setTotal(inner?.pagination?.total ?? res?.pagination?.total ?? txData.length);
    } catch (err) {
      console.error('Failed to load transactions', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, startDate, endDate, typeFilter, categoryFilter, searchText, amountMin, amountMax]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await transactions.getSummary({ startDate, endDate });
      // Backend returns an array of monthly rows — aggregate into totals
      if (Array.isArray(res)) {
        const totalIncome = res.reduce((sum: number, r: any) => sum + Number(r.inflows || 0), 0);
        const totalExpenses = res.reduce((sum: number, r: any) => sum + Number(r.outflows || 0), 0);
        setSummary({ totalIncome, totalExpenses, netIncome: totalIncome - totalExpenses });
      } else if (res && typeof res === 'object') {
        setSummary({
          totalIncome: Number(res.totalIncome) || 0,
          totalExpenses: Number(res.totalExpenses) || 0,
          netIncome: Number(res.netIncome) || 0,
        });
      }
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

  // ── Derived: group by month ───────────────────────────────────────────────

  const monthGroups = useMemo(() => {
    const groups: Record<string, { transactions: Transaction[]; income: number; expenses: number }> = {};
    for (const tx of data) {
      const monthKey = tx.date ? tx.date.slice(0, 7) : 'Unknown';
      if (!groups[monthKey]) groups[monthKey] = { transactions: [], income: 0, expenses: 0 };
      groups[monthKey].transactions.push(tx);
      if (tx.type === 'income') groups[monthKey].income += tx.amount;
      else groups[monthKey].expenses += tx.amount;
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [data]);

  // Category spending totals
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const tx of data) {
      if (tx.type === 'expense') {
        const cat = tx.category || 'Miscellaneous';
        totals[cat] = (totals[cat] || 0) + tx.amount;
      }
    }
    return Object.entries(totals).sort(([, a], [, b]) => b - a);
  }, [data]);

  // Inline category editing
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const handleInlineCategoryChange = async (txId: string, newCategory: string) => {
    try {
      await transactions.bulkCategorize({ ids: [txId], category: newCategory });
      setEditingCategoryId(null);
      loadTransactions();
      loadSummary();
    } catch { toast.error('Failed to update category'); }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const net = summary.totalIncome - summary.totalExpenses;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Transactions</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={<Download className="w-4 h-4" />} onClick={handleExport}>Export</Button>
          <Button variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={handleAddOpen}>Add</Button>
        </div>
      </div>

      {/* Credits / Debits summary */}
      <div className="flex items-center gap-8 px-5 py-3 bg-[#0D1321]/80 border border-[#1A2035] rounded-lg">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-white/40 block">Credits</span>
          <span className="text-lg font-mono font-bold text-[#00FF88]">{formatCurrency(summary.totalIncome, { decimals: 0 })}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-white/40 block">Debits</span>
          <span className="text-lg font-mono font-bold text-[#FF3B3B]">{formatCurrency(summary.totalExpenses, { decimals: 0 })}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-white/40 block">Net</span>
          <span className={`text-lg font-mono font-bold ${net >= 0 ? 'text-[#00D4FF]' : 'text-[#FF3B3B]'}`}>
            {net >= 0 ? '+' : '-'}{formatCurrency(Math.abs(net), { decimals: 0 })}
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <DateRangeFilter startDate={startDate} endDate={endDate} onRangeChange={handleDateRangeChange} />
        <Select
          options={[{ value: '', label: 'All Types' }, { value: 'income', label: 'Credits' }, { value: 'expense', label: 'Debits' }]}
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="!w-32"
        />
        <Select
          options={[{ value: '', label: 'All Categories' }, ...categoryOptions]}
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="!w-44"
        />
        <Input
          placeholder="Search..."
          value={searchText}
          onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
          icon={<Search className="w-4 h-4" />}
          className="!w-48"
        />
        <Button variant="ghost" size="sm" icon={<Tags className="w-3.5 h-3.5" />} onClick={async () => {
          try {
            const result = await transactions.recategorize();
            toast.success(`Re-categorized ${result.recategorized} of ${result.total}`);
            loadTransactions(); loadSummary();
          } catch { toast.error('Failed'); }
        }}>Auto-Categorize</Button>
      </div>

      {/* Category Spending Breakdown */}
      {categoryTotals.length > 0 && !categoryFilter && (
        <div className="flex items-center gap-3 flex-wrap px-4 py-3 bg-[#0D1321]/60 border border-[#1A2035] rounded-lg">
          <span className="text-[10px] uppercase tracking-wider text-white/40">Spending by category:</span>
          {categoryTotals.map(([cat, amount]) => (
            <button
              key={cat}
              onClick={() => { setCategoryFilter(cat); setPage(1); }}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-white/5 transition-colors"
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getCategoryColor(cat, categories) }} />
              <span className="text-white/70">{cat}</span>
              <span className="text-white/40 font-mono">{formatCurrency(amount, { decimals: 0 })}</span>
            </button>
          ))}
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-[#00D4FF]/5 border border-[#00D4FF]/20 rounded-lg">
          <span className="text-xs text-[#00D4FF]">{selectedIds.size} selected</span>
          <Select options={categoryOptions} value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} placeholder="Categorize as..." className="!w-44" />
          <Button variant="secondary" size="sm" onClick={handleBulkCategorize} disabled={!bulkCategory}>Apply</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
        </div>
      )}

      {/* Transactions grouped by month */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="w-6 h-6 border-2 border-[#00D4FF]/20 border-t-[#00D4FF] rounded-full" />
        </div>
      ) : monthGroups.length === 0 ? (
        <div className="text-center py-12 text-white/30">No transactions found.</div>
      ) : (
        monthGroups.map(([month, group]) => {
          const monthDate = new Date(month + '-01');
          const monthLabel = formatDate(monthDate, 'MMMM yyyy');
          const monthNet = group.income - group.expenses;
          return (
            <div key={month} className="bg-[#0D1321]/80 border border-[#1A2035] rounded-lg overflow-hidden">
              {/* Month header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A2035]/40 bg-[#0D1321]">
                <span className="text-sm font-semibold text-white/80">{monthLabel}</span>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="text-[#00FF88]">+{formatCurrency(group.income, { decimals: 0 })}</span>
                  <span className="text-[#FF3B3B]">-{formatCurrency(group.expenses, { decimals: 0 })}</span>
                  <span className={monthNet >= 0 ? 'text-[#00D4FF]' : 'text-[#FF3B3B]'}>
                    Net: {monthNet >= 0 ? '+' : '-'}{formatCurrency(Math.abs(monthNet), { decimals: 0 })}
                  </span>
                </div>
              </div>
              {/* Transaction rows */}
              <table className="w-full">
                <tbody>
                  {group.transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-[#1A2035]/20 hover:bg-white/[0.02] transition-colors">
                      <td className="pl-4 py-2 w-8">
                        <button onClick={() => toggleSelect(tx.id)} className="text-white/30 hover:text-white/60">
                          {selectedIds.has(tx.id) ? <CheckSquare className="w-3.5 h-3.5 text-[#00D4FF]" /> : <Square className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                      <td className="py-2 w-24 text-xs text-white/50 font-mono">{formatDate(tx.date, 'MMM d')}</td>
                      <td className="py-2 text-sm text-white/80 truncate max-w-[400px]">{tx.description}</td>
                      <td className="py-2 w-28 text-right font-mono text-sm font-semibold pr-4">
                        <span className={tx.type === 'income' ? 'text-[#00FF88]' : 'text-[#FF3B3B]'}>
                          {tx.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(tx.amount), { decimals: 2 })}
                        </span>
                      </td>
                      <td className="py-2 w-36">
                        {editingCategoryId === tx.id ? (
                          <select
                            autoFocus
                            className="bg-[#0D1321] border border-[#00D4FF]/40 text-white text-xs rounded px-2 py-1 outline-none"
                            defaultValue={tx.category || 'Miscellaneous'}
                            onChange={(e) => handleInlineCategoryChange(tx.id, e.target.value)}
                            onBlur={() => setEditingCategoryId(null)}
                          >
                            {categoryOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                            <option value="Miscellaneous">Miscellaneous</option>
                          </select>
                        ) : (
                          <button
                            onClick={() => setEditingCategoryId(tx.id)}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-white/5 transition-colors"
                            title="Click to change category"
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getCategoryColor(tx.category, categories) }} />
                            <span className="text-white/60">{tx.category || 'Miscellaneous'}</span>
                          </button>
                        )}
                      </td>
                      <td className="py-2 w-16 pr-4">
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleEditOpen(tx)} className="p-1 text-white/20 hover:text-[#00D4FF] transition-colors" title="Edit">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => setDeleteConfirm(tx.id)} className="p-1 text-white/20 hover:text-[#FF3B3B] transition-colors" title="Delete">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Select
          options={[{ value: '25', label: '25' }, { value: '50', label: '50' }, { value: '100', label: '100' }]}
          value={String(pageSize)}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          className="!w-20"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40 font-mono">{page}/{totalPages}</span>
          <Button variant="ghost" size="sm" icon={<ChevronLeft className="w-4 h-4" />} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>{''}</Button>
          <Button variant="ghost" size="sm" icon={<ChevronRight className="w-4 h-4" />} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>{''}</Button>
        </div>
      </div>

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
