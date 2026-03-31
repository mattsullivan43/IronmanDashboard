import { useState, useEffect, FormEvent } from 'react';
import {} from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, User, AlertCircle } from 'lucide-react';
import { auth } from '../services/api';
import { signIn as cognitoSignIn, isCognitoConfigured, configureCognito } from '../services/cognitoAuth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [configReady, setConfigReady] = useState(false);

  // Fetch auth config from backend on mount
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(cfg => {
        if (cfg.authMode === 'cognito' && cfg.cognitoUserPoolId && cfg.cognitoAppClientId) {
          configureCognito(cfg.cognitoUserPoolId, cfg.cognitoAppClientId, cfg.cognitoRegion || 'us-east-1');
        }
      })
      .catch(() => {})
      .finally(() => setConfigReady(true));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!configReady) return;
    setError('');
    setLoading(true);

    try {
      if (isCognitoConfigured()) {
        await cognitoSignIn(email, password);
      } else {
        await auth.login(email, password);
      }
      // Full page reload so App re-checks auth fresh
      window.location.href = '/';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060A12] flex items-center justify-center relative overflow-hidden">
      {/* Mesh gradient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,212,255,0.08) 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 20% 80%, rgba(0,212,255,0.04) 0%, transparent 50%),
            radial-gradient(ellipse 50% 60% at 80% 60%, rgba(255,184,0,0.03) 0%, transparent 50%)
          `,
        }}
      />

      {/* Subtle grid overlay */}
      <div className="grid-overlay fixed inset-0 pointer-events-none z-0" />

      {/* Login card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div
          className="relative bg-[#0D1321]/80 backdrop-blur-xl border border-[#1A2035] rounded-xl
            shadow-[0_0_60px_rgba(0,0,0,0.5),0_0_30px_rgba(0,212,255,0.05)] overflow-hidden"
        >
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00D4FF]/30 to-transparent" />

          <div className="px-8 pt-10 pb-8">
            {/* Arc reactor icon */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              className="flex justify-center mb-8"
            >
              <div className="relative">
                <div className="w-14 h-14 rounded-full border-2 border-[#00D4FF]/40 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full border border-[#00D4FF]/30 flex items-center justify-center">
                    <motion.div
                      className="w-3 h-3 rounded-full bg-[#00D4FF]"
                      animate={{
                        boxShadow: [
                          '0 0 15px rgba(0, 212, 255, 0.5), 0 0 30px rgba(0, 212, 255, 0.2)',
                          '0 0 25px rgba(0, 212, 255, 0.8), 0 0 50px rgba(0, 212, 255, 0.4)',
                          '0 0 15px rgba(0, 212, 255, 0.5), 0 0 30px rgba(0, 212, 255, 0.2)',
                        ],
                      }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </div>
                </div>
                <motion.div
                  className="absolute inset-[-3px] rounded-full border border-[#00D4FF]/20 border-t-[#00D4FF]/60"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                />
              </div>
            </motion.div>

            {/* Title */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-center mb-8"
            >
              <h1
                className="text-3xl font-bold tracking-[0.3em] text-[#00D4FF] mb-2"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  textShadow: '0 0 20px rgba(0, 212, 255, 0.5), 0 0 40px rgba(0, 212, 255, 0.2)',
                }}
              >
                JARVIS
              </h1>
              <p className="text-[10px] uppercase tracking-[0.35em] text-white/30">
                Cornerstone Command Center
              </p>
            </motion.div>

            {/* Form */}
            <motion.form
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.5 }}
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              {/* Error message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg
                    bg-[#FF3B3B]/10 border border-[#FF3B3B]/30"
                >
                  <AlertCircle className="w-4 h-4 text-[#FF3B3B] flex-shrink-0" />
                  <span className="text-xs text-[#FF3B3B]">{error}</span>
                </motion.div>
              )}

              {/* Username / Email */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-white/50 mb-1.5">
                  Identifier
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email or username"
                    required
                    autoComplete="username"
                    className={`
                      w-full pl-10 pr-3 py-2.5 text-sm text-white
                      bg-[#0D1321]/80 backdrop-blur-sm rounded-md
                      placeholder:text-white/20
                      transition-all duration-200 outline-none
                      ${
                        error
                          ? 'border border-[#FF3B3B]/50 shadow-[0_0_12px_rgba(255,59,59,0.15)]'
                          : 'border border-[#1A2035] focus:border-[#00D4FF]/50 focus:shadow-[0_0_12px_rgba(0,212,255,0.15)]'
                      }
                    `}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-white/50 mb-1.5">
                  Passphrase
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter passphrase"
                    required
                    autoComplete="current-password"
                    className={`
                      w-full pl-10 pr-3 py-2.5 text-sm text-white
                      bg-[#0D1321]/80 backdrop-blur-sm rounded-md
                      placeholder:text-white/20
                      transition-all duration-200 outline-none
                      ${
                        error
                          ? 'border border-[#FF3B3B]/50 shadow-[0_0_12px_rgba(255,59,59,0.15)]'
                          : 'border border-[#1A2035] focus:border-[#00D4FF]/50 focus:shadow-[0_0_12px_rgba(0,212,255,0.15)]'
                      }
                    `}
                  />
                </div>
              </div>

              {/* Submit */}
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.02 }}
                whileTap={{ scale: loading ? 1 : 0.98 }}
                className={`
                  w-full py-3 rounded-md text-sm font-semibold uppercase tracking-[0.2em]
                  border transition-all duration-300
                  disabled:cursor-not-allowed
                  ${
                    loading
                      ? 'bg-[#00D4FF]/5 border-[#00D4FF]/20 text-[#00D4FF]/60'
                      : 'bg-[#00D4FF]/10 border-[#00D4FF]/40 text-[#00D4FF] hover:bg-[#00D4FF]/20 hover:border-[#00D4FF]/60 hover:shadow-[0_0_30px_rgba(0,212,255,0.3)]'
                  }
                `}
              >
                {loading ? (
                  <motion.span
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    AUTHENTICATING...
                  </motion.span>
                ) : (
                  'INITIALIZE'
                )}
              </motion.button>
            </motion.form>

            {/* Footer */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="text-center text-[10px] text-white/15 mt-8 tracking-wider uppercase"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Cornerstone Industries | Secure Access
            </motion.p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
