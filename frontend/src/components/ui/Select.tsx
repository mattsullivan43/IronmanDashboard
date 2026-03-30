import { SelectHTMLAttributes, forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, placeholder, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs font-medium uppercase tracking-wider text-white/50 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={`
              w-full appearance-none
              bg-[#0D1321]/80 backdrop-blur-sm
              border rounded-md
              px-3 py-2 pr-10 text-sm text-white
              transition-all duration-200
              outline-none cursor-pointer
              ${
                error
                  ? 'border-[#FF3B3B]/50 focus:border-[#FF3B3B] focus:shadow-[0_0_12px_rgba(255,59,59,0.2)]'
                  : 'border-[#1A2035] focus:border-[#00D4FF]/50 focus:shadow-[0_0_12px_rgba(0,212,255,0.15)]'
              }
              ${className}
            `}
            {...props}
          >
            {placeholder && (
              <option value="" className="bg-[#0D1321] text-white/40">
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[#0D1321] text-white">
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
        </div>
        {error && (
          <p className="mt-1 text-xs text-[#FF3B3B]">{error}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select;
