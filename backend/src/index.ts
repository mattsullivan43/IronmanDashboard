import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';

import config from './config';
import { initializeDatabase, closePool } from './database/connection';
import { authenticateToken, createAuthRouter, ensureAdminUser } from './middleware/auth';
import { cognitoAuthMiddleware } from './middleware/cognito';

// Route imports
import clientsRouter from './routes/clients';
import transactionsRouter from './routes/transactions';
import commissionsRouter from './routes/commissions';
import metricsRouter from './routes/metrics';
import jarvisRouter from './routes/jarvis';
import calendarRouter from './routes/calendar';
import settingsRouter from './routes/settings';
import csvRouter from './routes/csv';
import exportRouter from './routes/export';
import analyticsRouter from './routes/analytics';

async function startServer(): Promise<void> {
  console.log('[JARVIS] Initializing database...');
  await initializeDatabase();
  await ensureAdminUser();

  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','),
      credentials: true,
    })
  );

  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Uploads directory
  app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));

  // Health check (unauthenticated)
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'online',
      name: 'JARVIS Business Command Center',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Auth routes (unauthenticated)
  app.use('/api/auth', createAuthRouter());

  // Protected API routes — cognitoAuthMiddleware handles both modes:
  // AUTH_MODE=cognito → verifies Cognito JWT
  // AUTH_MODE=local → falls back to local JWT auth internally
  const protect = cognitoAuthMiddleware;
  app.use('/api/clients', protect, clientsRouter);
  app.use('/api/transactions', protect, transactionsRouter);
  app.use('/api/commissions', protect, commissionsRouter);
  app.use('/api/metrics', protect, metricsRouter);
  app.use('/api/jarvis', protect, jarvisRouter);
  app.use('/api/calendar', protect, calendarRouter);
  app.use('/api/settings', protect, settingsRouter);
  app.use('/api/csv', protect, csvRouter);
  app.use('/api/export', protect, exportRouter);
  app.use('/api/analytics', protect, analyticsRouter);

  // Cognito config endpoint (unauthenticated — frontend needs this to configure)
  app.get('/api/config', (_req, res) => {
    res.json({
      authMode: process.env.AUTH_MODE || 'local',
      cognitoRegion: process.env.COGNITO_REGION || '',
      cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || '',
      cognitoAppClientId: process.env.COGNITO_APP_CLIENT_ID || '',
    });
  });

  // Static frontend
  const publicDir = path.resolve(__dirname, '..', 'public');

  // Assets have content hashes — cache forever
  app.use('/assets', express.static(path.join(publicDir, 'assets'), {
    maxAge: '1y',
    immutable: true,
  }));

  // index.html — never cache so new builds load immediately
  app.use(express.static(publicDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    },
  }));

  // SPA fallback — also no-cache
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  const server = app.listen(config.port, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║        J.A.R.V.I.S. Business Command Center     ║');
    console.log('║        Cornerstone Technology & AI Solutions      ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  Status:  ONLINE                                 ║`);
    console.log(`║  Port:    ${String(config.port).padEnd(39)}║`);
    console.log(`║  Env:     ${config.nodeEnv.padEnd(39)}║`);
    console.log(`║  AI:      ${(config.aiProvider + ' / ' + config.aiModel).padEnd(39)}║`);
    console.log(`║  DB:      MySQL @ ${config.mysqlHost}:${config.mysqlPort}`.padEnd(52) + '║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[JARVIS] ${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      await closePool();
      console.log('[JARVIS] Server closed. Goodbye, Mr. Sullivan.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[JARVIS] Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('[JARVIS] Fatal startup error:', err);
  process.exit(1);
});
