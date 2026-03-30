import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Check,
  Edit3,
  Trash2,
  ChevronRight,
  Users,
  TrendingUp,
  X,
} from 'lucide-react';
import { MetricCard } from '../components/ui/MetricCard';
import HudPanel from '../components/ui/HudPanel';
import AnimatedNumber from '../components/ui/AnimatedNumber';
import GlowBadge from '../components/ui/GlowBadge';
import DataTable from '../components/ui/DataTable';
import type { Column } from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import DateRangeFilter from '../components/ui/DateRangeFilter';
import { commissions as commissionsApi, clients as clientsApi } from '../services/api';
import { formatCurrency, formatPercent, formatDate } from '../utils/format';
import type { Commission, Client } from '../types';

// ── Constants ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'paid', label: 'Paid' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'pending', label: 'Pending' },
];

const STATUS_FORM_OPTIONS = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
];

type StatusBadge = 'good' | 'warning' | 'danger';

const commissionStatusMap: Record<string, { badge: StatusBadge; label: string }> = {
  paid: { badge: 'good', label: 'Paid' },
  unpaid: { badge: 'warning', label: 'Unpaid' },
  pending: { badge: 'warning', label: 'Pending' },
  cancelled: { badge: 'danger', label: 'Cancelled' },
};

const DEFAULT_REP = 'Marlon Ridley';
const DEFAULT_RATE = 35;

// ── Form state ──────────────────────────────────────────────────────────────

interface CommissionForm {
  agentName: string;
  clientId: string;
  dealDescription: string;
  dealValue: number;
  rate: number;
  amount: number;
  status: string;
  date: string;
  datePaid: string;
  notes: string;
}

const emptyForm: CommissionForm = {
  agentName: DEFAULT_REP,
  clientId: '',
  dealDescription: '',
  dealValue: 0,
  rate: DEFAULT_RATE,
  amount: 0,
  status: 'unpaid',
  date: new Date().toISOString().split('T')[0],
  datePaid: '',
  notes: '',
};

// ── Summary types ───────────────────────────────────────────────────────────

