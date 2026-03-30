import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../database/connection';
import { google } from 'googleapis';

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/calendar/google/callback';

const MS_CLIENT_ID = process.env.MS_CLIENT_ID || '';
const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET || '';
const MS_REDIRECT_URI = process.env.MS_REDIRECT_URI || 'http://localhost:3001/api/calendar/microsoft/callback';
const MS_TENANT_ID = process.env.MS_TENANT_ID || 'common';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

function getGoogleOAuth2Client() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

// GET /api/calendar/events - merged events from all connected calendars
router.get('/events', async (req: Request, res: Response) => {
  try {
    const { start_date, end_date } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];

    if (start_date) {
      conditions.push(`start_time >= ?`);
      params.push(start_date);
    }
    if (end_date) {
      conditions.push(`end_time <= ?`);
      params.push(end_date);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT * FROM calendar_events ${where} ORDER BY start_time ASC`,
      params
    );

    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('Calendar events error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/calendar/today - today's events for agenda widget
router.get('/today', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT * FROM calendar_events
       WHERE start_time >= CURDATE()
         AND start_time < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
       ORDER BY start_time ASC`,
      []
    );

    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('Today events error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/calendar/conflicts - detect overlapping meetings
router.get('/conflicts', async (req: Request, res: Response) => {
  try {
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const params: any[] = [];

    if (start_date && end_date) {
      dateFilter = 'AND a.start_time >= ? AND a.end_time <= ?';
      params.push(start_date, end_date);
    } else {
      dateFilter = 'AND a.start_time >= CURDATE() AND a.start_time < DATE_ADD(CURDATE(), INTERVAL 7 DAY)';
    }

    const result = await query(
      `SELECT
        a.id as event_a_id, a.title as event_a_title, a.start_time as event_a_start, a.end_time as event_a_end,
        b.id as event_b_id, b.title as event_b_title, b.start_time as event_b_start, b.end_time as event_b_end
       FROM calendar_events a
       JOIN calendar_events b ON a.id < b.id
       WHERE a.start_time < b.end_time AND a.end_time > b.start_time
         AND a.all_day = false AND b.all_day = false
         ${dateFilter}
       ORDER BY a.start_time ASC`,
      params
    );

    const conflicts = result.map((row: any) => ({
      event_a: {
        id: row.event_a_id,
        title: row.event_a_title,
        start_time: row.event_a_start,
        end_time: row.event_a_end,
      },
      event_b: {
        id: row.event_b_id,
        title: row.event_b_title,
        start_time: row.event_b_start,
        end_time: row.event_b_end,
      },
    }));

    return res.json({ success: true, data: conflicts });
  } catch (err: any) {
    console.error('Calendar conflicts error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/calendar/google/auth-url - get Google OAuth URL
router.get('/google/auth-url', async (_req: Request, res: Response) => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      return res.status(400).json({ success: false, error: 'Google OAuth is not configured' });
    }

    const oauth2Client = getGoogleOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events.readonly',
      ],
    });

    return res.json({ success: true, data: { url } });
  } catch (err: any) {
    console.error('Google auth URL error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/calendar/google/callback - handle Google OAuth callback
router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.redirect(`${FRONTEND_URL}/settings?calendar_error=no_code`);
    }

    const oauth2Client = getGoogleOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code as string);

    // Upsert: delete old google connection and insert new one
    await query("DELETE FROM calendar_connections WHERE provider = 'google'", []);
    const connId = crypto.randomUUID();
    await query(
      `INSERT INTO calendar_connections (id, provider, access_token, refresh_token, token_expiry)
       VALUES (?, 'google', ?, ?, ?)`,
      [connId, tokens.access_token, tokens.refresh_token, tokens.expiry_date ? new Date(tokens.expiry_date) : null]
    );

    return res.redirect(`${FRONTEND_URL}/settings?calendar_connected=google`);
  } catch (err: any) {
    console.error('Google callback error:', err);
    return res.redirect(`${FRONTEND_URL}/settings?calendar_error=${encodeURIComponent(err.message)}`);
  }
});

