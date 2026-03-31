import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Calculator,
  DollarSign,
  Flame,
  Construction,
  Bot,
  Users,
  Receipt,
  Upload,
  MessageSquare,
  Settings,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
  shortcut?: string;
}

const navItems: NavItem[] = [
  { label: 'Command Center', icon: LayoutDashboard, path: '/', shortcut: '1' },
  { label: 'Financials', icon: DollarSign, path: '/profitability', shortcut: '2' },
  { label: 'Cash & Burn', icon: Flame, path: '/cash-burn', shortcut: '3' },
  { label: 'Transactions', icon: Receipt, path: '/transactions', shortcut: '4' },
  { label: 'Clients', icon: Users, path: '/clients', shortcut: '5' },
  { label: 'BoomLine', icon: Construction, path: '/boomline', shortcut: '6' },
  { label: 'AI Receptionist', icon: Bot, path: '/ai-receptionist', shortcut: '7' },
  { label: 'Pricing', icon: Calculator, path: '/pricing', shortcut: '8' },
  { label: 'Statement Import', icon: Upload, path: '/csv-upload', shortcut: '9' },
  { label: 'JARVIS AI', icon: MessageSquare, path: '/jarvis' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

const SIDEBAR_EXPANDED = 260;
const SIDEBAR_COLLAPSED = 72;

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Find active index for the sliding indicator
  const activeIndex = navItems.findIndex(
    (item) =>
      item.path === '/'
        ? location.pathname === '/'
        : location.pathname.startsWith(item.path)
  );

  // Keyboard shortcuts: Cmd+1 through Cmd+9
  const handleKeydown = useCallback(
    (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9) {
        e.preventDefault();
        const target = navItems[num - 1];
        if (target) navigate(target.path);
      }
    },
    [navigate]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [handleKeydown]);

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  return (
    <motion.aside
      initial={{ x: -SIDEBAR_EXPANDED }}
      animate={{ x: 0, width: sidebarWidth }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed top-0 left-0 h-screen z-50 flex flex-col
        bg-[#060A12]/95 backdrop-blur-xl border-r border-jarvis-border
        overflow-hidden select-none"
      style={{ width: sidebarWidth }}
    >
      {/* ---- Logo area ---- */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4 min-h-[72px]">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              key="logo"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col"
            >
              <span
                className="font-mono text-xl font-bold tracking-wider text-jarvis-blue text-glow-blue"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                JARVIS
              </span>
              <span className="text-[9px] uppercase tracking-[0.25em] text-white/30 mt-0.5">
                Cornerstone Command Center
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hamburger toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="p-2 rounded-lg text-white/40 hover:text-jarvis-blue hover:bg-jarvis-blue/5
            transition-colors duration-200 flex-shrink-0"
        >
          <AnimatePresence mode="wait">
            {collapsed ? (
              <motion.div
                key="menu"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Menu size={20} />
              </motion.div>
            ) : (
              <motion.div
                key="close"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <X size={20} />
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Separator line */}
      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-jarvis-blue/20 to-transparent" />

      {/* ---- Navigation ---- */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 relative">
        {/* Sliding active indicator (left bar) */}
        {activeIndex >= 0 && (
          <motion.div
            layoutId="sidebar-active-indicator"
            className="absolute left-0 w-[3px] rounded-r-full bg-jarvis-blue"
            style={{ height: 40 }}
            animate={{ top: 12 + activeIndex * 44 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          >
            {/* Glow halo */}
            <div className="absolute inset-0 w-[3px] rounded-r-full bg-jarvis-blue blur-[6px]" />
          </motion.div>
        )}

        {navItems.map((item, i) => {
          const Icon = item.icon;
          const isActive =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

          return (
            <motion.button
              key={item.path}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.04 * i, duration: 0.3, ease: 'easeOut' }}
              onClick={() => navigate(item.path)}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              className={`
                relative w-full flex items-center gap-3 h-10 rounded-lg mb-1
                transition-colors duration-200 group
                ${collapsed ? 'justify-center px-0' : 'px-3'}
                ${
                  isActive
                    ? 'text-jarvis-blue bg-jarvis-blue/[0.07]'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.03]'
                }
              `}
            >
              {/* Hover glow background */}
              {hoveredIndex === i && !isActive && (
                <motion.div
                  layoutId="sidebar-hover-bg"
                  className="absolute inset-0 rounded-lg bg-jarvis-blue/[0.04]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                />
              )}

              <Icon
                size={20}
                className={`flex-shrink-0 relative z-10 transition-all duration-200 ${
                  isActive ? 'drop-shadow-[0_0_6px_rgba(0,212,255,0.6)]' : ''
                }`}
              />

              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`text-[13px] whitespace-nowrap overflow-hidden relative z-10 ${
                      isActive ? 'font-semibold' : 'font-medium'
                    }`}
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>

              {/* Keyboard shortcut badge */}
              {!collapsed && item.shortcut && (
                <motion.kbd
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 + 0.04 * i }}
                  className="ml-auto text-[10px] font-mono text-white/20 bg-white/[0.03]
                    border border-white/[0.06] rounded px-1.5 py-0.5
                    group-hover:text-white/30 group-hover:border-white/10 transition-colors"
                >
                  {'\u2318'}{item.shortcut}
                </motion.kbd>
              )}

              {/* Tooltip for collapsed state */}
              {collapsed && hoveredIndex === i && (
                <motion.div
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="absolute left-full ml-3 px-3 py-1.5 rounded-lg
                    bg-jarvis-card/95 backdrop-blur-sm border border-jarvis-border
                    text-xs text-white/80 whitespace-nowrap z-[100]
                    shadow-xl shadow-black/50"
                >
                  {item.label}
                  {item.shortcut && (
                    <kbd className="ml-2 text-[10px] text-white/30 font-mono">
                      {'\u2318'}{item.shortcut}
                    </kbd>
                  )}
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* ---- Bottom status ---- */}
      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-jarvis-blue/20 to-transparent" />

      <div
        className={`flex items-center gap-2 px-4 py-4 ${
          collapsed ? 'justify-center' : ''
        }`}
      >
        {/* Green "SYSTEMS ONLINE" indicator */}
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-jarvis-green opacity-50" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-jarvis-green shadow-[0_0_6px_rgba(0,255,136,0.6)]" />
        </span>

        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[10px] uppercase tracking-[0.2em] text-jarvis-green/70 font-mono"
            >
              Systems Online
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}
