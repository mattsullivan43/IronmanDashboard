import { Request, Response, NextFunction, Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config';
import { query } from '../database/connection';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    displayName: string;
  };
}

interface JwtPayload {
  userId: string;
  username: string;
  displayName: string;
}

const SALT_ROUNDS = 12;

export async function ensureAdminUser(): Promise<void> {
  const { adminUsername, adminPassword } = config;

  const rows = await query<any>(
    'SELECT id, password_hash FROM users WHERE username = ?',
    [adminUsername]
  );

  if (rows.length === 0) {
    const hash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
    const id = require('crypto').randomUUID();
    await query(
      'INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)',
      [id, adminUsername, hash, 'Mr. Sullivan']
    );
    console.log(`[JARVIS AUTH] Admin user "${adminUsername}" created`);
  } else {
    const matches = await bcrypt.compare(adminPassword, rows[0].password_hash);
    if (!matches) {
      const hash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
      await query(
        'UPDATE users SET password_hash = ? WHERE username = ?',
        [hash, adminUsername]
      );
      console.log(`[JARVIS AUTH] Admin password updated for "${adminUsername}"`);
    }
  }
}

export function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // If Cognito already authenticated the user, skip local auth
  if (req.user) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.user = {
      id: decoded.userId,
      username: decoded.username,
      displayName: decoded.displayName,
    };
    next();
  } catch (err) {
    const jwtErr = err as Error;
    if (jwtErr.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token expired' });
    } else {
      res.status(403).json({ error: 'Invalid token' });
    }
  }
}

// Alias for routes that import as authMiddleware
export const authMiddleware = authenticateToken;

export function createAuthRouter(): Router {
  const router = Router();

  router.post('/login', async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
      }

      const rows = await query<any>(
        'SELECT id, username, password_hash, display_name FROM users WHERE username = ?',
        [username]
      );

      if (rows.length === 0) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const user = rows[0];
      const validPassword = await bcrypt.compare(password, user.password_hash);

      if (!validPassword) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const token = jwt.sign(
        {
          userId: user.id,
          username: user.username,
          displayName: user.display_name,
        } as JwtPayload,
        config.jwtSecret,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
        },
      });
    } catch (err) {
      console.error('[JARVIS AUTH] Login error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/verify', authenticateToken, (req: AuthenticatedRequest, res: Response): void => {
    res.json({ valid: true, user: req.user });
  });

  router.post(
    '/change-password',
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
          res.status(400).json({ error: 'Current and new password are required' });
          return;
        }

        if (newPassword.length < 8) {
          res.status(400).json({ error: 'New password must be at least 8 characters' });
          return;
        }

        const rows = await query<any>(
          'SELECT password_hash FROM users WHERE id = ?',
          [req.user!.id]
        );

        if (rows.length === 0) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const validPassword = await bcrypt.compare(currentPassword, rows[0].password_hash);
        if (!validPassword) {
          res.status(401).json({ error: 'Current password is incorrect' });
          return;
        }

        const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user!.id]);

        res.json({ message: 'Password updated successfully' });
      } catch (err) {
        console.error('[JARVIS AUTH] Change password error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}