interface CommissionSummary {
  totalPaid: number;
  totalPending: number;
  byAgent: Array<{
    agentName: string;
    total: number;
    paid: number;
    pending: number;
  }>;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Commissions() {
  // Data state
  const [commissionList, setCommissionList] = useState<Commission[]>([]);
  const [clientList, setClientList] = useState<Client[]>([]);
  const [_summary, setSummary] = useState<CommissionSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [statusFilter, setStatusFilter] = useState('all');
  const [repFilter, setRepFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCommission, setEditingCommission] = useState<Commission | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Per-rep summary collapse state
  const [repSummaryOpen, setRepSummaryOpen] = useState(true);
  const [expandedReps, setExpandedReps] = useState<Set<string>>(new Set());

  // Form state
  const [form, setForm] = useState<CommissionForm>({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  // ── Derived values ────────────────────────────────────────────────────────

  const uniqueReps = useMemo(() => {
    const reps = new Set(commissionList.map((c) => c.agentName));
    reps.add(DEFAULT_REP);
    return Array.from(reps).sort();
  }, [commissionList]);

  const repOptions = useMemo(
    () => [{ value: '', label: 'All Reps' }, ...uniqueReps.map((r) => ({ value: r, label: r }))],
    [uniqueReps]
  );

  const clientOptions = useMemo(
    () => [
      { value: '', label: 'Select Client' },
      ...clientList.map((c) => ({ value: c.id, label: c.company || c.name })),
    ],
    [clientList]
  );

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchCommissions = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (repFilter) params.agentName = repFilter;
      const response = await commissionsApi.list(params);
      setCommissionList(Array.isArray(response?.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to fetch commissions:', err);
    }
  }, [statusFilter, repFilter]);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await commissionsApi.getSummary({
        startDate: dateRange.start,
        endDate: dateRange.end,
      });
      setSummary(data);
    } catch (err) {
      console.error('Failed to fetch summary:', err);
    }
  }, [dateRange]);

  const fetchClients = useCallback(async () => {
    try {
      const response = await clientsApi.list({ limit: 500 });
      setClientList(Array.isArray(response?.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchCommissions(), fetchSummary(), fetchClients()]).finally(() =>
      setLoading(false)
    );
  }, [fetchCommissions, fetchSummary, fetchClients]);

  // ── Filtered data ─────────────────────────────────────────────────────────

  const filteredCommissions = useMemo(() => {
    let result = commissionList;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.agentName?.toLowerCase().includes(q) ||
          c.dealDescription?.toLowerCase().includes(q) ||
          c.client?.company?.toLowerCase().includes(q) ||
          c.client?.name?.toLowerCase().includes(q) ||
          c.source?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [commissionList, searchQuery]);

  // ── Computed summary values ───────────────────────────────────────────────

  const totalOwed = useMemo(
    () =>
      commissionList
        .filter((c) => c.status === 'unpaid' || c.status === 'pending')
        .reduce((sum, c) => sum + c.amount, 0),
    [commissionList]
  );

  const totalPaid = useMemo(
    () =>
      commissionList
        .filter((c) => c.status === 'paid')
        .reduce((sum, c) => sum + c.amount, 0),
    [commissionList]
  );

  const outstandingThisMonth = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return commissionList
      .filter(
        (c) =>
          (c.status === 'unpaid' || c.status === 'pending') &&
          c.date?.startsWith(thisMonth)
      )
      .reduce((sum, c) => sum + c.amount, 0);
  }, [commissionList]);

  // ── Per-rep summary ───────────────────────────────────────────────────────

  const perRepSummary = useMemo(() => {
    const map = new Map<string, { deals: number; total: number; paid: number; outstanding: number }>();
    commissionList.forEach((c) => {
      const existing = map.get(c.agentName) ?? { deals: 0, total: 0, paid: 0, outstanding: 0 };
      existing.deals += 1;
      existing.total += c.amount;
      if (c.status === 'paid') existing.paid += c.amount;
      else existing.outstanding += c.amount;
      map.set(c.agentName, existing);
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [commissionList]);

  // ── Form handlers ─────────────────────────────────────────────────────────

  const updateForm = (field: keyof CommissionForm, value: unknown) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Auto-calculate commission amount when dealValue or rate changes
      if (field === 'dealValue' || field === 'rate') {
        const dealValue = field === 'dealValue' ? (value as number) : prev.dealValue;
        const rate = field === 'rate' ? (value as number) : prev.rate;
        next.amount = Math.round((dealValue * rate) / 100 * 100) / 100;
      }
      // Set default rate for Marlon
      if (field === 'agentName' && value === DEFAULT_REP) {
        next.rate = DEFAULT_RATE;
        next.amount = Math.round((next.dealValue * DEFAULT_RATE) / 100 * 100) / 100;
      }
      return next;
    });
  };

  const openAddModal = () => {
    setForm({ ...emptyForm });
    setEditingCommission(null);
    setShowAddModal(true);
  };

  const openEditModal = (commission: Commission) => {
    setForm({
      agentName: commission.agentName,
      clientId: commission.clientId ?? '',
      dealDescription: commission.dealDescription ?? commission.source ?? '',
      dealValue: commission.dealValue ?? 0,
      rate: commission.rate * 100, // Backend stores as decimal, we show as percentage
      amount: commission.amount,
      status: commission.status,
      date: commission.date?.split('T')[0] ?? '',
      datePaid: commission.datePaid?.split('T')[0] ?? '',
      notes: commission.notes ?? '',
    });
    setEditingCommission(commission);
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingCommission(null);
    setForm({ ...emptyForm });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<Commission> = {
        agentName: form.agentName,
        clientId: form.clientId || undefined,
        dealDescription: form.dealDescription,
        dealValue: form.dealValue,
        rate: form.rate / 100, // Store as decimal
        amount: form.amount,
        status: form.status as Commission['status'],
        date: form.date,
        datePaid: form.datePaid || undefined,
        source: form.dealDescription,
        notes: form.notes || undefined,
      };

      if (editingCommission) {
        await commissionsApi.update(editingCommission.id, payload);
      } else {
        await commissionsApi.create(payload);
      }
      closeModal();
      await Promise.all([fetchCommissions(), fetchSummary()]);
    } catch (err) {
      console.error('Failed to save commission:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async (commission: Commission) => {
    try {
      await commissionsApi.update(commission.id, {
        status: 'paid',
        datePaid: new Date().toISOString().split('T')[0],
      });
      await Promise.all([fetchCommissions(), fetchSummary()]);
    } catch (err) {
      console.error('Failed to mark as paid:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await commissionsApi.delete(id);
      setShowDeleteConfirm(null);
      await Promise.all([fetchCommissions(), fetchSummary()]);
    } catch (err) {
      console.error('Failed to delete commission:', err);
    }
  };

  const toggleRepExpanded = (name: string) => {
    setExpandedReps((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // ── Table columns ─────────────────────────────────────────────────────────

  const tableColumns: Column<Commission>[] = [
    {
      key: 'agentName',
      header: 'Rep Name',
      render: (row) => <span className="text-white font-medium">{row.agentName}</span>,
    },
    {
      key: 'dealDescription',
      header: 'Client / Deal',
      render: (row) => (
        <div>
          <span className="text-white/80">{row.client?.company || row.client?.name || '--'}</span>
          {(row.dealDescription || row.source) && (
            <p className="text-xs text-white/40 mt-0.5">{row.dealDescription || row.source}</p>
          )}
        </div>
      ),
    },
    {
      key: 'dealValue',
      header: 'Deal Value',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-white/80">
          {formatCurrency(row.dealValue ?? 0)}
        </span>
      ),
    },
    {
      key: 'rate',
      header: 'Rate',
      align: 'center',
      render: (row) => (
        <span className="font-mono text-[#00D4FF]">
          {formatPercent(row.rate * 100, { decimals: 0 })}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Commission',
      align: 'right',
      render: (row) => (
        <span className="font-mono font-semibold text-[#FFB800]">
          {formatCurrency(row.amount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const config = commissionStatusMap[row.status] ?? commissionStatusMap.pending;
        return <GlowBadge status={config.badge} label={config.label} />;
      },
    },
    {
      key: 'date',
      header: 'Date Closed',
      render: (row) => (
        <span className="text-xs text-white/50 font-mono">
          {row.date ? formatDate(row.date, 'MMM d, yyyy') : '--'}
        </span>
      ),
    },
    {
      key: 'datePaid',
      header: 'Date Paid',
      render: (row) => (
        <span className="text-xs text-white/50 font-mono">
          {row.datePaid ? formatDate(row.datePaid, 'MMM d, yyyy') : '--'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex items-center gap-1 justify-end">
          {row.status !== 'paid' && (
            <button
              onClick={(e) => { e.stopPropagation(); handleMarkPaid(row); }}
              className="p-1.5 rounded-md text-white/30 hover:text-[#00FF88] hover:bg-[#00FF88]/10 transition-colors"
              title="Mark as paid"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); openEditModal(row); }}
            className="p-1.5 rounded-md text-white/30 hover:text-[#00D4FF] hover:bg-[#00D4FF]/10 transition-colors"
            title="Edit"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(row.id); }}
            className="p-1.5 rounded-md text-white/30 hover:text-[#FF3B3B] hover:bg-[#FF3B3B]/10 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-[#FFB800] rounded-full shadow-[0_0_10px_rgba(255,184,0,0.5)]" />
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Commissions</h1>
            <p className="text-sm text-white/40 mt-0.5">Track rep commissions and payouts</p>
          </div>
        </div>
        <Button
          variant="secondary"
          icon={<Plus className="w-4 h-4" />}
          onClick={openAddModal}
        >
          Add Commission
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label="Total Commissions Owed" health="warning" delay={0.05}>
          <AnimatedNumber
            value={totalOwed}
            prefix="$"
            className="text-2xl font-bold text-[#FFB800]"
          />
          <p className="text-xs text-white/30 mt-1">All unpaid commissions</p>
        </MetricCard>
        <MetricCard label="Total Commissions Paid" health="good" delay={0.1}>
          <AnimatedNumber
            value={totalPaid}
            prefix="$"
            className="text-2xl font-bold text-[#00FF88]"
          />
          <p className="text-xs text-white/30 mt-1">All time</p>
        </MetricCard>
        <MetricCard label="Outstanding This Month" delay={0.15}>
          <AnimatedNumber
            value={outstandingThisMonth}
            prefix="$"
            className="text-2xl font-bold text-[#00D4FF]"
          />
          <p className="text-xs text-white/30 mt-1">Current month</p>
        </MetricCard>
      </div>

      {/* Filter Bar */}
      <HudPanel delay={0.2}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              placeholder="Search commissions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0D1321]/60 border border-[#1A2035] rounded-md pl-10 pr-4 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#00D4FF]/50 focus:shadow-[0_0_12px_rgba(0,212,255,0.15)] transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Select
            options={repOptions}
            value={repFilter}
            onChange={(e) => setRepFilter(e.target.value)}
          />
          <Select
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
          <DateRangeFilter
            startDate={dateRange.start}
            endDate={dateRange.end}
            onRangeChange={(start, end) => setDateRange({ start, end })}
          />
        </div>
      </HudPanel>

      {/* Commission Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#FFB800]/30 border-t-[#FFB800] rounded-full animate-spin" />
        </div>
      ) : (
        <HudPanel title="Commission Ledger" delay={0.3}>
          <DataTable
            columns={tableColumns}
            data={filteredCommissions}
            keyExtractor={(row) => row.id}
            emptyMessage="No commissions found"
          />
        </HudPanel>
      )}

      {/* Per-Rep Summary */}
      {perRepSummary.length > 0 && (
        <HudPanel delay={0.4}>
          <button
            onClick={() => setRepSummaryOpen(!repSummaryOpen)}
            className="flex items-center gap-3 w-full text-left"
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#00D4FF]" />
              <span className="text-sm font-semibold uppercase tracking-wider text-white/90">
                Per-Rep Summary
              </span>
            </div>
            <motion.div
              animate={{ rotate: repSummaryOpen ? 90 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronRight className="w-4 h-4 text-white/30" />
            </motion.div>
          </button>

          <AnimatePresence>
            {repSummaryOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="mt-4 space-y-2">
                  {perRepSummary.map((rep) => {
                    const isExpanded = expandedReps.has(rep.name);
                    return (
                      <motion.div
                        key={rep.name}
                        layout
                        className="bg-[#0A0E17]/60 border border-[#1A2035]/60 rounded-lg overflow-hidden"
                      >
                        <button
                          onClick={() => toggleRepExpanded(rep.name)}
                          className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <motion.div
                              animate={{ rotate: isExpanded ? 90 : 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <ChevronRight className="w-3.5 h-3.5 text-white/30" />
                            </motion.div>
                            <span className="text-sm font-medium text-white">{rep.name}</span>
                            <span className="text-xs text-white/30 font-mono">
                              {rep.deals} deal{rep.deals !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <span className="text-xs text-white/30 uppercase tracking-wider mr-2">Total</span>
                              <span className="text-sm font-mono font-semibold text-[#FFB800]">
                                {formatCurrency(rep.total)}
                              </span>
                            </div>
                          </div>
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 pb-4 grid grid-cols-3 gap-4 border-t border-[#1A2035]/40 pt-3">
                                <div>
                                  <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Total Commissions</p>
                                  <p className="text-lg font-mono font-bold text-white">{formatCurrency(rep.total)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Paid</p>
                                  <p className="text-lg font-mono font-bold text-[#00FF88]">{formatCurrency(rep.paid)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Outstanding</p>
                                  <p className="text-lg font-mono font-bold text-[#FFB800]">{formatCurrency(rep.outstanding)}</p>
                                </div>
                                {/* Progress bar */}
                                <div className="col-span-3">
                                  <div className="flex items-center gap-2 text-xs text-white/40 mb-1">
                                    <TrendingUp className="w-3 h-3" />
                                    <span>
                                      {rep.total > 0 ? formatPercent((rep.paid / rep.total) * 100, { decimals: 0 }) : '0%'} paid
                                    </span>
                                  </div>
                                  <div className="h-1.5 bg-[#1A2035] rounded-full overflow-hidden">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{
                                        width: rep.total > 0 ? `${(rep.paid / rep.total) * 100}%` : '0%',
                                      }}
                                      transition={{ duration: 0.8, ease: 'easeOut' }}
                                      className="h-full bg-gradient-to-r from-[#00FF88] to-[#00D4FF] rounded-full"
                                    />
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </HudPanel>
      )}

      {/* ── Add/Edit Modal ──────────────────────────────────────────────── */}
      <Modal
        isOpen={showAddModal}
        onClose={closeModal}
        title={editingCommission ? 'Edit Commission' : 'Add Commission'}
        size="lg"
      >
        <div className="space-y-4">
          {/* Rep name with autocomplete-style select */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-white/50 mb-1.5">
                Rep Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  list="rep-names"
                  value={form.agentName}
                  onChange={(e) => updateForm('agentName', e.target.value)}
                  className="w-full bg-[#0D1321]/80 backdrop-blur-sm border border-[#1A2035] rounded-md px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#00D4FF]/50 focus:shadow-[0_0_12px_rgba(0,212,255,0.15)] transition-all"
                  placeholder="Rep name..."
                />
                <datalist id="rep-names">
                  {uniqueReps.map((rep) => (
                    <option key={rep} value={rep} />
                  ))}
                </datalist>
              </div>
            </div>
            <Select
              label="Client"
              options={clientOptions}
              value={form.clientId}
              onChange={(e) => updateForm('clientId', e.target.value)}
            />
          </div>

          <Input
            label="Deal Description"
            value={form.dealDescription}
            onChange={(e) => updateForm('dealDescription', e.target.value)}
            placeholder="Describe the deal..."
          />

          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Deal Value ($)"
              type="number"
              value={form.dealValue}
              onChange={(e) => updateForm('dealValue', Number(e.target.value))}
            />
            <Input
              label="Commission Rate (%)"
              type="number"
              value={form.rate}
              onChange={(e) => updateForm('rate', Number(e.target.value))}
            />
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-white/50 mb-1.5">
                Commission Amount
              </label>
              <div className="bg-[#0D1321]/80 border border-[#1A2035] rounded-md px-3 py-2 text-sm font-mono text-[#FFB800] font-semibold">
                {formatCurrency(form.amount)}
              </div>
              <p className="text-xs text-white/20 mt-1">Auto-calculated</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Status"
              options={STATUS_FORM_OPTIONS}
              value={form.status}
              onChange={(e) => updateForm('status', e.target.value)}
            />
            <Input
              label="Date Closed"
              type="date"
              value={form.date}
              onChange={(e) => updateForm('date', e.target.value)}
            />
            <Input
              label="Date Paid"
              type="date"
              value={form.datePaid}
              onChange={(e) => updateForm('datePaid', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-white/50 mb-1.5">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => updateForm('notes', e.target.value)}
              rows={2}
              className="w-full bg-[#0D1321]/80 backdrop-blur-sm border border-[#1A2035] rounded-md px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#00D4FF]/50 focus:shadow-[0_0_12px_rgba(0,212,255,0.15)] transition-all resize-none"
              placeholder="Additional notes..."
            />
          </div>

          {/* Save */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button variant="secondary" loading={saving} onClick={handleSave}>
              {editingCommission ? 'Update Commission' : 'Create Commission'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirmation Modal ───────────────────────────────────── */}
      <Modal
        isOpen={!!showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(null)}
        title="Delete Commission"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/60">
            Are you sure you want to <span className="text-[#FF3B3B] font-semibold">permanently delete</span> this
            commission record? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}
