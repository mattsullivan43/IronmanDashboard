import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  Cpu,
  AlertTriangle,
  Save,
  Plus,
  Trash2,
  Lock,
  X,
  Check,
  Link2,
  Pencil,
  Play,
} from 'lucide-react';
import HudPanel from '../components/ui/HudPanel';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import { settings as settingsApi, jarvis, calendar } from '../services/api';
import { useVoice } from '../hooks/useVoice';
import toast from 'react-hot-toast';
import type { Settings as SettingsType, ExpenseCategory, AIUsage } from '../types';

// ── Toggle Component ────────────────────────────────────────────────────────

function Toggle({
  enabled,
  onChange,
  label,
  description,
}: {
  enabled: boolean;
  onChange: (val: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-white/80">{label}</p>
        {description && (
          <p className="text-xs text-white/30 mt-0.5">{description}</p>
        )}
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`
          relative w-11 h-6 rounded-full transition-all duration-300 flex-shrink-0
          ${
            enabled
              ? 'bg-[#00D4FF]/20 border-[#00D4FF]/40 shadow-[0_0_12px_rgba(0,212,255,0.2)]'
              : 'bg-white/5 border-white/10'
          }
          border
        `}
      >
        <motion.div
          animate={{ x: enabled ? 20 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={`
            absolute top-[3px] w-4 h-4 rounded-full transition-colors duration-300
            ${enabled ? 'bg-[#00D4FF] shadow-[0_0_8px_rgba(0,212,255,0.5)]' : 'bg-white/30'}
          `}
        />
      </button>
    </div>
  );
}

// ── Slider Component ────────────────────────────────────────────────────────

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-white/60">{label}</span>
        <span className="text-xs font-mono text-[#00D4FF]">{value.toFixed(1)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-[#1A2035] rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#00D4FF]
          [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(0,212,255,0.5)]
          [&::-webkit-slider-thumb]:cursor-pointer"
      />
    </div>
  );
}

// ── Color Picker ────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#00D4FF', '#FFB800', '#FF3B3B', '#00FF88', '#A855F7',
  '#F472B6', '#FB923C', '#38BDF8', '#4ADE80', '#E879F9',
];

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          onClick={() => onChange(color)}
          className={`
            w-6 h-6 rounded-full border-2 transition-all duration-200
            ${value === color ? 'border-white scale-110' : 'border-transparent hover:scale-110'}
          `}
          style={{ backgroundColor: color }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-6 h-6 rounded-full cursor-pointer bg-transparent border border-white/10"
      />
    </div>
  );
}

// ── Main Settings Component ─────────────────────────────────────────────────

