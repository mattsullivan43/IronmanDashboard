import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../database/connection';

const router = Router();

// GET /api/transactions/summary - monthly inflows vs outflows
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const { months } = req.query;
    const monthCount = parseInt(months as string, 10) || 12;

    const result = await query(
      `SELECT
        DATE_FORMAT(date, '%Y-%m-01') as month,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as inflows,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as outflows,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as net
       FROM transactions
       WHERE date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ? MONTH)
       GROUP BY DATE_FORMAT(date, '%Y-%m-01')
       ORDER BY month DESC`,
      [monthCount]
    );

    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('Transaction summary error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/transactions/by-category - totals grouped by category for a date range
router.get('/by-category', async (req: Request, res: Response) => {
  try {
    const { start_date, end_date, type } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (start_date) {
      conditions.push(`date >= ?`);
      params.push(start_date);
    }
    if (end_date) {
      conditions.push(`date <= ?`);
      params.push(end_date);
    }
    if (type) {
      conditions.push(`type = ?`);
      params.push(type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT
        COALESCE(category, 'Uncategorized') as category,
        type,
        COUNT(*) as transaction_count,
        COALESCE(SUM(amount), 0) as total
       FROM transactions
       ${where}
       GROUP BY category, type
       ORDER BY total DESC`,
      params
    );

    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('By-category error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PUT /api/transactions/bulk-categorize
router.put('/bulk-categorize', async (req: Request, res: Response) => {
  try {
    const { transaction_ids, category } = req.body;

    if (!transaction_ids || !Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'transaction_ids array is required' });
    }
    if (!category) {
      return res.status(400).json({ success: false, error: 'category is required' });
    }

    const placeholders = transaction_ids.map(() => '?').join(', ');
    await query(
      `UPDATE transactions SET category = ? WHERE id IN (${placeholders})`,
      [category, ...transaction_ids]
    );

    const selectPlaceholders = transaction_ids.map(() => '?').join(', ');
    const updated = await query(
      `SELECT id, category FROM transactions WHERE id IN (${selectPlaceholders})`,
      transaction_ids
    );

    return res.json({
      success: true,
      data: { updated: updated.length, transactions: updated },
    });
  } catch (err: any) {
    console.error('Bulk categorize error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/transactions - list with filters and pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      start_date, end_date, category, type, min_amount, max_amount,
      search, page, limit: limitParam, sort_by, sort_order,
    } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];

    if (start_date) {
      conditions.push(`t.date >= ?`);
      params.push(start_date);
    }
    if (end_date) {
      conditions.push(`t.date <= ?`);
      params.push(end_date);
    }
    if (category) {
      conditions.push(`t.category = ?`);
      params.push(category);
    }
    if (type) {
      conditions.push(`t.type = ?`);
      params.push(type);
    }
    if (min_amount) {
      conditions.push(`t.amount >= ?`);
      params.push(parseFloat(min_amount as string));
    }
    if (max_amount) {
      conditions.push(`t.amount <= ?`);
      params.push(parseFloat(max_amount as string));
    }
    if (search) {
      conditions.push(`t.description LIKE ?`);
      params.push(`%${search}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Pagination
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const pageLimit = Math.min(200, Math.max(1, parseInt(limitParam as string, 10) || 50));
    const offset = (pageNum - 1) * pageLimit;

    // Sorting
    const allowedSorts = ['date', 'amount', 'category', 'type', 'description', 'created_at'];
    const sortColumn = allowedSorts.includes(sort_by as string) ? sort_by : 'date';
    const order = sort_order === 'asc' ? 'ASC' : 'DESC';

    // Count total
    const countResult = await query(
      `SELECT COUNT(*) as total FROM transactions t ${where}`,
      params
    );
    const total = parseInt(countResult[0].total, 10);

    // Fetch page
    const result = await query(
      `SELECT t.*, c.company_name as client_name
       FROM transactions t
       LEFT JOIN clients c ON t.client_id = c.id
       ${where}
       ORDER BY t.${sortColumn} ${order}
       LIMIT ? OFFSET ?`,
      [...params, pageLimit, offset]
    );

    return res.json({
      success: true,
      data: {
        transactions: result,
        pagination: {
          page: pageNum,
          limit: pageLimit,
          total,
          total_pages: Math.ceil(total / pageLimit),
        },
      },
    });
  } catch (err: any) {
    console.error('List transactions error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/transactions - manual entry
router.post('/', async (req: Request, res: Response) => {
  try {
    const { date, amount, description, type, category, custom_category, account_name, client_id } = req.body;

    if (!date || amount === undefined) {
      return res.status(400).json({ success: false, error: 'date and amount are required' });
    }

    const id = crypto.randomUUID();

    await query(
      `INSERT INTO transactions (id, date, amount, description, source, type, category, custom_category, account_name, client_id)
       VALUES (?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?)`,
      [
        id, date, Math.abs(parseFloat(amount)), description || null,
        type || 'expense', category || null, custom_category || null,
        account_name || null, client_id || null,
      ]
    );

    const result = await query('SELECT * FROM transactions WHERE id = ?', [id]);

    return res.status(201).json({ success: true, data: result[0] });
  } catch (err: any) {
    console.error('Create transaction error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PUT /api/transactions/:id - update
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;

    const existing = await query('SELECT id FROM transactions WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    const allowedFields = ['date', 'amount', 'description', 'type', 'category', 'custom_category', 'account_name', 'client_id'];
    const setClauses: string[] = [];
    const params: any[] = [];

    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        params.push(field === 'amount' ? Math.abs(parseFloat(fields[field])) : fields[field]);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    params.push(id);
    await query(
      `UPDATE transactions SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    const result = await query('SELECT * FROM transactions WHERE id = ?', [id]);

    return res.json({ success: true, data: result[0] });
  } catch (err: any) {
    console.error('Update transaction error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT id FROM transactions WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    await query('DELETE FROM transactions WHERE id = ?', [id]);

    return res.json({ success: true, data: { deleted: id } });
  } catch (err: any) {
    console.error('Delete transaction error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
