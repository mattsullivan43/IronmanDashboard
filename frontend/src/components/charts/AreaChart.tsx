import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';

interface JarvisAreaChartProps {
  data: Array<Record<string, unknown>>;
  xKey: string;
  yKey: string | string[];
  color?: string | string[];
  gradientId?: string;
  height?: number;
  showGrid?: boolean;
  yFormatter?: (value: number) => string;
  xFormatter?: (value: string) => string;
}

const DEFAULT_COLORS = ['#00D4FF', '#FFB800', '#00FF88', '#FF3B3B'];

function GlassTooltip({ active, payload, label, xFormatter }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-[#0D1321]/95 backdrop-blur-xl border border-[#1A2035] rounded-lg px-4 py-3 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
      <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2 font-semibold">
        {xFormatter ? xFormatter(label) : label}
      </p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color, boxShadow: `0 0 6px ${entry.color}60` }}
          />
          <span className="text-white/60 text-xs">{entry.name}:</span>
          <span
            className="font-semibold font-['JetBrains_Mono',monospace] text-xs"
            style={{ color: entry.color }}
          >
            {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function JarvisAreaChart({
  data,
  xKey,
  yKey,
  color,
  gradientId = 'areaGradient',
  height = 300,
  showGrid = true,
  yFormatter,
  xFormatter,
}: JarvisAreaChartProps) {
  const keys = Array.isArray(yKey) ? yKey : [yKey];
  const colors = Array.isArray(color) ? color : color ? [color] : DEFAULT_COLORS;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            {keys.map((key, i) => {
              const c = colors[i % colors.length];
              return (
                <linearGradient key={key} id={`${gradientId}-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={c} stopOpacity={0} />
                </linearGradient>
              );
            })}
          </defs>
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="#1A2035" vertical={false} />
          )}
          <XAxis
            dataKey={xKey}
            stroke="#ffffff30"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#ffffff50', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
            tickFormatter={xFormatter}
          />
          <YAxis
            stroke="#ffffff30"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#ffffff50', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
            tickFormatter={yFormatter}
          />
          <Tooltip
            content={<GlassTooltip xFormatter={xFormatter} />}
            cursor={{ stroke: 'rgba(0, 212, 255, 0.1)' }}
          />
          {keys.map((key, i) => {
            const c = colors[i % colors.length];
            return (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={c}
                strokeWidth={2}
                fill={`url(#${gradientId}-${key})`}
                animationDuration={1200}
                animationEasing="ease-in-out"
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
