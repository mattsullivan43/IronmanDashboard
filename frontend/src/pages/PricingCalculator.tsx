import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, Zap } from 'lucide-react';
import HudPanel from '../components/ui/HudPanel';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { formatCurrency } from '../utils/format';

// ── Stagger animation helpers ──────────────────────────────────────────────

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

// ── Currency display helper ────────────────────────────────────────────────

function MonoAmount({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`font-mono text-[#00D4FF] ${className}`}>
      {formatCurrency(value, { decimals: value % 1 !== 0 ? 2 : 0 })}
    </span>
  );
}

function SummaryRow({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-2 ${accent ? 'border-t border-[#00D4FF]/20 mt-2 pt-3' : ''}`}>
      <span className={`text-sm ${accent ? 'text-white font-semibold uppercase tracking-wider' : 'text-white/60'}`}>
        {label}
      </span>
      <MonoAmount
        value={value}
        className={accent ? 'text-lg font-bold drop-shadow-[0_0_8px_rgba(0,212,255,0.5)]' : 'text-sm'}
      />
    </div>
  );
}

// ── AI Receptionist Calculator ──────────────────────────────────────────────

function AIReceptionistCalc() {
  const [annualRevenue, setAnnualRevenue] = useState<string>('');

  const results = useMemo(() => {
    const rev = parseFloat(annualRevenue.replace(/,/g, '')) || 0;
    const setupFee = rev * 0.005;
    const monthlyFee = Math.max(rev * 0.00025, 275);
    const annualRecurring = monthlyFee * 12;
    const firstYearTotal = setupFee + annualRecurring;
    return { setupFee, monthlyFee, annualRecurring, firstYearTotal, hasInput: rev > 0 };
  }, [annualRevenue]);

  return (
    <HudPanel title="AI Receptionist Pricing" delay={0.1}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input */}
        <div className="space-y-4">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-4">Client Parameters</p>
          <Input
            label="Client's Annual Revenue"
            icon={<DollarSign size={16} />}
            placeholder="e.g. 2,000,000"
            value={annualRevenue}
            onChange={(e) => setAnnualRevenue(e.target.value)}
            className="font-mono"
          />
          <div className="text-xs text-white/30 space-y-1 mt-3 font-mono">
            <p>Setup Fee = 0.5% of annual revenue</p>
            <p>Monthly Fee = 0.025% of annual revenue (min $275/mo)</p>
          </div>
        </div>

        {/* Output */}
        <div className="space-y-1">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-4">Pricing Output</p>
          {results.hasInput ? (
            <div className="space-y-1">
              <SummaryRow label="Setup Fee (one-time)" value={results.setupFee} />
              <SummaryRow label="Monthly Fee" value={results.monthlyFee} />
              <SummaryRow label="Annual Recurring (12 mo)" value={results.annualRecurring} />
              <SummaryRow label="First Year Total" value={results.firstYearTotal} accent />
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-white/20 text-sm font-mono">
              Enter revenue to calculate
            </div>
          )}
        </div>
      </div>
    </HudPanel>
  );
}

// ── BoomLine Calculator ─────────────────────────────────────────────────────

const QB_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'desktop', label: 'Desktop — $2,750' },
  { value: 'online', label: 'Online — $2,000' },
];

const QB_COSTS: Record<string, number> = {
  none: 0,
  desktop: 2750,
  online: 2000,
};

function BoomLineCalc() {
  const [mobileApps, setMobileApps] = useState<string>('0');
  const [superAdmin, setSuperAdmin] = useState<string>('0');
  const [admin, setAdmin] = useState<string>('0');
  const [foreman, setForeman] = useState<string>('0');
  const [mechanics, setMechanics] = useState<string>('0');
  const [qbType, setQbType] = useState<string>('none');
  const [totalItems, setTotalItems] = useState<string>('0');

  const results = useMemo(() => {
    const nMobile = parseInt(mobileApps) || 0;
    const nSuper = parseInt(superAdmin) || 0;
    const nAdmin = parseInt(admin) || 0;
    const nForeman = parseInt(foreman) || 0;
    const nMechanics = parseInt(mechanics) || 0;
    const items = parseInt(totalItems) || 0;

    // License costs — mobile app licenses are $0 each (free with seat purchases)
    const licenseSubtotal =
      nMobile * 0 +
      nSuper * 5000 +
      nAdmin * 2500 +
      nForeman * 1500 +
      nMechanics * 500;

    const qbCost = QB_COSTS[qbType] ?? 0;
    const qbSelected = qbType !== 'none';

    // Annual support & maintenance: 23% of license subtotal + $200 QB support if QB selected
    const annualSupport = licenseSubtotal * 0.23 + (qbSelected ? 200 : 0);

    // Cloud hosting
    const cloudSetup = items * 120;
    const cloudMonthly = items * 12;

    // Totals
    const totalUpfront = licenseSubtotal + qbCost + cloudSetup;
    const totalMonthly = cloudMonthly;
    const totalAnnual = annualSupport + cloudMonthly * 12;
    const firstYearTotal = totalUpfront + totalAnnual;

    const hasInput = licenseSubtotal > 0 || qbCost > 0 || items > 0;

    return {
      licenseSubtotal,
      qbCost,
      qbSelected,
      annualSupport,
      cloudSetup,
      cloudMonthly,
      totalUpfront,
      totalMonthly,
      totalAnnual,
      firstYearTotal,
      hasInput,
    };
  }, [mobileApps, superAdmin, admin, foreman, mechanics, qbType, totalItems]);

  return (
    <HudPanel title="BoomLine Pricing" delay={0.2}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Inputs */}
        <div className="space-y-4">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-4">Seat Configuration</p>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Mobile App Licenses"
              type="number"
              min="0"
              value={mobileApps}
              onChange={(e) => setMobileApps(e.target.value)}
              className="font-mono"
            />
            <Input
              label="Super Admin Seats ($5,000 ea)"
              type="number"
              min="0"
              value={superAdmin}
              onChange={(e) => setSuperAdmin(e.target.value)}
              className="font-mono"
            />
            <Input
              label="Admin Seats ($2,500 ea)"
              type="number"
              min="0"
              value={admin}
              onChange={(e) => setAdmin(e.target.value)}
              className="font-mono"
            />
            <Input
              label="Foreman Views ($1,500 ea)"
              type="number"
              min="0"
              value={foreman}
              onChange={(e) => setForeman(e.target.value)}
              className="font-mono"
            />
            <Input
              label="Mechanics Views ($500 ea)"
              type="number"
              min="0"
              value={mechanics}
              onChange={(e) => setMechanics(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="pt-2">
            <Select
              label="QuickBooks Integration"
              options={QB_OPTIONS}
              value={qbType}
              onChange={(e) => setQbType(e.target.value)}
            />
          </div>

          <div className="pt-2">
            <Input
              label="Total Items (units + cranes) for Cloud Hosting"
              type="number"
              min="0"
              value={totalItems}
              onChange={(e) => setTotalItems(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>

        {/* Outputs */}
        <div className="space-y-1">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-4">Pricing Breakdown</p>
          {results.hasInput ? (
            <div className="space-y-1">
              <SummaryRow label="License Subtotal" value={results.licenseSubtotal} />
              <SummaryRow label="QuickBooks Integration" value={results.qbCost} />
              <SummaryRow label="Cloud Hosting Setup" value={results.cloudSetup} />

              <div className="border-t border-[#1A2035] my-3" />

              <SummaryRow label="Annual Support & Maintenance (23%)" value={results.annualSupport} />
              <SummaryRow label="Cloud Hosting Monthly" value={results.cloudMonthly} />

              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-white/60">Custom Work</span>
                <span className="font-mono text-sm text-[#00D4FF]/70">$150/hr</span>
              </div>

              <div className="border-t border-[#1A2035] my-3" />

              <SummaryRow label="Total Upfront" value={results.totalUpfront} accent />
              <SummaryRow label="Total Monthly" value={results.totalMonthly} accent />
              <SummaryRow label="Total Annual" value={results.totalAnnual} accent />

              <div className="mt-4 p-4 rounded-lg bg-[#00D4FF]/5 border border-[#00D4FF]/20">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Zap size={16} className="text-[#00D4FF]" />
                    <span className="text-sm font-semibold uppercase tracking-wider text-white">
                      First Year Total
                    </span>
                  </div>
                  <MonoAmount
                    value={results.firstYearTotal}
                    className="text-xl font-bold drop-shadow-[0_0_12px_rgba(0,212,255,0.6)]"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-white/20 text-sm font-mono">
              Configure seats to calculate
            </div>
          )}
        </div>
      </div>
    </HudPanel>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function PricingCalculator() {
  return (
    <motion.div
      variants={stagger.container}
      initial="hidden"
      animate="show"
      className="space-y-6 max-w-7xl mx-auto"
    >
      {/* Page header */}
      <motion.div variants={stagger.item} className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-[#00D4FF]/10 border border-[#00D4FF]/20">
          <DollarSign size={20} className="text-[#00D4FF]" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-wide text-white">Pricing Calculator</h1>
          <p className="text-xs text-white/40 font-mono tracking-wider">
            REAL-TIME DEAL CONFIGURATOR
          </p>
        </div>
      </motion.div>

      {/* AI Receptionist section */}
      <motion.div variants={stagger.item}>
        <AIReceptionistCalc />
      </motion.div>

      {/* BoomLine section */}
      <motion.div variants={stagger.item}>
        <BoomLineCalc />
      </motion.div>
    </motion.div>
  );
}
