import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../database/connection';

const router = Router();

// GET /api/commissions/summary - total owed, paid, outstanding by rep
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT
        rep_name,
        COUNT(*) as total_deals,
        COALESCE(SUM(commission_amount), 0) as total_commission,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN commission_amount ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN status = 'unpaid' THEN commission_amount ELSE 0 END), 0) as total_unpaid,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END), 0) as total_pending
       FROM commissions
       GROUP BY rep_name
       ORDER BY rep_name`,
      []
    );

    const totals = await query(
      `SELECT
        COALESCE(SUM(commission_amount), 0) as grand_total,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN commission_amount ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN status IN ('unpaid', 'pending') THEN commission_amount ELSE 0 END), 0) as total_outstanding
       FROM commissions`,
      []
    );

    return res.json({
      success: true,
      data: {
        by_rep: result,
        totals: totals[0],
      },
    });
  } catch (err: any) {
    console.error('Commission summary error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/commissions - list all, filter by rep and status
router.get('/', async (req: Request, res: Response) => {
  try {
    const { rep_name, status } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (rep_name) {
      conditions.push(`c.rep_name = ?`);
      params.push(rep_name);
    }
    if (status) {
      conditions.push(`c.status = ?`);
      params.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT c.*, cl.company_name as client_name
       FROM commissions c
       LEFT JOIN clients cl ON c.client_id = cl.id
       ${where}
       ORDER BY c.created_at DESC`,
      params
    );

    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('List commissions error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/commissions - create commission entry
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      rep_name, client_id, deal_description, deal_value,
      commission_rate, commission_amount, status, date_closed, date_paid,
    } = req.body;

    if (!rep_name || deal_value === undefined || commission_rate === undefined) {
      return res.status(400).json({
        success: false,
        error: 'rep_name, deal_value, and commission_rate are required',
      });
    }

    const calcAmount = commission_amount !== undefined
      ? commission_amount
      : parseFloat(deal_value) * parseFloat(commission_rate);

    const id = crypto.randomUUID();

    await query(
      `INSERT INTO commissions (
        id, rep_name, client_id, deal_description, deal_value,
        commission_rate, commission_amount, status, date_closed, date_paid
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, rep_name, client_id || null, deal_description || null,
        parseFloat(deal_value), parseFloat(commission_rate), calcAmount,
        status || 'unpaid', date_closed || null, date_paid || null,
      ]
    );

    const result = await query('SELECT * FROM commissions WHERE id = ?', [id]);

    return res.status(201).json({ success: true, data: result[0] });
  } catch (err: any) {
    console.error('Create commission error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PUT /api/commissions/:id - update (mark paid, etc)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;

    const existing = await query('SELECT id FROM commissions WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Commission not found' });
    }

    const allowedFields = [
      'rep_name', 'client_id', 'deal_description', 'deal_value',
      'commission_rate', 'commission_amount', 'status', 'date_closed', 'date_paid',
    ];

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        params.push(fields[field]);
      }
    }

    // Auto-set date_paid when marking as paid
    if (fields.status === 'paid' && !fields.date_paid) {
      setClauses.push(`date_paid = ?`);
      params.push(new Date().toISOString().split('T')[0]);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    params.push(id);
    await query(
      `UPDATE commissions SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    const result = await query('SELECT * FROM commissions WHERE id = ?', [id]);

    return res.json({ success: true, data: result[0] });
  } catch (err: any) {
    console.error('Update commission error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /api/commissions/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT id FROM commissions WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Commission not found' });
    }

    await query('DELETE FROM commissions WHERE id = ?', [id]);

    return res.json({ success: true, data: { deleted: id } });
  } catch (err: any) {
    console.error('Delete commission error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