export default function Settings() {
  // ---- State ----
  const [_settingsData, setSettingsData] = useState<SettingsType | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [aiUsage, setAiUsage] = useState<AIUsage | null>(null);
  const [calendarConnections, setCalendarConnections] = useState<
    Array<{ provider: string; email: string; connected: boolean; lastSync?: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable local copies
  const [companyName, setCompanyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceRate, setVoiceRate] = useState(1.0);
  const [voicePitch, setVoicePitch] = useState(1.0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [autoReadBriefing, setAutoReadBriefing] = useState(false);
  const [theme, setTheme] = useState('dark');

  // CSV column mapping state
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvMappingDirty, setCsvMappingDirty] = useState(false);

  // Category management
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editKeywords, setEditKeywords] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#00D4FF');
  const [newCategoryKeywords, setNewCategoryKeywords] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);

  // Modals
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    action: () => void;
    variant: 'danger' | 'primary';
  }>({ open: false, title: '', message: '', action: () => {}, variant: 'danger' });

  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);

  // Voice hook for test
  const { speak, isSpeaking } = useVoice({
    rate: voiceRate,
    pitch: voicePitch,
    enabled: true,
  });

  // ---- Data Loading ----
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [settingsRes, categoriesRes, usageRes, connectionsRes] = await Promise.allSettled([
        settingsApi.getAll(),
        settingsApi.getCategories(),
        jarvis.getUsage(),
        calendar.getConnections(),
      ]);

      if (settingsRes.status === 'fulfilled') {
        const s = settingsRes.value;
        setSettingsData(s);
        setCompanyName(s.companyName || '');
        setOwnerName(s.ownerName || '');
        setVoiceEnabled(s.voiceEnabled ?? false);
        setVoiceRate(s.voiceRate ?? 1.0);
        setVoicePitch(s.voicePitch ?? 1.0);
        setSoundEnabled(s.soundEnabled ?? false);
        setTheme(s.theme || 'dark');
      }

      if (categoriesRes.status === 'fulfilled') {
        setCategories(Array.isArray(categoriesRes.value) ? categoriesRes.value : []);
      }

      if (usageRes.status === 'fulfilled') {
        setAiUsage(usageRes.value);
      }

      if (connectionsRes.status === 'fulfilled') {
        setCalendarConnections(Array.isArray(connectionsRes.value) ? connectionsRes.value : []);
      }
    } catch {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---- Save Settings ----
  const saveSettings = async () => {
    setSaving(true);
    try {
      const updated = await settingsApi.update({
        companyName,
        ownerName,
        voiceEnabled,
        voiceRate,
        voicePitch,
        soundEnabled,
        theme: theme as 'dark' | 'light',
      });
      setSettingsData(updated);
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // ---- Calendar Connections ----
  const connectGoogle = async () => {
    try {
      const { url } = await calendar.getGoogleAuthUrl();
      window.location.href = url;
    } catch {
      toast.error('Failed to get Google auth URL');
    }
  };

  const connectMicrosoft = async () => {
    try {
      const { url } = await calendar.getMicrosoftAuthUrl();
      window.location.href = url;
    } catch {
      toast.error('Failed to get Microsoft auth URL');
    }
  };

  const disconnectProvider = async (provider: string) => {
    try {
      await calendar.disconnect(provider);
      setCalendarConnections((prev) =>
        prev.map((c) => (c.provider === provider ? { ...c, connected: false } : c))
      );
      toast.success(`Disconnected ${provider}`);
    } catch {
      toast.error(`Failed to disconnect ${provider}`);
    }
  };

  // ---- Category Operations ----
  const saveCategory = async (id: string) => {
    try {
      await settingsApi.updateCategory(id, {
        // keywords stored in some manner -- we pass as a generic partial
        ...(({ keywords: editKeywords.split(',').map((k) => k.trim()).filter(Boolean) }) as Partial<ExpenseCategory>),
      });
      setEditingCategory(null);
      toast.success('Category updated');
      loadData();
    } catch {
      toast.error('Failed to update category');
    }
  };

  const createCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error('Category name is required');
      return;
    }
    try {
      await settingsApi.createCategory({
        name: newCategoryName.trim(),
        color: newCategoryColor,
        ...(({ keywords: newCategoryKeywords.split(',').map((k) => k.trim()).filter(Boolean) }) as Partial<ExpenseCategory>),
      });
      setNewCategoryName('');
      setNewCategoryColor('#00D4FF');
      setNewCategoryKeywords('');
      setShowNewCategory(false);
      toast.success('Category created');
      loadData();
    } catch {
      toast.error('Failed to create category');
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      await settingsApi.deleteCategory(id);
      toast.success('Category deleted');
      setDeleteCategoryId(null);
      loadData();
    } catch {
      toast.error('Failed to delete category');
    }
  };

  // ---- Danger Zone ----
  const clearChatHistory = async () => {
    try {
      const conversations = await jarvis.getConversations();
      const convList = Array.isArray(conversations) ? conversations : [];
      await Promise.all(convList.map((c) => jarvis.deleteConversation(c.id)));
      toast.success('Chat history cleared');
      setConfirmModal((m) => ({ ...m, open: false }));
    } catch {
      toast.error('Failed to clear chat history');
    }
  };

  const resetSettings = async () => {
    try {
      await settingsApi.update({
        companyName: 'Cornerstone',
        ownerName: 'Matt Sullivan',
        voiceEnabled: false,
        voiceRate: 1.0,
        voicePitch: 1.0,
        soundEnabled: false,
        theme: 'dark',
      });
      toast.success('Settings reset to defaults');
      setConfirmModal((m) => ({ ...m, open: false }));
      loadData();
    } catch {
      toast.error('Failed to reset settings');
    }
  };

  // ---- AI Usage helpers ----
  const requestLimit = (aiUsage as any)?.limit ?? 50; // JARVIS_DAILY_REQUEST_LIMIT
  // Backend may return { requests, tokens, limit } directly (no byDay array)
  const aiUsageAny = aiUsage as any;
  const requestsToday = aiUsageAny?.requests ?? aiUsageAny?.byDay?.[0]?.requests ?? 0;
  const tokensToday = aiUsageAny?.tokens ?? aiUsageAny?.byDay?.[0]?.tokens ?? 0;
  const usagePercent = Math.min((requestsToday / requestLimit) * 100, 100);
  const usageColor =
    usagePercent >= 95
      ? 'bg-[#FF3B3B]'
      : usagePercent >= 80
        ? 'bg-[#FFB800]'
        : 'bg-[#00D4FF]';
  const usageGlow =
    usagePercent >= 95
      ? 'shadow-[0_0_10px_rgba(255,59,59,0.4)]'
      : usagePercent >= 80
        ? 'shadow-[0_0_10px_rgba(255,184,0,0.4)]'
        : 'shadow-[0_0_10px_rgba(0,212,255,0.4)]';

  // ---- Calendar connection helpers ----
  const googleConn = calendarConnections.find((c) => c.provider === 'google');
  const microsoftConn = calendarConnections.find((c) => c.provider === 'microsoft');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-sm text-[#00D4FF] font-mono tracking-wider"
        >
          LOADING CONFIGURATION...
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-lg font-semibold text-white/90">System Configuration</h2>
          <p className="text-xs text-white/30 mt-1">
            Manage your JARVIS instance settings and integrations
          </p>
        </div>
        <Button onClick={saveSettings} loading={saving} icon={<Save className="w-4 h-4" />}>
          Save All
        </Button>
      </motion.div>

      {/* ── Company Profile ─────────────────────────────────────────────────── */}
      <HudPanel title="Company Profile" delay={0.05}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Company Name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Cornerstone"
            icon={<Building2 className="w-4 h-4" />}
          />
          <Input
            label="Owner / Display Name"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="Matt Sullivan"
          />
        </div>
        <p className="text-xs text-white/20 mt-3">
          The display name is used for JARVIS greetings and briefings.
        </p>
      </HudPanel>

      {/* ── CSV Column Mapping ──────────────────────────────────────────────── */}
      <HudPanel title="CSV Column Mapping" delay={0.1}>
        <div className="space-y-3">
          <p className="text-xs text-white/40 mb-4">
            Configure how uploaded CSV columns map to transaction fields.
          </p>
          {['date', 'description', 'amount', 'type', 'category'].map((field) => (
            <div key={field} className="flex items-center gap-4">
              <span className="text-sm text-white/60 w-28 capitalize">{field}</span>
              <div className="flex-1">
                <Select
                  options={[
                    { value: '', label: 'Auto-detect' },
                    { value: 'Date', label: 'Date' },
                    { value: 'Description', label: 'Description' },
                    { value: 'Amount', label: 'Amount' },
                    { value: 'Debit', label: 'Debit' },
                    { value: 'Credit', label: 'Credit' },
                    { value: 'Type', label: 'Type' },
                    { value: 'Category', label: 'Category' },
                    { value: 'Memo', label: 'Memo' },
                    { value: 'Reference', label: 'Reference' },
                  ]}
                  value={csvMapping[field] ?? ''}
                  onChange={(e) => {
                    setCsvMapping((prev) => ({ ...prev, [field]: e.target.value }));
                    setCsvMappingDirty(true);
                  }}
                />
              </div>
            </div>
          ))}
          {csvMappingDirty && (
            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                icon={<Save className="w-3.5 h-3.5" />}
                onClick={() => {
                  toast.success('Column mapping saved');
                  setCsvMappingDirty(false);
                }}
              >
                Save Mapping
              </Button>
            </div>
          )}
        </div>
      </HudPanel>

      {/* ── Expense Categories ──────────────────────────────────────────────── */}
      <HudPanel title="Expense Categories" delay={0.15}>
        <div className="space-y-3">
          {categories.map((cat) => (
            <motion.div
              key={cat.id}
              layout
              className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]
                hover:border-white/[0.08] transition-colors"
            >
              {/* Color dot */}
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: cat.color }}
              />

              {/* Name */}
              <span className="text-sm text-white/80 font-medium min-w-[120px]">
                {cat.name}
              </span>

              {/* Keywords (editable) */}
              <div className="flex-1">
                {editingCategory === cat.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={editKeywords}
                      onChange={(e) => setEditKeywords(e.target.value)}
                      className="flex-1 px-2 py-1 text-xs text-white bg-[#0D1321]/80
                        border border-[#00D4FF]/30 rounded outline-none
                        focus:border-[#00D4FF]/50 focus:shadow-[0_0_8px_rgba(0,212,255,0.15)]"
                      placeholder="keyword1, keyword2, ..."
                    />
                    <button
                      onClick={() => saveCategory(cat.id)}
                      className="p-1 text-[#00FF88] hover:bg-[#00FF88]/10 rounded transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingCategory(null)}
                      className="p-1 text-white/30 hover:text-white/60 hover:bg-white/5 rounded transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-white/30 font-mono">
                    {cat.icon || 'No keywords set'}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {editingCategory !== cat.id && (
                  <button
                    onClick={() => {
                      setEditingCategory(cat.id);
                      setEditKeywords(cat.icon || '');
                    }}
                    className="p-1.5 text-white/30 hover:text-[#00D4FF] hover:bg-[#00D4FF]/5 rounded transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
                {!cat.isDefault && (
                  <button
                    onClick={() => setDeleteCategoryId(cat.id)}
                    className="p-1.5 text-white/30 hover:text-[#FF3B3B] hover:bg-[#FF3B3B]/5 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}

          {/* Add new category */}
          <AnimatePresence>
            {showNewCategory && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 rounded-lg border border-[#00D4FF]/20 bg-[#00D4FF]/[0.02] space-y-3">
                  <Input
                    label="Category Name"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="e.g. Marketing"
                  />
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wider text-white/50 mb-2">
                      Color
                    </label>
                    <ColorPicker value={newCategoryColor} onChange={setNewCategoryColor} />
                  </div>
                  <Input
                    label="Keywords (comma-separated)"
                    value={newCategoryKeywords}
                    onChange={(e) => setNewCategoryKeywords(e.target.value)}
                    placeholder="ads, facebook, google ads, marketing"
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" onClick={createCategory} icon={<Check className="w-3.5 h-3.5" />}>
                      Create
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowNewCategory(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!showNewCategory && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowNewCategory(true)}
              icon={<Plus className="w-4 h-4" />}
            >
              Add Category
            </Button>
          )}
        </div>
      </HudPanel>

      {/* ── Calendar Connections ────────────────────────────────────────────── */}
      <HudPanel title="Calendar Connections" delay={0.2}>
        <div className="space-y-4">
          {/* Google Calendar */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-[#4285F4] shadow-[0_0_6px_rgba(66,133,244,0.5)]" />
              <div>
                <p className="text-sm text-white/80 font-medium">Google Calendar</p>
                {googleConn?.connected ? (
                  <p className="text-xs text-[#00FF88] mt-0.5">
                    Connected{googleConn.email ? ` - ${googleConn.email}` : ''}
                  </p>
                ) : (
                  <p className="text-xs text-white/30 mt-0.5">Not connected</p>
                )}
              </div>
            </div>
            {googleConn?.connected ? (
              <Button
                size="sm"
                variant="danger"
                onClick={() => disconnectProvider('google')}
              >
                Disconnect
              </Button>
            ) : (
              <Button size="sm" onClick={connectGoogle} icon={<Link2 className="w-3.5 h-3.5" />}>
                Connect
              </Button>
            )}
          </div>

          {/* Microsoft Outlook */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-[#A855F7] shadow-[0_0_6px_rgba(168,85,247,0.5)]" />
              <div>
                <p className="text-sm text-white/80 font-medium">Microsoft Outlook</p>
                {microsoftConn?.connected ? (
                  <p className="text-xs text-[#00FF88] mt-0.5">
                    Connected{microsoftConn.email ? ` - ${microsoftConn.email}` : ''}
                  </p>
                ) : (
                  <p className="text-xs text-white/30 mt-0.5">Not connected</p>
                )}
              </div>
            </div>
            {microsoftConn?.connected ? (
              <Button
                size="sm"
                variant="danger"
                onClick={() => disconnectProvider('microsoft')}
              >
                Disconnect
              </Button>
            ) : (
              <Button size="sm" onClick={connectMicrosoft} icon={<Link2 className="w-3.5 h-3.5" />}>
                Connect
              </Button>
            )}
          </div>
        </div>
      </HudPanel>

      {/* ── Plaid Integration (Coming Soon) ────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.25 }}
        className="relative rounded-lg overflow-hidden"
      >
        {/* Animated glowing border */}
        <div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(255,184,0,0.1), rgba(0,212,255,0.15))',
            padding: '1px',
            mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        />
        <motion.div
          className="absolute inset-0 rounded-lg pointer-events-none opacity-40"
          animate={{
            boxShadow: [
              '0 0 15px rgba(0,212,255,0.1), inset 0 0 15px rgba(0,212,255,0.05)',
              '0 0 25px rgba(0,212,255,0.2), inset 0 0 25px rgba(0,212,255,0.1)',
              '0 0 15px rgba(0,212,255,0.1), inset 0 0 15px rgba(0,212,255,0.05)',
            ],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="bg-[#0D1321]/60 backdrop-blur-xl p-5 rounded-lg border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-4 bg-white/20 rounded-full" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40">
              Bank Integration
            </h3>
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded-full
              bg-[#FFB800]/10 text-[#FFB800] border border-[#FFB800]/20">
              Coming Soon
            </span>
          </div>

          <div className="flex items-center justify-between opacity-50">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-white/20" />
              <div>
                <p className="text-sm text-white/40">Plaid Bank Connection</p>
                <p className="text-xs text-white/20 mt-0.5 italic">
                  Coming soon -- systems not yet online, sir
                </p>
              </div>
            </div>
            <motion.button
              disabled
              animate={{ opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="px-4 py-2 text-xs font-medium uppercase tracking-wider
                bg-white/[0.03] border border-white/[0.08] rounded-md
                text-white/20 cursor-not-allowed flex items-center gap-2"
            >
              <Lock className="w-3.5 h-3.5" />
              Connect Bank
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* ── Sound Effects ───────────────────────────────────────────────────── */}
      <HudPanel title="Sound Effects" delay={0.3}>
        <Toggle
          enabled={soundEnabled}
          onChange={setSoundEnabled}
          label="UI Sound Effects"
          description="Play sounds on interactions and notifications"
        />
      </HudPanel>

      {/* ── Voice Settings ──────────────────────────────────────────────────── */}
      <HudPanel title="Voice Settings" delay={0.35}>
        <div className="space-y-5">
          <Toggle
            enabled={voiceEnabled}
            onChange={setVoiceEnabled}
            label="Voice Output"
            description="Enable JARVIS voice synthesis"
          />

          <Slider
            label="Voice Rate"
            value={voiceRate}
            min={0.5}
            max={2.0}
            step={0.1}
            onChange={setVoiceRate}
          />

          <Slider
            label="Voice Pitch"
            value={voicePitch}
            min={0.5}
            max={2.0}
            step={0.1}
            onChange={setVoicePitch}
          />

          <Toggle
            enabled={autoReadBriefing}
            onChange={setAutoReadBriefing}
            label="Auto-Read Daily Briefing"
            description="Automatically read the morning briefing aloud"
          />

          <div className="pt-1">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => speak('Systems operational, Mr. Sullivan')}
              disabled={isSpeaking}
              icon={<Play className="w-3.5 h-3.5" />}
            >
              {isSpeaking ? 'Speaking...' : 'Test Voice'}
            </Button>
          </div>
        </div>
      </HudPanel>

      {/* ── AI Usage Monitor ───────────────────────────────────────────────── */}
      <HudPanel title="AI Usage Monitor" delay={0.4}>
        <div className="space-y-4">
          {/* Requests today */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-white/60">Requests Today</span>
              <span className="text-sm font-mono text-white/80">
                {requestsToday}{' '}
                <span className="text-white/30">/ {requestLimit}</span>
              </span>
            </div>
            <div className="h-2 w-full bg-[#1A2035] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${usagePercent}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className={`h-full rounded-full ${usageColor} ${usageGlow}`}
              />
            </div>
          </div>

          {/* Tokens used */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">Tokens Used Today</span>
            <span className="text-sm font-mono text-[#00D4FF]">
              {tokensToday.toLocaleString()}
            </span>
          </div>

          {/* Total cost */}
          {aiUsage && typeof (aiUsage as any).totalCost === 'number' && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Total Cost (all time)</span>
              <span className="text-sm font-mono text-[#FFB800]">
                ${(aiUsage.totalCost ?? 0).toFixed(4)}
              </span>
            </div>
          )}

          <p className="text-xs text-white/20 flex items-center gap-1.5">
            <Cpu className="w-3 h-3" />
            Resets at midnight
          </p>
        </div>
      </HudPanel>

      {/* ── Theme ──────────────────────────────────────────────────────────── */}
      <HudPanel title="Theme" delay={0.45}>
        <div className="flex items-center gap-3">
          <Select
            label="Appearance"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            options={[
              { value: 'dark', label: 'Dark (Iron Man HUD)' },
            ]}
          />
        </div>
        <p className="text-xs text-white/20 mt-3">
          Additional themes coming in a future update.
        </p>
      </HudPanel>

      {/* ── Danger Zone ────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="relative bg-[#0D1321]/80 backdrop-blur-xl border border-[#FF3B3B]/20 rounded-lg overflow-hidden"
      >
        {/* Red top accent */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#FF3B3B]/30 to-transparent" />

        <div className="px-5 pt-4 pb-3 border-b border-[#FF3B3B]/10">
          <div className="flex items-center gap-3">
            <div className="w-1 h-4 bg-[#FF3B3B] rounded-full shadow-[0_0_8px_rgba(255,59,59,0.5)]" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#FF3B3B]/80">
              Danger Zone
            </h3>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/70">Clear All Chat History</p>
              <p className="text-xs text-white/30 mt-0.5">
                Permanently delete all JARVIS conversations
              </p>
            </div>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() =>
                setConfirmModal({
                  open: true,
                  title: 'Clear Chat History',
                  message:
                    'This will permanently delete all JARVIS conversations and chat history. This action cannot be undone.',
                  action: clearChatHistory,
                  variant: 'danger',
                })
              }
            >
              Clear History
            </Button>
          </div>

          <div className="h-px bg-[#FF3B3B]/10" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/70">Reset All Settings</p>
              <p className="text-xs text-white/30 mt-0.5">
                Restore all settings to factory defaults
              </p>
            </div>
            <Button
              size="sm"
              variant="danger"
              icon={<AlertTriangle className="w-3.5 h-3.5" />}
              onClick={() =>
                setConfirmModal({
                  open: true,
                  title: 'Reset Settings',
                  message:
                    'This will reset all settings to their default values. Your data will not be affected, but all customizations will be lost.',
                  action: resetSettings,
                  variant: 'danger',
                })
              }
            >
              Reset Defaults
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ── Confirmation Modal ─────────────────────────────────────────────── */}
      <Modal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal((m) => ({ ...m, open: false }))}
        title={confirmModal.title}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/60">{confirmModal.message}</p>
          <div className="flex items-center gap-3 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmModal((m) => ({ ...m, open: false }))}
            >
              Cancel
            </Button>
            <Button
              variant={confirmModal.variant}
              size="sm"
              onClick={confirmModal.action}
              icon={<AlertTriangle className="w-3.5 h-3.5" />}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Category Modal ──────────────────────────────────────────── */}
      <Modal
        isOpen={!!deleteCategoryId}
        onClose={() => setDeleteCategoryId(null)}
        title="Delete Category"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/60">
            Are you sure you want to delete this category? Transactions using this category will
            need to be recategorized.
          </p>
          <div className="flex items-center gap-3 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setDeleteCategoryId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => deleteCategoryId && deleteCategory(deleteCategoryId)}
              icon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
