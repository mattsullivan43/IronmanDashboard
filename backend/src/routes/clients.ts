import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../database/connection';

const router = Router();

// GET /api/clients/stats - must be before /:id to avoid route conflict
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const totalActive = await query(
      "SELECT COUNT(*) as count FROM clients WHERE status = 'active'",
      []
    );

    const byProductLine = await query(
      `SELECT product_line, COUNT(*) as count, COALESCE(SUM(monthly_revenue + monthly_recurring_fee), 0) as mrr
       FROM clients WHERE status = 'active'
       GROUP BY product_line`,
      []
    );

    const totalMrr = await query(
      "SELECT COALESCE(SUM(monthly_revenue + monthly_recurring_fee), 0) as total_mrr FROM clients WHERE status = 'active'",
      []
    );

    const byStatus = await query(
      'SELECT status, COUNT(*) as count FROM clients GROUP BY status',
      []
    );

    return res.json({
      success: true,
      data: {
        total_active: parseInt(totalActive[0].count, 10),
        total_mrr: parseFloat(totalMrr[0].total_mrr),
        by_product_line: byProductLine,
        by_status: byStatus,
      },
    });
  } catch (err: any) {
    console.error('Client stats error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/clients - list all with filtering
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, product_line, search } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (status) {
      conditions.push(`status = ?`);
      params.push(status);
    }
    if (product_line) {
      conditions.push(`product_line = ?`);
      params.push(product_line);
    }
    if (search) {
      conditions.push(`(company_name LIKE ? OR contact_name LIKE ? OR contact_email LIKE ?)`);
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT * FROM clients ${where} ORDER BY created_at DESC`,
      params
    );

    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('List clients error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/clients/:id - single client with revenue history
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const clientResult = await query('SELECT * FROM clients WHERE id = ?', [id]);
    if (clientResult.length === 0) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    const revenueHistory = await query(
      `SELECT date, amount, description, type, category
       FROM transactions
       WHERE client_id = ?
       ORDER BY date DESC
       LIMIT 50`,
      [id]
    );

    const commissions = await query(
      `SELECT id, rep_name, deal_value, commission_amount, status, date_closed
       FROM commissions
       WHERE client_id = ?
       ORDER BY date_closed DESC`,
      [id]
    );

    return res.json({
      success: true,
      data: {
        ...clientResult[0],
        revenue_history: revenueHistory,
        commissions: commissions,
      },
    });
  } catch (err: any) {
    console.error('Get client error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/clients - create client
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      company_name, contact_name, contact_email, product_line, status,
      contract_start_date, contract_end_date, contract_terms,
      monthly_revenue, one_time_fee, one_time_fee_collected,
      crane_count, per_crane_rate, implementation_fee, implementation_fee_collected,
      setup_fee, setup_fee_collected, monthly_recurring_fee, cogs_monthly,
      project_value, project_paid, notes,
    } = req.body;

    if (!company_name || !product_line) {
      return res.status(400).json({ success: false, error: 'company_name and product_line are required' });
    }

    const id = crypto.randomUUID();

    await query(
      `INSERT INTO clients (
        id, company_name, contact_name, contact_email, product_line, status,
        contract_start_date, contract_end_date, contract_terms,
        monthly_revenue, one_time_fee, one_time_fee_collected,
        crane_count, per_crane_rate, implementation_fee, implementation_fee_collected,
        setup_fee, setup_fee_collected, monthly_recurring_fee, cogs_monthly,
        project_value, project_paid, notes
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )`,
      [
        id, company_name, contact_name || null, contact_email || null, product_line,
        status || 'active', contract_start_date || null, contract_end_date || null,
        contract_terms || null, monthly_revenue || 0, one_time_fee || 0,
        one_time_fee_collected || false, crane_count || 0, per_crane_rate || 0,
        implementation_fee || 0, implementation_fee_collected || false,
        setup_fee || 0, setup_fee_collected || false, monthly_recurring_fee || 0,
        cogs_monthly || 0, project_value || 0, project_paid || 0, notes || null,
      ]
    );

    const result = await query('SELECT * FROM clients WHERE id = ?', [id]);

    return res.status(201).json({ success: true, data: result[0] });
  } catch (err: any) {
    console.error('Create client error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PUT /api/clients/:id - update client
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;

    // Check client exists
    const existing = await query('SELECT id FROM clients WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    // Build dynamic update
    const allowedFields = [
      'company_name', 'contact_name', 'contact_email', 'product_line', 'status',
      'contract_start_date', 'contract_end_date', 'contract_terms',
      'monthly_revenue', 'one_time_fee', 'one_time_fee_collected',
      'crane_count', 'per_crane_rate', 'implementation_fee', 'implementation_fee_collected',
      'setup_fee', 'setup_fee_collected', 'monthly_recurring_fee', 'cogs_monthly',
      'project_value', 'project_paid', 'notes',
    ];

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        params.push(fields[field]);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    await query(
      `UPDATE clients SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    const result = await query('SELECT * FROM clients WHERE id = ?', [id]);

    return res.json({ success: true, data: result[0] });
  } catch (err: any) {
    console.error('Update client error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /api/clients/:id - soft delete (set status to churned)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT id FROM clients WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    await query(
      "UPDATE clients SET status = 'churned', updated_at = NOW() WHERE id = ?",
      [id]
    );

    const result = await query('SELECT * FROM clients WHERE id = ?', [id]);

    return res.json({ success: true, data: result[0] });
  } catch (err: any) {
    console.error('Delete client error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
