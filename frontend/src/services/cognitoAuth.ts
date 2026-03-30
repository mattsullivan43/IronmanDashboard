// ==============================================================================
// JARVIS Frontend - Cognito Authentication Service
// Uses raw HTTP calls to Cognito API (no AWS SDK dependency).
// Falls back gracefully when Cognito is not configured.
// ==============================================================================

interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number; // timestamp in ms
}

interface AuthConfig {
  userPoolId: string;
  clientId: string;
  region: string;
}

interface TokenPayload {
  sub: string;
  email?: string;
  name?: string;
  exp: number;
  iat: number;
  'cognito:username'?: string;
}

export interface CognitoUser {
  id: string;
  email: string;
  name: string;
}

const STORAGE_KEY = 'jarvis_cognito_tokens';

// ── Configuration ───────────────────────────────────────────────────────────

let config: AuthConfig | null = null;

/**
 * Configure Cognito auth settings. Call once on app init.
 * Also reads from Vite env vars (VITE_COGNITO_*) as defaults.
 */
export function configureCognito(
  userPoolId?: string,
  clientId?: string,
  region?: string
): void {
  const resolvedPoolId = userPoolId
    || (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_COGNITO_USER_POOL_ID : '')
    || '';
  const resolvedClientId = clientId
    || (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_COGNITO_APP_CLIENT_ID : '')
    || '';
  const resolvedRegion = region
    || (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_COGNITO_REGION : '')
    || 'us-east-1';

  config = {
    userPoolId: resolvedPoolId,
    clientId: resolvedClientId,
    region: resolvedRegion,
  };
}

export function isCognitoConfigured(): boolean {
  return config !== null && config.userPoolId !== '' && config.clientId !== '';
}

/**
 * Check if the app is in Cognito auth mode
 */
export function isCognitoEnabled(): boolean {
  const authMode = (typeof import.meta !== 'undefined'
    ? (import.meta as any).env?.VITE_AUTH_MODE
    : 'local') || 'local';
  return authMode === 'cognito' && isCognitoConfigured();
}

// ── Cognito API Helper ──────────────────────────────────────────────────────

function getCognitoUrl(): string {
  if (!config) throw new Error('Cognito not configured');
  return `https://cognito-idp.${config.region}.amazonaws.com/`;
}

export class CognitoError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'CognitoError';
  }
}

async function cognitoRequest(action: string, payload: Record<string, any>): Promise<any> {
  const response = await fetch(getCognitoUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorType = data.__type?.split('#').pop() || 'AuthError';
    const message = data.message || data.Message || 'Authentication failed';

    // Map Cognito errors to user-friendly messages
    switch (errorType) {
      case 'NotAuthorizedException':
        throw new CognitoError(errorType, 'Invalid email or password');
      case 'UserNotFoundException':
        throw new CognitoError(errorType, 'Invalid email or password');
      case 'UserNotConfirmedException':
        throw new CognitoError(errorType, 'Please verify your email before signing in');
      case 'PasswordResetRequiredException':
        throw new CognitoError(errorType, 'Password reset required. Please contact administrator.');
      case 'TooManyRequestsException':
        throw new CognitoError(errorType, 'Too many attempts. Please try again later.');
      default:
        throw new CognitoError(errorType, message);
    }
  }

  return data;
}

// ── Token Decode ────────────────────────────────────────────────────────────

function decodeTokenPayload(token: string): TokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(payload));
}

// ── Token Storage ───────────────────────────────────────────────────────────

function saveTokens(authResult: any, existingRefresh?: string): CognitoTokens {
  const tokens: CognitoTokens = {
    accessToken: authResult.AccessToken,
    idToken: authResult.IdToken,
    refreshToken: authResult.RefreshToken || existingRefresh || '',
    expiresAt: Date.now() + (authResult.ExpiresIn * 1000),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));

  // Bridge: also set jarvis_token for API interceptor compatibility
  localStorage.setItem('jarvis_token', tokens.accessToken);

  return tokens;
}

