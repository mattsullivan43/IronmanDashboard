import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
}

const SIDEBAR_EXPANDED = 260;
const SIDEBAR_COLLAPSED = 72;

const pageVariants = {
  initial: { opacity: 0, y: 12, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -8, filter: 'blur(4px)' },
};

export default function AppLayout({ children, title }: AppLayoutProps) {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Listen for sidebar width changes via the sidebar's rendered width
  useEffect(() => {
    const sidebar = document.querySelector('aside');
    if (!sidebar) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setSidebarCollapsed(w < (SIDEBAR_EXPANDED + SIDEBAR_COLLAPSED) / 2);
      }
    });

    observer.observe(sidebar);
    return () => observer.disconnect();
  }, []);

  const marginLeft = sidebarCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  return (
    <div className="min-h-screen bg-jarvis-darker text-white">
      {/* Background effects */}
      <div className="particles" />
      <div className="grid-overlay fixed inset-0 pointer-events-none z-0" />

      {/* Ambient radial glow */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 30% 20%, rgba(0,212,255,0.04) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 80% 70%, rgba(0,212,255,0.02) 0%, transparent 60%)',
        }}
      />

      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <motion.div
        animate={{ marginLeft }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="relative z-10 flex flex-col min-h-screen"
      >
        <TopBar title={title} />

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="p-6"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </motion.div>
    </div>
  );
}
