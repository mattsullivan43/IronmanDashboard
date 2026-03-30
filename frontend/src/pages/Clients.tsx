import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Plus,
  Search,
  LayoutGrid,
  List,
  Building2,
  Calendar,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronUp,
  Construction,
  Phone,
  Code2,
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
import { clients as clientsApi } from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';
import type { Client, ProductLine } from '../types';

// ── Constants ───────────────────────────────────────────────────────────────

const PRODUCT_LINE_CONFIG: Record<ProductLine, { label: string; color: string; border: string; bg: string; glow: string; icon: typeof Construction }> = {
  boomline: {
    label: 'BoomLine',
    color: 'text-[#00D4FF]',
    border: 'border-[#00D4FF]/30',
    bg: 'bg-[#00D4FF]/10',
    glow: 'shadow-[0_0_15px_rgba(0,212,255,0.15)]',
    icon: Construction,
  },
  ai_receptionist: {
    label: 'AI Receptionist',
    color: 'text-[#FFB800]',
    border: 'border-[#FFB800]/30',
    bg: 'bg-[#FFB800]/10',
    glow: 'shadow-[0_0_15px_rgba(255,184,0,0.15)]',
    icon: Phone,
  },
  custom_software: {
    label: 'Custom Software',
    color: 'text-[#00FF88]',
    border: 'border-[#00FF88]/30',
    bg: 'bg-[#00FF88]/10',
    glow: 'shadow-[0_0_15px_rgba(0,255,136,0.15)]',
    icon: Code2,
  },
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'churned', label: 'Churned' },
];

const PRODUCT_OPTIONS = [
  { value: 'all', label: 'All Products' },
  { value: 'boomline', label: 'BoomLine' },
  { value: 'ai_receptionist', label: 'AI Receptionist' },
  { value: 'custom_software', label: 'Custom Software' },
];

const PRODUCT_LINE_OPTIONS = [
  { value: 'boomline', label: 'BoomLine' },
  { value: 'ai_receptionist', label: 'AI Receptionist' },
  { value: 'custom_software', label: 'Custom Software' },
];

const STATUS_FORM_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'churned', label: 'Churned' },
];

type StatusBadge = 'good' | 'warning' | 'danger';

const statusToBadge: Record<string, StatusBadge> = {
  active: 'good',
  prospect: 'warning',
  churned: 'danger',
  inactive: 'danger',
};

// ── Empty form state ────────────────────────────────────────────────────────

const emptyForm: Partial<Client> = {
  name: '',
  company: '',
  contactName: '',
  email: '',
  productLine: 'boomline',
  status: 'active',
  startDate: new Date().toISOString().split('T')[0],
  contractTerms: '',
  notes: '',
  monthlyRevenue: 0,
  craneCount: 0,
  perCraneRate: 0,
  implementationFee: 0,
  implementationFeeCollected: false,
  setupFee: 0,
  setupFeeCollected: false,
  monthlyRecurringFee: 0,
  cogsPerMonth: 0,
  projectValue: 0,
  projectPaid: 0,
};

// ── Stats type ──────────────────────────────────────────────────────────────