export function getStoredTokens(): CognitoTokens | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('jarvis_token');
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string): Promise<CognitoUser> {
  if (!config) throw new Error('Cognito not configured');

  try {
    const result = await cognitoRequest('InitiateAuth', {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: config.clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    // Handle NEW_PASSWORD_REQUIRED challenge (admin-created users)
    if (result.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      const challengeResult = await cognitoRequest('RespondToAuthChallenge', {
        ChallengeName: 'NEW_PASSWORD_REQUIRED',
        ClientId: config.clientId,
        ChallengeResponses: {
          USERNAME: email,
          NEW_PASSWORD: password,
        },
        Session: result.Session,
      });
      const tokens = saveTokens(challengeResult.AuthenticationResult);
      const payload = decodeTokenPayload(tokens.idToken);
      return { id: payload.sub, email: payload.email || email, name: payload.name || email };
    }

    if (!result.AuthenticationResult) {
      throw new CognitoError(
        'UnsupportedChallenge',
        result.ChallengeName
          ? `Authentication challenge not supported: ${result.ChallengeName}`
          : 'Authentication failed'
      );
    }

    const tokens = saveTokens(result.AuthenticationResult);
    const payload = decodeTokenPayload(tokens.idToken);
    return { id: payload.sub, email: payload.email || email, name: payload.name || email };
  } catch (err) {
    if (err instanceof CognitoError) throw err;
    throw new CognitoError('NetworkError', 'Failed to connect to authentication service');
  }
}

/**
 * Refresh the session using the stored refresh token
 */
export async function refreshSession(): Promise<CognitoTokens | null> {
  if (!config) return null;

  const tokens = getStoredTokens();
  if (!tokens?.refreshToken) return null;

  try {
    const result = await cognitoRequest('InitiateAuth', {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: config.clientId,
      AuthParameters: {
        REFRESH_TOKEN: tokens.refreshToken,
      },
    });

    // Cognito does not return a new refresh token on refresh
    return saveTokens(result.AuthenticationResult, tokens.refreshToken);
  } catch {
    signOut();
    return null;
  }
}

/**
 * Sign out and clear all tokens
 */
export function signOut(): void {
  const tokens = getStoredTokens();

  // Best-effort server-side sign out
  if (tokens?.accessToken && config) {
    cognitoRequest('GlobalSignOut', { AccessToken: tokens.accessToken }).catch(() => {});
  }

  clearTokens();
}

/**
 * Get current access token, refreshing if expired or about to expire
 */
export async function getAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens) return null;

  // Refresh if expiring within 5 minutes
  if (tokens.expiresAt - Date.now() < 5 * 60 * 1000) {
    const refreshed = await refreshSession();
    return refreshed?.accessToken || null;
  }

  return tokens.accessToken;
}

/**
 * Get the ID token (contains user attributes)
 */
export function getIdToken(): string | null {
  const tokens = getStoredTokens();
  return tokens?.idToken || null;
}

/**
 * Check if user is currently authenticated
 */
export function isAuthenticated(): boolean {
  const tokens = getStoredTokens();
  if (!tokens) return false;
  // Consider authenticated if refresh token exists (can refresh even if access expired)
  return !!tokens.refreshToken;
}

/**
 * Get the current user info from the stored ID token
 */
export function getCurrentUser(): CognitoUser | null {
  const tokens = getStoredTokens();
  if (!tokens?.idToken) return null;

  try {
    const payload = decodeTokenPayload(tokens.idToken);
    return {
      id: payload.sub,
      email: payload.email || '',
      name: payload.name || payload.email || '',
    };
  } catch {
    return null;
  }
}

/**
 * Change password for the currently authenticated user
 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new CognitoError('NotAuthenticated', 'Not signed in');

  await cognitoRequest('ChangePassword', {
    AccessToken: token,
    PreviousPassword: oldPassword,
    ProposedPassword: newPassword,
  });
}

/**
 * Initiate forgot password flow
 */
export async function forgotPassword(email: string): Promise<void> {
  if (!config) throw new Error('Cognito not configured');

  await cognitoRequest('ForgotPassword', {
    ClientId: config.clientId,
    Username: email,
  });
}

/**
 * Confirm forgot password with verification code
 */
export async function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  if (!config) throw new Error('Cognito not configured');

  await cognitoRequest('ConfirmForgotPassword', {
    ClientId: config.clientId,
    Username: email,
    ConfirmationCode: code,
    Password: newPassword,
  });
}

// ── Auto-refresh ────────────────────────────────────────────────────────────

let refreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start automatic token refresh. Call once on app startup.
 */
export function startAutoRefresh(): void {
  stopAutoRefresh();

  const checkAndRefresh = async () => {
    if (!isAuthenticated()) return;

    const tokens = getStoredTokens();
    if (!tokens) return;

    const timeUntilExpiry = tokens.expiresAt - Date.now();

    // Refresh 2 minutes before expiry
    if (timeUntilExpiry < 120_000) {
      try {
        await refreshSession();
      } catch {
        console.warn('[JARVIS] Token auto-refresh failed');
      }
    }
  };

  // Check every 30 seconds
  refreshTimer = setInterval(checkAndRefresh, 30_000);

  // Check immediately
  checkAndRefresh();
}

/**
 * Stop automatic token refresh
 */
export function stopAutoRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
