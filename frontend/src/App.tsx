import { useState, useEffect, lazy, Suspense, Component, ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import { auth } from './services/api';
import { configureCognito } from './services/cognitoAuth';
import { useKeyboardShortcut } from './hooks/useKeyboardShortcut';

// ── Layout & UI ─────────────────────────────────────────────────────────────

import AppLayout from './components/layout/AppLayout';

// ── Pages (lazy-loaded) ─────────────────────────────────────────────────────

const CommandCenter = lazy(() => import('./pages/CommandCenter'));
const Revenue = lazy(() => import('./pages/Revenue'));
const UnitEconomics = lazy(() => import('./pages/UnitEconomics'));
const Profitability = lazy(() => import('./pages/Profitability'));
const CashBurn = lazy(() => import('./pages/CashBurn'));
const BoomLine = lazy(() => import('./pages/BoomLine'));
const AIReceptionist = lazy(() => import('./pages/AIReceptionist'));
const Clients = lazy(() => import('./pages/Clients'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const Transactions = lazy(() => import('./pages/Transactions'));
const CsvUpload = lazy(() => import('./pages/CsvUpload'));
const Commissions = lazy(() => import('./pages/Commissions'));
const JarvisChat = lazy(() => import('./pages/JarvisChat'));
const PricingCalculator = lazy(() => import('./pages/PricingCalculator'));
const Settings = lazy(() => import('./pages/Settings'));
const Login = lazy(() => import('./pages/Login'));

// ── Chat Panel (global, lazy) ───────────────────────────────────────────────

const ChatPanel = lazy(() => import('./components/jarvis/ChatPanel'));

// ── Error Boundary (per-page, not whole app) ────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class PageErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('[JARVIS] Page error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-64 p-8">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full border-2 border-[#FF3B3B]/40 flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-[#FF3B3B] shadow-[0_0_15px_rgba(255,59,59,0.5)]" />
            </div>
            <p className="text-sm text-[#FF3B3B] font-mono tracking-wider">MODULE ERROR</p>
            <p className="text-xs text-white/40 max-w-md">
              {this.state.error?.message || 'Page failed to load'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-1.5 text-xs font-medium uppercase tracking-wider
                bg-[#00D4FF]/10 border border-[#00D4FF]/40 text-[#00D4FF] rounded
                hover:bg-[#00D4FF]/20 transition-all"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Page loader ─────────────────────────────────────────────────────────────

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <motion.div
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="text-sm text-[#00D4FF] font-mono tracking-wider"
      >
        LOADING MODULE...
      </motion.div>
    </div>
  );
}

// ── Page wrapper with error boundary + suspense ─────────────────────────────

function PageWrapper({ children }: { children: ReactNode }) {
  return (
    <PageErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </PageErrorBoundary>
  );
}

// ── Route config ────────────────────────────────────────────────────────────

const routeConfig = [
  { path: '/', element: <CommandCenter />, title: 'Command Center' },
  { path: '/revenue', element: <Revenue />, title: 'Revenue' },
  { path: '/unit-economics', element: <UnitEconomics />, title: 'Unit Economics' },
  { path: '/profitability', element: <Profitability />, title: 'P&L' },
  { path: '/cash-burn', element: <CashBurn />, title: 'Cash & Burn' },
  { path: '/boomline', element: <BoomLine />, title: 'BoomLine' },
  { path: '/ai-receptionist', element: <AIReceptionist />, title: 'AI Receptionist' },
  { path: '/clients', element: <Clients />, title: 'Clients' },
  { path: '/calendar', element: <CalendarPage />, title: 'Calendar' },
  { path: '/transactions', element: <Transactions />, title: 'Transactions' },
  { path: '/csv-upload', element: <CsvUpload />, title: 'Statement Import' },
  { path: '/commissions', element: <Commissions />, title: 'Commissions' },
  { path: '/jarvis', element: <JarvisChat />, title: 'JARVIS AI' },
  { path: '/pricing', element: <PricingCalculator />, title: 'Pricing Calculator' },
  { path: '/settings', element: <Settings />, title: 'Settings' },
];

// ── Get page title from path ────────────────────────────────────────────────

function usePageTitle(): string {
  const location = useLocation();
  const route = routeConfig.find(r => r.path === location.pathname);
  return route?.title || 'JARVIS';
}

// ── Authenticated app shell ─────────────────────────────────────────────────

function AuthenticatedApp({ chatOpen, setChatOpen }: { chatOpen: boolean; setChatOpen: (v: boolean) => void }) {
  const title = usePageTitle();
  const location = useLocation();

  return (
    <AppLayout title={title}>
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          <Routes location={location}>
            {routeConfig.map(({ path, element }) => (
              <Route
                key={path}
                path={path}
                element={<PageWrapper>{element}</PageWrapper>}
              />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>

      <Suspense fallback={null}>
        <ChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
      </Suspense>
    </AppLayout>
  );
}

// ── App ─────────────────────────────────────────────────────────────────────

function App() {
  const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    // Fetch auth config first so Cognito is configured before token verification
    fetch('/api/config')
      .then(res => res.json())
      .then(cfg => {
        if (cfg.authMode === 'cognito' && cfg.cognitoUserPoolId && cfg.cognitoAppClientId) {
          configureCognito(cfg.cognitoUserPoolId, cfg.cognitoAppClientId, cfg.cognitoRegion || 'us-east-1');
        }
      })
      .catch(() => {})
      .finally(() => {
        const token = localStorage.getItem('jarvis_token');
        if (!token) {
          setAuthState('unauthenticated');
          return;
        }

        auth.getMe()
          .then(() => setAuthState('authenticated'))
          .catch(() => {
            localStorage.removeItem('jarvis_token');
            setAuthState('unauthenticated');
          });
      });
  }, []);

  useKeyboardShortcut('j', () => setChatOpen(prev => !prev), { metaKey: true });

  if (authState === 'loading') {
    return (
      <div className="min-h-screen bg-[#060A12] flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-[#00D4FF] font-mono text-sm tracking-[0.3em]"
        >
          INITIALIZING JARVIS...
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#0D1321', color: '#fff', border: '1px solid #1A2035' },
          success: { iconTheme: { primary: '#00FF88', secondary: '#0D1321' } },
          error: { iconTheme: { primary: '#FF3B3B', secondary: '#0D1321' } },
        }}
      />
      <Routes>
        <Route
          path="/login"
          element={
            authState === 'authenticated'
              ? <Navigate to="/" replace />
              : <Suspense fallback={<PageLoader />}><Login /></Suspense>
          }
        />
        <Route
          path="/*"
          element={
            authState === 'authenticated'
              ? <AuthenticatedApp chatOpen={chatOpen} setChatOpen={setChatOpen} />
              : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </>
  );
}

export default App;
