import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface HudPanelProps {
  title?: string;
  children: ReactNode;
  className?: string;
  delay?: number;
}

function CornerBracket({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const base = 'absolute w-4 h-4 pointer-events-none';
  const borderColor = 'border-[#00D4FF]/40';

  const positionClasses: Record<string, string> = {
    tl: `top-0 left-0 border-t border-l ${borderColor}`,
    tr: `top-0 right-0 border-t border-r ${borderColor}`,
    bl: `bottom-0 left-0 border-b border-l ${borderColor}`,
    br: `bottom-0 right-0 border-b border-r ${borderColor}`,
  };

  return <div className={`${base} ${positionClasses[position]}`} />;
}

export default function HudPanel({ title, children, className = '', delay = 0 }: HudPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className={`
        relative
        bg-[#0D1321]/80 backdrop-blur-xl
        border border-[#1A2035]
        rounded-lg
        overflow-hidden
        ${className}
      `}
    >
      {/* Corner brackets */}
      <CornerBracket position="tl" />
      <CornerBracket position="tr" />
      <CornerBracket position="bl" />
      <CornerBracket position="br" />

      {/* Subtle top edge glow */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00D4FF]/20 to-transparent" />

      {/* Title bar */}
      {title && (
        <div className="px-5 pt-4 pb-3 border-b border-[#1A2035]/60">
          <div className="flex items-center gap-3">
            {/* Accent line */}
            <div className="w-1 h-4 bg-[#00D4FF] rounded-full shadow-[0_0_8px_rgba(0,212,255,0.5)]" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/90 text-glow-blue">
              {title}
            </h3>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-5">
        {children}
      </div>
    </motion.div>
  );
}
