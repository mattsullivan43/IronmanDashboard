import { useEffect, useRef } from 'react';
import { useMotionValue, useTransform, animate, motion, useInView } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  decimals?: number;
  className?: string;
  mono?: boolean;
}

export default function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  duration = 1.5,
  decimals = 0,
  className = '',
  mono = true,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const motionValue = useMotionValue(0);
  const display = useTransform(motionValue, (latest) => {
    const formatted = (latest ?? 0).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return `${prefix}${formatted}${suffix}`;
  });

  useEffect(() => {
    if (isInView) {
      const controls = animate(motionValue, value ?? 0, {
        duration,
        ease: [0.25, 0.46, 0.45, 0.94],
      });
      return () => controls.stop();
    }
  }, [isInView, value, duration, motionValue]);

  return (
    <motion.span
      ref={ref}
      className={`${mono ? "font-['JetBrains_Mono',monospace]" : ''} ${className}`}
    >
      {display}
    </motion.span>
  );
}
