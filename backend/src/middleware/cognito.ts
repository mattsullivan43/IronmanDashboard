import { Request, Response, NextFunction } from 'express';
import https from 'https';
import crypto from 'crypto';

// ==============================================================================
// Cognito JWT Verification Middleware for Express
// Falls back to local JWT auth when COGNITO_USER_POOL_ID is not configured.
// ==============================================================================

interface CognitoJwk {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  n: string;
  e: string;
}

interface CognitoTokenPayload {
  sub: string;
  email?: string;
  'cognito:username'?: string;
  name?: string;
  email_verified?: boolean;
  token_use: 'access' | 'id';
  auth_time: number;
  iss: string;
  exp: number;
  iat: number;
  client_id?: string;
  aud?: string;
}

export interface CognitoAuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    displayName: string;
    email?: string;
    authSource: 'cognito' | 'local';
  };
}

// ── JWKS Cache ──────────────────────────────────────────────────────────────
let jwksCache: Map<string, CognitoJwk> = new Map();
let jwksCacheExpiry = 0;
const JWKS_CACHE_TTL = 3600_000; // 1 hour

// ── Helpers ─────────────────────────────────────────────────────────────────

function getCognitoIssuer(region: string, userPoolId: string): string {
  return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
}

/**
 * Fetch JWKS from Cognito (with caching)
 */
async function fetchJWKS(region: string, userPoolId: string): Promise<void> {
  const now = Date.now();
  if (jwksCache.size > 0 && now < jwksCacheExpiry) {
    return;
  }

  const url = `${getCognitoIssuer(region, userPoolId)}/.well-known/jwks.json`;

  const data = await new Promise<string>((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(body);
        } else {
          reject(new Error(`JWKS fetch failed with status ${res.statusCode}`));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });

  const parsed = JSON.parse(data);
  const newCache = new Map<string, CognitoJwk>();

  for (const key of parsed.keys) {
    newCache.set(key.kid, key);
  }

  jwksCache = newCache;
  jwksCacheExpiry = now + JWKS_CACHE_TTL;

  console.log(`[JARVIS AUTH] JWKS cache refreshed with ${jwksCache.size} keys`);
}

/**
 * Convert JWK to PEM public key for signature verification
 */
function jwkToPem(jwk: CognitoJwk): string {
  const n = Buffer.from(jwk.n, 'base64url');
  const e = Buffer.from(jwk.e, 'base64url');

  function encodeLenBytes(len: number): Buffer {
    if (len < 128) return Buffer.from([len]);
    if (len < 256) return Buffer.from([0x81, len]);
    return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
  }

  function encodeUint(val: Buffer): Buffer {
    const pad = val[0] & 0x80 ? Buffer.from([0]) : Buffer.alloc(0);
    const content = Buffer.concat([pad, val]);
    return Buffer.concat([Buffer.from([0x02]), encodeLenBytes(content.length), content]);
  }

  const nEncoded = encodeUint(n);
  const eEncoded = encodeUint(e);
  const seqContent = Buffer.concat([nEncoded, eEncoded]);
  const innerSeq = Buffer.concat([Buffer.from([0x30]), encodeLenBytes(seqContent.length), seqContent]);

  // Wrap in BIT STRING
  const bitString = Buffer.concat([Buffer.from([0x00]), innerSeq]);
  const bitStringEncoded = Buffer.concat([Buffer.from([0x03]), encodeLenBytes(bitString.length), bitString]);

  // RSA algorithm OID
  const rsaOid = Buffer.from([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);

  const outerContent = Buffer.concat([rsaOid, bitStringEncoded]);
  const der = Buffer.concat([Buffer.from([0x30]), encodeLenBytes(outerContent.length), outerContent]);

  return `-----BEGIN PUBLIC KEY-----\n${der.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`;
}

/**
 * Verify a Cognito JWT token: signature, expiration, issuer, audience
 */
async function verifyCognitoToken(
  token: string,
  region: string,
  userPoolId: string,
  clientId: string
): Promise<CognitoTokenPayload> {
  // Decode header to get kid
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());

  if (!header.kid) {
    throw new Error('JWT header missing kid');
  }

  if (header.alg !== 'RS256') {
    throw new Error(`Unsupported algorithm: ${header.alg}`);
  }

  // Fetch JWKS (from cache if available)
  await fetchJWKS(region, userPoolId);

  let jwk = jwksCache.get(header.kid);
  if (!jwk) {
    // Key not found -- force refresh and try again
    jwksCacheExpiry = 0;
    await fetchJWKS(region, userPoolId);
    jwk = jwksCache.get(header.kid);
    if (!jwk) {
      throw new Error('Token signed with unknown key');
    }
  }

  const pem = jwkToPem(jwk);

  // Verify signature
  const signatureInput = `${parts[0]}.${parts[1]}`;
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signatureInput);
  const signatureValid = verifier.verify(pem, parts[2], 'base64url');

  if (!signatureValid) {
    throw new Error('Invalid token signature');
  }

  // Decode and validate payload
  const payload: CognitoTokenPayload = JSON.parse(
    Buffer.from(parts[1], 'base64url').toString()
  );

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error('Token expired');
  }

  // Check issuer
  const expectedIssuer = getCognitoIssuer(region, userPoolId);
  if (payload.iss !== expectedIssuer) {
    throw new Error(`Invalid issuer: expected ${expectedIssuer}, got ${payload.iss}`);
  }

  // Check audience/client_id depending on token type
  if (payload.token_use === 'access') {
    if (payload.client_id !== clientId) {
      throw new Error('Invalid token audience (client_id mismatch)');
    }
  } else if (payload.token_use === 'id') {
    if (payload.aud !== clientId) {
      throw new Error('Invalid token audience (aud mismatch)');
    }
  } else {
    throw new Error(`Invalid token_use: ${payload.token_use}`);
  }

  return payload;
}

// ── Express Middleware ───────────────────────────────────────────────────────

/**
 * Cognito JWT verification middleware.
 * Falls back to local auth middleware if AUTH_MODE is not 'cognito'
 * or if Cognito env vars are not set.
 */
export function cognitoAuthMiddleware(
  req: CognitoAuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authMode = process.env.AUTH_MODE || 'local';
  const region = process.env.COGNITO_REGION || 'us-east-1';
  const userPoolId = process.env.COGNITO_USER_POOL_ID || '';
  const clientId = process.env.COGNITO_APP_CLIENT_ID || '';

  // Fall back to local auth if Cognito is not configured
  if (authMode !== 'cognito' || !userPoolId || !clientId) {
    const { authenticateToken } = require('./auth');
    return authenticateToken(req, res, next);
  }

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  verifyCognitoToken(token, region, userPoolId, clientId)
    .then((payload) => {
      req.user = {
        id: payload.sub,
        username: payload['cognito:username'] || payload.email || payload.sub,
        displayName: payload.name || payload.email || 'User',
        email: payload.email,
        authSource: 'cognito',
      };
      next();
    })
    .catch((err) => {
      console.error('[JARVIS AUTH] Cognito token verification failed:', err.message);

      if (err.message === 'Token expired') {
        res.status(401).json({ error: 'Token expired' });
      } else {
        res.status(403).json({ error: 'Invalid token' });
      }
    });
}

// Export as default for drop-in middleware usage
export default cognitoAuthMiddleware;