// GET /api/calendar/microsoft/auth-url - get Microsoft OAuth URL
router.get('/microsoft/auth-url', async (_req: Request, res: Response) => {
  try {
    if (!MS_CLIENT_ID) {
      return res.status(400).json({ success: false, error: 'Microsoft OAuth is not configured' });
    }

    const scopes = encodeURIComponent('Calendars.Read offline_access');
    const url = `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/authorize?client_id=${MS_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(MS_REDIRECT_URI)}&scope=${scopes}&response_mode=query`;

    return res.json({ success: true, data: { url } });
  } catch (err: any) {
    console.error('Microsoft auth URL error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/calendar/microsoft/callback - handle Microsoft OAuth callback
router.get('/microsoft/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.redirect(`${FRONTEND_URL}/settings?calendar_error=no_code`);
    }

    // Exchange code for tokens
    const tokenUrl = `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`;
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        code: code as string,
        redirect_uri: MS_REDIRECT_URI,
        grant_type: 'authorization_code',
        scope: 'Calendars.Read offline_access',
      }),
    });

    const tokens: any = await tokenResponse.json();

    if (tokens.error) {
      return res.redirect(`${FRONTEND_URL}/settings?calendar_error=${encodeURIComponent(tokens.error_description || tokens.error)}`);
    }

    // Store connection
    await query("DELETE FROM calendar_connections WHERE provider = 'microsoft'", []);
    const connId = crypto.randomUUID();
    await query(
      `INSERT INTO calendar_connections (id, provider, access_token, refresh_token, token_expiry)
       VALUES (?, 'microsoft', ?, ?, ?)`,
      [
        connId,
        tokens.access_token,
        tokens.refresh_token || null,
        tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
      ]
    );

    return res.redirect(`${FRONTEND_URL}/settings?calendar_connected=microsoft`);
  } catch (err: any) {
    console.error('Microsoft callback error:', err);
    return res.redirect(`${FRONTEND_URL}/settings?calendar_error=${encodeURIComponent(err.message)}`);
  }
});

