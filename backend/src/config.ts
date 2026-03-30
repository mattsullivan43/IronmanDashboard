import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root (one level above backend/)
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
// Also try backend root for local dev
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

export interface Config {
  port: number;
  nodeEnv: string;

  // MySQL
  mysqlHost: string;
  mysqlPort: number;
  mysqlUser: string;
  mysqlPassword: string;
  mysqlDatabase: string;

  // Auth
  jwtSecret: string;
  adminUsername: string;
  adminPassword: string;

  // AI
  aiProvider: string;
  aiBaseUrl: string;
  aiModel: string;
  deepseekApiKey: string;
  jarvisDailyRequestLimit: number;

  // Google OAuth
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;

  // Microsoft OAuth
  microsoftClientId: string;
  microsoftClientSecret: string;
  microsoftRedirectUri: string;

  // Frontend
  frontendUrl: string;
  corsOrigin: string;
}

function getEnv(key: string, defaultValue: string = ''): string {
  return process.env[key] || defaultValue;
}

function getEnvInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (val === undefined || val === '') return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

const config: Config = {
  port: getEnvInt('PORT', 3000),
  nodeEnv: getEnv('NODE_ENV', 'development'),

  mysqlHost: getEnv('MYSQL_HOST', 'localhost'),
  mysqlPort: getEnvInt('MYSQL_PORT', 3306),
  mysqlUser: getEnv('MYSQL_USER', 'jarvis'),
  mysqlPassword: getEnv('MYSQL_PASSWORD', 'jarvis_secret'),
  mysqlDatabase: getEnv('MYSQL_DATABASE', 'jarvis'),

  jwtSecret: getEnv('JWT_SECRET', 'change-me-in-production-jarvis-secret'),
  adminUsername: getEnv('AUTH_USERNAME', 'sullivan'),
  adminPassword: getEnv('AUTH_PASSWORD', 'cornerstone2024'),

  aiProvider: getEnv('AI_PROVIDER', 'deepseek'),
  aiBaseUrl: getEnv('AI_BASE_URL', 'https://api.deepseek.com'),
  aiModel: getEnv('AI_MODEL', 'deepseek-chat'),
  deepseekApiKey: getEnv('DEEPSEEK_API_KEY', ''),
  jarvisDailyRequestLimit: getEnvInt('JARVIS_DAILY_REQUEST_LIMIT', 50),

  googleClientId: getEnv('GOOGLE_CLIENT_ID', ''),
  googleClientSecret: getEnv('GOOGLE_CLIENT_SECRET', ''),
  googleRedirectUri: getEnv('GOOGLE_REDIRECT_URI', 'http://localhost:3000/api/calendar/google/callback'),

  microsoftClientId: getEnv('MICROSOFT_CLIENT_ID', ''),
  microsoftClientSecret: getEnv('MICROSOFT_CLIENT_SECRET', ''),
  microsoftRedirectUri: getEnv('MICROSOFT_REDIRECT_URI', 'http://localhost:3000/api/calendar/microsoft/callback'),

  frontendUrl: getEnv('FRONTEND_URL', 'http://localhost:3000'),
  corsOrigin: getEnv('CORS_ORIGIN', '*'),
};

export default config;