interface ClientStats {
  total: number;
  active: number;
  inactive: number;
  prospect: number;
  totalRevenue: number;
  boomlineCount?: number;
  aiReceptionistCount?: number;
  customSoftwareCount?: number;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Clients() {
  // Data state
  const [clientList, setClientList] = useState<Client[]>([]);
  const [_stats, setStats] = useState<ClientStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [statusFilter, setStatusFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // View state
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState<Partial<Client>>(emptyForm);
  const [saving, setSaving] = useState(false);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchClients = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (searchQuery) params.search = searchQuery;
      const response = await clientsApi.list(params);
      setClientList(Array.isArray(response?.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    }
  }, [statusFilter, searchQuery]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await clientsApi.getStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchClients(), fetchStats()]).finally(() => setLoading(false));
  }, [fetchClients, fetchStats]);

  // ── Filtered data ─────────────────────────────────────────────────────────

  const filteredClients = useMemo(() => {
    let result = clientList;
    if (productFilter !== 'all') {
      result = result.filter((c) => c.productLine === productFilter);
    }
    // Client-side search for immediate feedback
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q) ||
          c.contactName?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [clientList, productFilter, searchQuery]);

  // ── Derived stats ─────────────────────────────────────────────────────────

  const derivedStats = useMemo(() => {
    const active = clientList.filter((c) => c.status === 'active');
    const boomline = active.filter((c) => c.productLine === 'boomline');
    const aiRec = active.filter((c) => c.productLine === 'ai_receptionist');
    const custom = active.filter((c) => c.productLine === 'custom_software');
    const totalMRR = active.reduce((sum, c) => sum + (c.monthlyRevenue || 0), 0);
    return {
      totalActive: active.length,
      boomlineCount: boomline.length,
      aiReceptionistCount: aiRec.length,
      customSoftwareCount: custom.length,
      totalMRR,
    };
  }, [clientList]);

  // ── Form handlers ─────────────────────────────────────────────────────────

  const updateForm = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const openAddModal = () => {
    setForm({ ...emptyForm });
    setEditingClient(null);
    setShowAddModal(true);
  };

  const openEditModal = (client: Client) => {
    setForm({ ...client });
    setEditingClient(client);
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingClient(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Auto-calculate monthly revenue for BoomLine
      const payload = { ...form };
      if (payload.productLine === 'boomline' && payload.craneCount && payload.perCraneRate) {
        payload.monthlyRevenue = payload.craneCount * payload.perCraneRate;
      }
      if (payload.productLine === 'ai_receptionist' && payload.monthlyRecurringFee) {
        payload.monthlyRevenue = payload.monthlyRecurringFee;
      }

      if (editingClient) {
        await clientsApi.update(editingClient.id, payload);
      } else {
        await clientsApi.create(payload);
      }
      closeModal();
      await Promise.all([fetchClients(), fetchStats()]);
    } catch (err) {
      console.error('Failed to save client:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleChurn = async (id: string) => {
    try {
      await clientsApi.update(id, { status: 'churned' });
      setShowDeleteConfirm(null);
      await Promise.all([fetchClients(), fetchStats()]);
    } catch (err) {
      console.error('Failed to churn client:', err);
    }
  };

  // ── Table columns ─────────────────────────────────────────────────────────

  const tableColumns: Column<Client>[] = [
    {
      key: 'company',
      header: 'Company',
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${PRODUCT_LINE_CONFIG[row.productLine]?.bg.replace('/10', '')} shadow-[0_0_6px] ${PRODUCT_LINE_CONFIG[row.productLine]?.color.replace('text-', 'shadow-')}`} />
          <span className="text-white font-medium">{row.company || row.name}</span>
        </div>
      ),
    },
    {
      key: 'productLine',
      header: 'Product',
      render: (row) => {
        const config = PRODUCT_LINE_CONFIG[row.productLine];
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config?.bg} ${config?.color}`}>
            {config?.label}
          </span>
        );
      },
    },
    {
      key: 'monthlyRevenue',
      header: 'MRR',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-[#00FF88]">{formatCurrency(row.monthlyRevenue)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <GlowBadge
          status={statusToBadge[row.status] ?? 'warning'}
          label={row.status}
        />
      ),
    },
    {
      key: 'craneCount',
      header: 'Cranes',
      align: 'center',
      render: (row) =>
        row.productLine === 'boomline' && row.craneCount ? (
          <span className="font-mono text-[#00D4FF]">{row.craneCount}</span>
        ) : (
          <span className="text-white/20">--</span>
        ),
    },
    {
      key: 'startDate',
      header: 'Contract Start',
      render: (row) => (
        <span className="text-white/60 text-xs">
          {row.startDate ? formatDate(row.startDate, 'MMM d, yyyy') : '--'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); openEditModal(row); }}
            className="p-1.5 rounded-md text-white/30 hover:text-[#00D4FF] hover:bg-[#00D4FF]/10 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(row.id); }}
            className="p-1.5 rounded-md text-white/30 hover:text-[#FF3B3B] hover:bg-[#FF3B3B]/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  // ── Product-specific form fields ──────────────────────────────────────────

  const renderProductFields = () => {
    const pl = form.productLine as ProductLine;

    if (pl === 'boomline') {
      return (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Crane Count"
              type="number"
              value={form.craneCount ?? 0}
              onChange={(e) => updateForm('craneCount', Number(e.target.value))}
            />
            <Input
              label="Per-Crane Rate ($/mo)"
              type="number"
              value={form.perCraneRate ?? 0}
              onChange={(e) => updateForm('perCraneRate', Number(e.target.value))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Implementation Fee"
              type="number"
              value={form.implementationFee ?? 0}
              onChange={(e) => updateForm('implementationFee', Number(e.target.value))}
            />
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.implementationFeeCollected ?? false}
                  onChange={(e) => updateForm('implementationFeeCollected', e.target.checked)}
                  className="w-4 h-4 rounded border-[#1A2035] bg-[#0D1321] text-[#00D4FF] focus:ring-[#00D4FF]/30"
                />
                <span className="text-xs text-white/60 uppercase tracking-wider">Fee Collected</span>
              </label>
            </div>
          </div>
          <div className="text-xs text-white/40">
            Auto-calculated MRR: <span className="text-[#00FF88] font-mono">{formatCurrency((form.craneCount ?? 0) * (form.perCraneRate ?? 0))}</span>
          </div>
        </>
      );
    }

    if (pl === 'ai_receptionist') {
      return (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Setup Fee"
              type="number"
              value={form.setupFee ?? 0}
              onChange={(e) => updateForm('setupFee', Number(e.target.value))}
            />
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.setupFeeCollected ?? false}
                  onChange={(e) => updateForm('setupFeeCollected', e.target.checked)}
                  className="w-4 h-4 rounded border-[#1A2035] bg-[#0D1321] text-[#00D4FF] focus:ring-[#00D4FF]/30"
                />
                <span className="text-xs text-white/60 uppercase tracking-wider">Setup Fee Collected</span>
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Monthly Recurring Fee"
              type="number"
              value={form.monthlyRecurringFee ?? 0}
              onChange={(e) => updateForm('monthlyRecurringFee', Number(e.target.value))}
            />
            <Input
              label="COGS / Month"
              type="number"
              value={form.cogsPerMonth ?? 0}
              onChange={(e) => updateForm('cogsPerMonth', Number(e.target.value))}
            />
          </div>
        </>
      );
    }

    if (pl === 'custom_software') {
      return (
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Project Value"
            type="number"
            value={form.projectValue ?? 0}
            onChange={(e) => updateForm('projectValue', Number(e.target.value))}
          />
          <Input
            label="Project Paid"
            type="number"
            value={form.projectPaid ?? 0}
            onChange={(e) => updateForm('projectPaid', Number(e.target.value))}
          />
        </div>
      );
    }

    return null;
  };

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
          <div className="w-1 h-8 bg-[#00D4FF] rounded-full shadow-[0_0_10px_rgba(0,212,255,0.5)]" />
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Clients</h1>
            <p className="text-sm text-white/40 mt-0.5">Manage your client portfolio</p>
          </div>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={openAddModal}>
          Add Client
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard label="Total Active" health="good" delay={0.05}>
          <AnimatedNumber
            value={derivedStats.totalActive}
            className="text-2xl font-bold text-white"
          />
        </MetricCard>
        <MetricCard label="BoomLine" delay={0.1}>
          <div className="flex items-center gap-2">
            <Construction className="w-4 h-4 text-[#00D4FF]" />
            <AnimatedNumber
              value={derivedStats.boomlineCount}
              className="text-2xl font-bold text-[#00D4FF]"
            />
          </div>
        </MetricCard>
        <MetricCard label="AI Receptionist" delay={0.15}>
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-[#FFB800]" />
            <AnimatedNumber
              value={derivedStats.aiReceptionistCount}
              className="text-2xl font-bold text-[#FFB800]"
            />
          </div>
        </MetricCard>
        <MetricCard label="Custom Software" delay={0.2}>
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-[#00FF88]" />
            <AnimatedNumber
              value={derivedStats.customSoftwareCount}
              className="text-2xl font-bold text-[#00FF88]"
            />
          </div>
        </MetricCard>
        <MetricCard label="Total MRR" health="good" delay={0.25}>
          <AnimatedNumber
            value={derivedStats.totalMRR}
            prefix="$"
            className="text-2xl font-bold text-[#00FF88]"
          />
        </MetricCard>
      </div>

      {/* Filter Bar */}
      <HudPanel delay={0.3}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              placeholder="Search clients..."
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
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
          <Select
            options={PRODUCT_OPTIONS}
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
          />
          <div className="flex items-center gap-1 bg-[#0D1321]/60 border border-[#1A2035] rounded-md p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-[#00D4FF]/15 text-[#00D4FF]' : 'text-white/30 hover:text-white/60'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'table' ? 'bg-[#00D4FF]/15 text-[#00D4FF]' : 'text-white/30 hover:text-white/60'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </HudPanel>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#00D4FF]/30 border-t-[#00D4FF] rounded-full animate-spin" />
        </div>
      ) : viewMode === 'grid' ? (
        /* ── Grid View ──────────────────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredClients.map((client, i) => {
              const config = PRODUCT_LINE_CONFIG[client.productLine];
              const Icon = config?.icon ?? Building2;
              const isExpanded = expandedClient === client.id;

              return (
                <motion.div
                  key={client.id}
                  layout
                  initial={{ opacity: 0, y: 20, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4, delay: i * 0.04 }}
                  className={`
                    relative
                    bg-[#0D1321]/80 backdrop-blur-xl
                    border ${config?.border ?? 'border-[#1A2035]'}
                    rounded-lg overflow-hidden
                    ${config?.glow ?? ''}
                    cursor-pointer
                    hover:border-opacity-60 transition-all duration-300
                  `}
                  onClick={() => setExpandedClient(isExpanded ? null : client.id)}
                >
                  {/* Top accent line */}
                  <div
                    className="absolute top-0 left-0 right-0 h-[2px]"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${
                        client.productLine === 'boomline' ? '#00D4FF' :
                        client.productLine === 'ai_receptionist' ? '#FFB800' : '#00FF88'
                      }40, transparent)`,
                    }}
                  />

                  <div className="p-5">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${config?.bg}`}>
                          <Icon className={`w-4 h-4 ${config?.color}`} />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-white">{client.company || client.name}</h3>
                          {client.contactName && (
                            <p className="text-xs text-white/40 mt-0.5">{client.contactName}</p>
                          )}
                        </div>
                      </div>
                      <GlowBadge
                        status={statusToBadge[client.status] ?? 'warning'}
                        label={client.status}
                      />
                    </div>

                    {/* Product badge & MRR */}
                    <div className="flex items-center justify-between mt-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config?.bg} ${config?.color}`}>
                        {config?.label}
                      </span>
                      <span className="text-lg font-bold font-mono text-[#00FF88]">
                        {formatCurrency(client.monthlyRevenue)}
                        <span className="text-xs text-white/30 ml-1">/mo</span>
                      </span>
                    </div>

                    {/* BoomLine crane count */}
                    {client.productLine === 'boomline' && client.craneCount && (
                      <div className="flex items-center gap-2 mt-3 text-xs text-white/50">
                        <Construction className="w-3.5 h-3.5 text-[#00D4FF]" />
                        <span>{client.craneCount} crane{client.craneCount !== 1 ? 's' : ''}</span>
                      </div>
                    )}

                    {/* Contract start */}
                    <div className="flex items-center gap-2 mt-2 text-xs text-white/30">
                      <Calendar className="w-3 h-3" />
                      <span>{client.startDate ? formatDate(client.startDate, 'MMM d, yyyy') : 'No start date'}</span>
                    </div>

                    {/* Expand indicator */}
                    <div className="flex justify-center mt-3">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-white/20" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-white/20" />
                      )}
                    </div>

                    {/* Expanded details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 pt-4 border-t border-[#1A2035] space-y-3">
                            {client.email && (
                              <div className="text-xs">
                                <span className="text-white/30 uppercase tracking-wider">Email:</span>
                                <span className="ml-2 text-white/70">{client.email}</span>
                              </div>
                            )}
                            {client.contractTerms && (
                              <div className="text-xs">
                                <span className="text-white/30 uppercase tracking-wider">Terms:</span>
                                <span className="ml-2 text-white/70">{client.contractTerms}</span>
                              </div>
                            )}
                            {client.notes && (
                              <div className="text-xs">
                                <span className="text-white/30 uppercase tracking-wider">Notes:</span>
                                <p className="mt-1 text-white/50 leading-relaxed">{client.notes}</p>
                              </div>
                            )}

                            {/* Product-specific details */}
                            {client.productLine === 'boomline' && (
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-white/30">Per-Crane Rate</span>
                                  <p className="text-[#00D4FF] font-mono">{formatCurrency(client.perCraneRate ?? 0)}</p>
                                </div>
                                <div>
                                  <span className="text-white/30">Impl. Fee</span>
                                  <p className="font-mono text-white/70">
                                    {formatCurrency(client.implementationFee ?? 0)}
                                    {client.implementationFeeCollected && (
                                      <span className="text-[#00FF88] ml-1">(paid)</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            )}
                            {client.productLine === 'ai_receptionist' && (
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-white/30">Setup Fee</span>
                                  <p className="font-mono text-white/70">
                                    {formatCurrency(client.setupFee ?? 0)}
                                    {client.setupFeeCollected && (
                                      <span className="text-[#00FF88] ml-1">(paid)</span>
                                    )}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-white/30">COGS/mo</span>
                                  <p className="text-[#FF3B3B] font-mono">{formatCurrency(client.cogsPerMonth ?? 0)}</p>
                                </div>
                              </div>
                            )}
                            {client.productLine === 'custom_software' && (
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-white/30">Project Value</span>
                                  <p className="text-[#00FF88] font-mono">{formatCurrency(client.projectValue ?? 0)}</p>
                                </div>
                                <div>
                                  <span className="text-white/30">Paid</span>
                                  <p className="font-mono text-white/70">{formatCurrency(client.projectPaid ?? 0)}</p>
                                </div>
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex items-center gap-2 pt-2">
                              <Button
                                size="sm"
                                icon={<Edit3 className="w-3.5 h-3.5" />}
                                onClick={(e) => { e.stopPropagation(); openEditModal(client); }}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                icon={<Trash2 className="w-3.5 h-3.5" />}
                                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(client.id); }}
                              >
                                Churn
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {filteredClients.length === 0 && (
            <div className="col-span-full text-center py-16 text-white/30">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No clients found</p>
            </div>
          )}
        </div>
      ) : (
        /* ── Table View ─────────────────────────────────────────────────── */
        <HudPanel title="Client Directory" delay={0.3}>
          <DataTable
            columns={tableColumns}
            data={filteredClients}
            keyExtractor={(row) => row.id}
            emptyMessage="No clients match your filters"
          />
        </HudPanel>
      )}

      {/* ── Add/Edit Modal ──────────────────────────────────────────────── */}
      <Modal
        isOpen={showAddModal}
        onClose={closeModal}
        title={editingClient ? 'Edit Client' : 'Add New Client'}
        size="lg"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          {/* Common fields */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Company Name"
              value={form.company ?? ''}
              onChange={(e) => updateForm('company', e.target.value)}
              placeholder="Acme Corp"
            />
            <Input
              label="Contact Name"
              value={form.contactName ?? ''}
              onChange={(e) => updateForm('contactName', e.target.value)}
              placeholder="John Doe"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={form.email ?? ''}
              onChange={(e) => updateForm('email', e.target.value)}
              placeholder="john@acme.com"
            />
            <Select
              label="Product Line"
              options={PRODUCT_LINE_OPTIONS}
              value={form.productLine ?? 'boomline'}
              onChange={(e) => updateForm('productLine', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Status"
              options={STATUS_FORM_OPTIONS}
              value={form.status ?? 'active'}
              onChange={(e) => updateForm('status', e.target.value)}
            />
            <Input
              label="Contract Start"
              type="date"
              value={form.startDate ?? ''}
              onChange={(e) => updateForm('startDate', e.target.value)}
            />
            <Input
              label="Contract Terms"
              value={form.contractTerms ?? ''}
              onChange={(e) => updateForm('contractTerms', e.target.value)}
              placeholder="12 months"
            />
          </div>

          {/* Divider */}
          <div className="border-t border-[#1A2035] pt-4">
            <p className="text-xs uppercase tracking-wider text-white/40 mb-3">
              {PRODUCT_LINE_CONFIG[form.productLine as ProductLine]?.label ?? 'Product'} Details
            </p>
            {renderProductFields()}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-white/50 mb-1.5">
              Notes
            </label>
            <textarea
              value={form.notes ?? ''}
              onChange={(e) => updateForm('notes', e.target.value)}
              rows={3}
              className="w-full bg-[#0D1321]/80 backdrop-blur-sm border border-[#1A2035] rounded-md px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#00D4FF]/50 focus:shadow-[0_0_12px_rgba(0,212,255,0.15)] transition-all resize-none"
              placeholder="Additional notes..."
            />
          </div>

          {/* Save button */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button loading={saving} onClick={handleSave}>
              {editingClient ? 'Update Client' : 'Create Client'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete (Churn) Confirmation Modal ───────────────────────────── */}
      <Modal
        isOpen={!!showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(null)}
        title="Confirm Churn"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/60">
            Are you sure you want to mark this client as <span className="text-[#FF3B3B] font-semibold">churned</span>?
            This will set their status to churned but preserve all records.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={() => showDeleteConfirm && handleChurn(showDeleteConfirm)}
            >
              Mark as Churned
            </Button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}