// POST /api/calendar/sync - trigger sync of all connected calendars
router.post('/sync', async (_req: Request, res: Response) => {
  try {
    const connections = await query('SELECT * FROM calendar_connections', []);
    const results: { provider: string; synced: number; error?: string }[] = [];

    for (const conn of connections) {
      try {
        if (conn.provider === 'google') {
          const synced = await syncGoogleCalendar(conn);
          results.push({ provider: 'google', synced });
        } else if (conn.provider === 'microsoft') {
          const synced = await syncMicrosoftCalendar(conn);
          results.push({ provider: 'microsoft', synced });
        }
      } catch (syncErr: any) {
        results.push({ provider: conn.provider, synced: 0, error: syncErr.message });
      }
    }

    return res.json({ success: true, data: results });
  } catch (err: any) {
    console.error('Calendar sync error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

async function syncGoogleCalendar(conn: any): Promise<number> {
  const oauth2Client = getGoogleOAuth2Client();
  oauth2Client.setCredentials({
    access_token: conn.access_token,
    refresh_token: conn.refresh_token,
  });

  // Refresh token if expired
  if (conn.token_expiry && new Date(conn.token_expiry) < new Date()) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
    await query(
      `UPDATE calendar_connections SET access_token = ?, token_expiry = ?, updated_at = NOW()
       WHERE id = ?`,
      [credentials.access_token, credentials.expiry_date ? new Date(credentials.expiry_date) : null, conn.id]
    );
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const fourWeeksAhead = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);

  const eventsResponse = await calendar.events.list({
    calendarId: 'primary',
    timeMin: twoWeeksAgo.toISOString(),
    timeMax: fourWeeksAhead.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });

  const events = eventsResponse.data.items || [];
  let synced = 0;

  for (const event of events) {
    if (!event.id || !event.start) continue;

    const startTime = event.start.dateTime || event.start.date;
    const endTime = event.end?.dateTime || event.end?.date || startTime;
    const allDay = !event.start.dateTime;

    // Check if event already exists
    const existing = await query(
      `SELECT id FROM calendar_events WHERE external_id = ? AND provider = 'google'`,
      [event.id]
    );

    if (existing.length > 0) {
      // Update existing event
      await query(
        `UPDATE calendar_events
         SET title = ?, description = ?, start_time = ?, end_time = ?,
             location = ?, all_day = ?, last_synced = NOW()
         WHERE external_id = ? AND provider = 'google'`,
        [
          event.summary || 'No title', event.description || null,
          startTime, endTime, event.location || null, allDay,
          event.id,
        ]
      );
    } else {
      // Insert new event
      const eventId = crypto.randomUUID();
      await query(
        `INSERT INTO calendar_events (id, external_id, provider, title, description, start_time, end_time, location, calendar_name, all_day, last_synced)
         VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          eventId, event.id, event.summary || 'No title', event.description || null,
          startTime, endTime, event.location || null,
          'Google Calendar', allDay,
        ]
      );
    }
    synced++;
  }

  return synced;
}

async function syncMicrosoftCalendar(conn: any): Promise<number> {
  let accessToken = conn.access_token;

  // Refresh token if expired
  if (conn.token_expiry && new Date(conn.token_expiry) < new Date() && conn.refresh_token) {
    const tokenUrl = `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`;
    const refreshResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        refresh_token: conn.refresh_token,
        grant_type: 'refresh_token',
        scope: 'Calendars.Read offline_access',
      }),
    });

    const tokens: any = await refreshResponse.json();
    if (tokens.access_token) {
      accessToken = tokens.access_token;
      await query(
        `UPDATE calendar_connections SET access_token = ?, refresh_token = ?, token_expiry = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          tokens.access_token, tokens.refresh_token || conn.refresh_token,
          tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
          conn.id,
        ]
      );
    }
  }

  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const fourWeeksAhead = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);

  const eventsUrl = `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${twoWeeksAgo.toISOString()}&endDateTime=${fourWeeksAhead.toISOString()}&$top=250&$orderby=start/dateTime`;

  const eventsResponse = await fetch(eventsUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const eventsData: any = await eventsResponse.json();
  const events = eventsData.value || [];
  let synced = 0;

  for (const event of events) {
    if (!event.id) continue;

    const allDay = event.isAllDay || false;
    const startTime = event.start?.dateTime ? `${event.start.dateTime}Z` : event.start?.date;
    const endTime = event.end?.dateTime ? `${event.end.dateTime}Z` : event.end?.date;

    if (!startTime || !endTime) continue;

    // Check if event already exists
    const existing = await query(
      `SELECT id FROM calendar_events WHERE external_id = ? AND provider = 'microsoft'`,
      [event.id]
    );

    if (existing.length > 0) {
      // Update existing event
      await query(
        `UPDATE calendar_events
         SET title = ?, description = ?, start_time = ?, end_time = ?,
             location = ?, all_day = ?, last_synced = NOW()
         WHERE external_id = ? AND provider = 'microsoft'`,
        [
          event.subject || 'No title', event.bodyPreview || null,
          startTime, endTime, event.location?.displayName || null, allDay,
          event.id,
        ]
      );
    } else {
      // Insert new event
      const eventId = crypto.randomUUID();
      await query(
        `INSERT INTO calendar_events (id, external_id, provider, title, description, start_time, end_time, location, calendar_name, all_day, last_synced)
         VALUES (?, ?, 'microsoft', ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          eventId, event.id, event.subject || 'No title',
          event.bodyPreview || null, startTime, endTime,
          event.location?.displayName || null, 'Outlook Calendar', allDay,
        ]
      );
    }
    synced++;
  }

  return synced;
}

// GET /api/calendar/connections - list connected providers
router.get('/connections', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT id, provider, connected_at, updated_at FROM calendar_connections ORDER BY connected_at DESC',
      []
    );
    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('List connections error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /api/calendar/connections/:provider - disconnect a calendar
router.delete('/connections/:provider', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;

    if (!['google', 'microsoft'].includes(provider)) {
      return res.status(400).json({ success: false, error: 'Invalid provider. Use google or microsoft.' });
    }

    // Delete connection and cached events
    await query('DELETE FROM calendar_connections WHERE provider = ?', [provider]);
    await query('DELETE FROM calendar_events WHERE provider = ?', [provider]);

    return res.json({ success: true, data: { disconnected: provider } });
  } catch (err: any) {
    console.error('Disconnect calendar error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
