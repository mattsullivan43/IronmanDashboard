import { InputHTMLAttributes, ReactNode, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs font-medium uppercase tracking-wider text-white/50 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={`
              w-full
              bg-[#0D1321]/80 backdrop-blur-sm
              border rounded-md
              px-3 py-2 text-sm text-white
              placeholder:text-white/20
              transition-all duration-200
              outline-none
              ${icon ? 'pl-10' : ''}
              ${
                error
                  ? 'border-[#FF3B3B]/50 focus:border-[#FF3B3B] focus:shadow-[0_0_12px_rgba(255,59,59,0.2)]'
                  : 'border-[#1A2035] focus:border-[#00D4FF]/50 focus:shadow-[0_0_12px_rgba(0,212,255,0.15)]'
              }
              ${className}
            `}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-1 text-xs text-[#FF3B3B]">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
