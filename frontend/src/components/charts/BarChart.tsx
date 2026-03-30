import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { motion } from 'framer-motion';

interface BarSeries {
  dataKey: string;
  color: string;
  name?: string;
}

interface JarvisBarChartProps {
  data: Array<Record<string, unknown>>;
  xKey: string;
  bars: BarSeries[];
  height?: number;
  showGrid?: boolean;
  yFormatter?: (value: number) => string;
  xFormatter?: (value: string) => string;
  stacked?: boolean;
  barSize?: number;
}

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

export default function JarvisBarChart({
  data,
  xKey,
  bars,
  height = 300,
  showGrid = true,
  yFormatter,
  xFormatter,
  stacked = false,
  barSize,
}: JarvisBarChartProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          barSize={barSize}
        >
          <defs>
            {bars.map((bar) => (
              <linearGradient
                key={bar.dataKey}
                id={`bar-grad-${bar.dataKey}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={bar.color} stopOpacity={0.9} />
                <stop offset="100%" stopColor={bar.color} stopOpacity={0.4} />
              </linearGradient>
            ))}
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
            cursor={{ fill: 'rgba(0, 212, 255, 0.05)' }}
          />
          <Legend
            wrapperStyle={{
              color: '#ffffff80',
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
          {bars.map((bar) => (
            <Bar
              key={bar.dataKey}
              dataKey={bar.dataKey}
              name={bar.name || bar.dataKey}
              fill={`url(#bar-grad-${bar.dataKey})`}
              radius={[4, 4, 0, 0]}
              animationDuration={1000}
              animationEasing="ease-in-out"
              stackId={stacked ? 'stack' : undefined}
            >
              {data.map((_, idx) => (
                <Cell
                  key={idx}
                  style={{ filter: `drop-shadow(0 0 4px ${bar.color}40)` }}
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
