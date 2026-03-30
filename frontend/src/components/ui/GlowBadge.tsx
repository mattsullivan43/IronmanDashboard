import { motion } from 'framer-motion';

type BadgeStatus = 'good' | 'warning' | 'danger';

interface GlowBadgeProps {
  status: BadgeStatus;
  label: string;
  value?: string;
}

const statusConfig: Record<BadgeStatus, { color: string; bg: string; glow: string; dot: string }> = {
  good: {
    color: 'text-[#00FF88]',
    bg: 'bg-[#00FF88]/10',
    glow: 'shadow-[0_0_8px_rgba(0,255,136,0.3)]',
    dot: 'bg-[#00FF88]',
  },
  warning: {
    color: 'text-[#FFB800]',
    bg: 'bg-[#FFB800]/10',
    glow: 'shadow-[0_0_8px_rgba(255,184,0,0.3)]',
    dot: 'bg-[#FFB800]',
  },
  danger: {
    color: 'text-[#FF3B3B]',
    bg: 'bg-[#FF3B3B]/10',
    glow: 'shadow-[0_0_8px_rgba(255,59,59,0.3)]',
    dot: 'bg-[#FF3B3B]',
  },
};

export default function GlowBadge({ status, label, value }: GlowBadgeProps) {
  const config = statusConfig[status];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`
        inline-flex items-center gap-2 px-3 py-1.5 rounded-full
        ${config.bg} ${config.glow}
        border border-current/10
        ${config.color}
      `}
    >
      {/* Pulsing dot */}
      <span className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full rounded-full ${config.dot} opacity-75 animate-ping`}
        />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${config.dot}`} />
      </span>

      <span className="text-xs font-medium uppercase tracking-wider">{label}</span>

      {value && (
        <span className={`text-xs font-semibold font-['JetBrains_Mono',monospace] ${config.color}`}>
          {value}
        </span>
      )}
    </motion.div>
  );
}
