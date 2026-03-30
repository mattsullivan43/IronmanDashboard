import { ButtonHTMLAttributes, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-[#00D4FF]/10 border-[#00D4FF]/40 text-[#00D4FF]
    hover:bg-[#00D4FF]/20 hover:border-[#00D4FF]/60
    hover:shadow-[0_0_20px_rgba(0,212,255,0.3)]
    active:bg-[#00D4FF]/30
  `,
  secondary: `
    bg-[#FFB800]/10 border-[#FFB800]/40 text-[#FFB800]
    hover:bg-[#FFB800]/20 hover:border-[#FFB800]/60
    hover:shadow-[0_0_20px_rgba(255,184,0,0.3)]
    active:bg-[#FFB800]/30
  `,
  danger: `
    bg-[#FF3B3B]/10 border-[#FF3B3B]/40 text-[#FF3B3B]
    hover:bg-[#FF3B3B]/20 hover:border-[#FF3B3B]/60
    hover:shadow-[0_0_20px_rgba(255,59,59,0.3)]
    active:bg-[#FF3B3B]/30
  `,
  ghost: `
    bg-transparent border-transparent text-white/60
    hover:bg-white/5 hover:text-white/90 hover:border-[#1A2035]
    active:bg-white/10
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2.5',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: disabled || loading ? 1 : 1.02 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
      transition={{ duration: 0.15 }}
      className={`
        inline-flex items-center justify-center font-medium
        border rounded-md
        transition-all duration-200
        backdrop-blur-sm
        disabled:opacity-40 disabled:cursor-not-allowed
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      disabled={disabled || loading}
      {...(props as any)}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </motion.button>
  );
}
