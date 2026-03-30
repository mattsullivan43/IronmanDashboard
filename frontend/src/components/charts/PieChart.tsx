import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';

interface PieSlice {
  name: string;
  value: number;
}

interface JarvisPieChartProps {
  data: PieSlice[];
  colors?: string[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  valueFormatter?: (value: number) => string;
  centerLabel?: string;
  centerValue?: string;
}

const DEFAULT_COLORS = ['#00D4FF', '#FFB800', '#FF3B3B', '#00FF88', '#A855F7', '#F472B6'];

function GlassTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];

  return (
    <div className="bg-[#0D1321]/95 backdrop-blur-xl border border-[#1A2035] rounded-lg px-4 py-3 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
      <div className="flex items-center gap-2">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{
            backgroundColor: entry.payload.fill,
            boxShadow: `0 0 6px ${entry.payload.fill}60`,
          }}
        />
        <span className="text-white/60 text-xs">{entry.name}</span>
      </div>
      <p className="text-sm font-semibold font-['JetBrains_Mono',monospace] text-white mt-1">
        {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
      </p>
    </div>
  );
}

export default function JarvisPieChart({
  data,
  colors = DEFAULT_COLORS,
  height = 300,
  innerRadius = 60,
  outerRadius = 100,
  valueFormatter: _valueFormatter,
  centerLabel,
  centerValue,
}: JarvisPieChartProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6 }}
      className="relative"
    >
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={3}
            dataKey="value"
            animationDuration={1000}
            animationEasing="ease-in-out"
            stroke="none"
          >
            {data.map((_entry, index) => {
              const c = colors[index % colors.length];
              return (
                <Cell
                  key={`cell-${index}`}
                  fill={c}
                  style={{ filter: `drop-shadow(0 0 6px ${c}50)` }}
                />
              );
            })}
          </Pie>
          <Tooltip content={<GlassTooltip />} />
          <Legend
            wrapperStyle={{
              color: '#ffffff80',
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Center label for donut charts */}
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {centerValue && (
            <span className="text-xl font-bold text-white font-['JetBrains_Mono',monospace]">
              {centerValue}
            </span>
          )}
          {centerLabel && (
            <span className="text-[10px] uppercase tracking-wider text-white/40 mt-0.5">
              {centerLabel}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
