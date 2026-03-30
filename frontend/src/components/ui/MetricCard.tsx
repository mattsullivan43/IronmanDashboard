import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import AnimatedNumber from './AnimatedNumber';

export type HealthStatus = 'good' | 'warning' | 'danger' | 'neutral';

export interface MetricCardProps {
  label: string;
  children?: ReactNode;
  health?: HealthStatus;
  delay?: number;
  className?: string;
  footer?: ReactNode;
  // Smart card props (alternative to children)
  icon?: ReactNode;
  value?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  sparklineData?: number[];
  trend?: number;
}

const healthGlow: Record<string, string> = {
  good: 'shadow-[0_0_20px_rgba(0,255,136,0.15)]',
  warning: 'shadow-[0_0_20px_rgba(255,184,0,0.15)]',
  danger: 'shadow-[0_0_20px_rgba(255,59,59,0.15)]',
  neutral: '',
};

const healthBorder: Record<string, string> = {
  good: 'border-[#00FF88]/20',
  warning: 'border-[#FFB800]/20',
  danger: 'border-[#FF3B3B]/20',
  neutral: 'border-[#1A2035]',
};

export function MetricCard({
  label,
  children,
  health,
  delay = 0,
  className = '',
  footer,
  icon,
  value,
  prefix,
  suffix,
  decimals = 0,
}: MetricCardProps) {
  const glow = health ? (healthGlow[health] || '') : '';
  const border = health ? (healthBorder[health] || 'border-[#1A2035]') : 'border-[#1A2035]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.6,
        delay,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className={`
        relative flex flex-col
        bg-[#0D1321]/80 backdrop-blur-xl
        border ${border}
        rounded-lg p-5
        overflow-hidden
        ${glow}
        ${className}
      `}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00D4FF]/20 to-transparent" />

      <div className="flex items-center gap-2 mb-2">
        {icon && <span className="text-[#00D4FF]/60">{icon}</span>}
        <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
          {label}
        </span>
      </div>

      <div className="flex-1">
        {children ?? (
          value !== undefined && (
            <AnimatedNumber
              value={value}
              prefix={prefix}
              suffix={suffix}
              decimals={decimals}
            />
          )
        )}
      </div>

      {footer && <div className="mt-3">{footer}</div>}
    </motion.div>
  );
}

export default MetricCard;
