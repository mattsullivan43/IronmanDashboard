import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';
import { useState } from 'react';

type Preset = '7d' | '30d' | '90d' | '6m' | '12m' | 'ytd' | 'custom';

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onRangeChange: (start: string, end: string) => void;
}

function getPresetDates(preset: Preset): { start: string; end: string } | null {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  const d = new Date(now);

  switch (preset) {
    case '7d':
      d.setDate(d.getDate() - 7);
      return { start: d.toISOString().split('T')[0], end };
    case '30d':
      d.setDate(d.getDate() - 30);
      return { start: d.toISOString().split('T')[0], end };
    case '90d':
      d.setDate(d.getDate() - 90);
      return { start: d.toISOString().split('T')[0], end };
    case '6m':
      d.setMonth(d.getMonth() - 6);
      return { start: d.toISOString().split('T')[0], end };
    case '12m':
      d.setFullYear(d.getFullYear() - 1);
      return { start: d.toISOString().split('T')[0], end };
    case 'ytd':
      return { start: `${now.getFullYear()}-01-01`, end };
    default:
      return null;
  }
}

const presets: { key: Preset; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: '6m', label: '6M' },
  { key: '12m', label: '12M' },
  { key: 'ytd', label: 'YTD' },
];

export default function DateRangeFilter({ startDate, endDate, onRangeChange }: DateRangeFilterProps) {
  const [activePreset, setActivePreset] = useState<Preset>('6m');

  const handlePreset = (preset: Preset) => {
    const dates = getPresetDates(preset);
    if (dates) {
      setActivePreset(preset);
      onRangeChange(dates.start, dates.end);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex items-center gap-3 flex-wrap"
    >
      {/* Preset buttons */}
      <div className="flex items-center gap-1 bg-jarvis-card/60 border border-jarvis-border rounded-lg p-1">
        {presets.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handlePreset(key)}
            className={`
              px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md
              transition-all duration-200
              ${
                activePreset === key
                  ? 'bg-jarvis-blue/20 text-jarvis-blue shadow-[0_0_8px_rgba(0,212,255,0.2)]'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              }
            `}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Date inputs */}
      <div className="flex items-center gap-2">
        <Calendar className="w-3.5 h-3.5 text-white/30" />
        <input
          type="date"
          value={startDate}
          onChange={(e) => {
            setActivePreset('custom');
            onRangeChange(e.target.value, endDate);
          }}
          className="bg-jarvis-card/60 border border-jarvis-border rounded-md px-2.5 py-1.5 text-xs text-white/70 font-mono
            focus:outline-none focus:border-jarvis-blue/50 focus:shadow-[0_0_8px_rgba(0,212,255,0.15)]
            [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-40"
        />
        <span className="text-white/20 text-xs">to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => {
            setActivePreset('custom');
            onRangeChange(startDate, e.target.value);
          }}
          className="bg-jarvis-card/60 border border-jarvis-border rounded-md px-2.5 py-1.5 text-xs text-white/70 font-mono
            focus:outline-none focus:border-jarvis-blue/50 focus:shadow-[0_0_8px_rgba(0,212,255,0.15)]
            [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-40"
        />
      </div>
    </motion.div>
  );
}

export { DateRangeFilter };
