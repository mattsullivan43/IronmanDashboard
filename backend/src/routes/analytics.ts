import { Router, Request, Response } from 'express';
import { query } from '../database/connection';

const router = Router();

// ── GET /api/analytics/monthly-breakdown ────────────────────────────────────

router.get('/monthly-breakdown', async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (start) {
      conditions.push('date >= ?');
      params.push(start);
    }
    if (end) {
      conditions.push('date <= ?');
      params.push(end);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Monthly aggregates
    const months = await query(
      `SELECT
        DATE_FORMAT(date, '%Y-%m-01') as month,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as net,
        COUNT(*) as transaction_count
       FROM transactions
       ${where}
       GROUP BY DATE_FORMAT(date, '%Y-%m-01')
       ORDER BY month ASC`,
      params
    );

    // Top expense category per month
    const topCategories = await query(
      `SELECT
        DATE_FORMAT(date, '%Y-%m-01') as month,
        category,
        SUM(amount) as cat_total
       FROM transactions
       ${where ? where + " AND type = 'expense'" : "WHERE type = 'expense'"}
       GROUP BY DATE_FORMAT(date, '%Y-%m-01'), category
       ORDER BY month ASC, cat_total DESC`,
      params
    );

    // Build a map of month -> top category
    const topCatMap: Record<string, string> = {};
    for (const row of topCategories as any[]) {
      const m = row.month;
      if (!topCatMap[m]) {
        topCatMap[m] = row.category || 'Uncategorized';
      }
    }

    // Category breakdown per month
    const catBreakdown = await query(
      `SELECT
        DATE_FORMAT(date, '%Y-%m-01') as month,
        COALESCE(category, 'Uncategorized') as name,
        COALESCE(SUM(amount), 0) as total
       FROM transactions
       ${where}
       GROUP BY DATE_FORMAT(date, '%Y-%m-01'), category
       ORDER BY month ASC, total DESC`,
      params
    );

    const catMap: Record<string, Array<{ name: string; total: number }>> = {};
    for (const row of catBreakdown as any[]) {
      const m = row.month;
      if (!catMap[m]) catMap[m] = [];
      catMap[m].push({ name: row.name, total: Number(row.total) });
    }

    const data = (months as any[]).map((m) => ({
      month: m.month,
      total_income: Number(m.total_income),
      total_expenses: Number(m.total_expenses),
      net: Number(m.net),
      transaction_count: Number(m.transaction_count),
      top_expense_category: topCatMap[m.month] || 'N/A',
      categories: catMap[m.month] || [],
    }));

    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('[Analytics] monthly-breakdown error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── GET /api/analytics/category-breakdown ───────────────────────────────────

router.get('/category-breakdown', async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query;
    const conditions: string[] = ["type = 'expense'"];
    const params: any[] = [];

    if (start) {
      conditions.push('date >= ?');
      params.push(start);
    }
    if (end) {
      conditions.push('date <= ?');
      params.push(end);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const rows = await query(
      `SELECT
        COALESCE(category, 'Uncategorized') as category,
        COALESCE(SUM(amount), 0) as total,
        COUNT(*) as count,
        COALESCE(AVG(amount), 0) as avg_amount
       FROM transactions
       ${where}
       GROUP BY category
       ORDER BY total DESC`,
      params
    );

    // Calculate total expenses for percentage
    const totalExpenses = (rows as any[]).reduce((sum, r) => sum + Number(r.total), 0);

    const data = (rows as any[]).map((r) => ({
      category: r.category,
      total: Number(r.total),
      count: Number(r.count),
      avg_amount: Number(Number(r.avg_amount).toFixed(2)),
      pct_of_total: totalExpenses > 0 ? Number(((Number(r.total) / totalExpenses) * 100).toFixed(1)) : 0,
    }));

    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('[Analytics] category-breakdown error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── GET /api/analytics/totals ───────────────────────────────────────────────

router.get('/totals', async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (start) {
      conditions.push('date >= ?');
      params.push(start);
    }
    if (end) {
      conditions.push('date <= ?');
      params.push(end);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Aggregated totals
    const totalsRows = await query(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as net,
        COUNT(*) as transaction_count
       FROM transactions
       ${where}`,
      params
    );

    const totals = (totalsRows as any[])[0] || {
      total_income: 0,
      total_expenses: 0,
      net: 0,
      transaction_count: 0,
    };

    // Number of distinct months
    const monthRows = await query(
      `SELECT COUNT(DISTINCT DATE_FORMAT(date, '%Y-%m')) as month_count
       FROM transactions
       ${where}`,
      params
    );
    const monthCount = Number((monthRows as any[])[0]?.month_count) || 1;

    // Largest single expense
    const largestExpRows = await query(
      `SELECT amount, description, date, category
       FROM transactions
       ${where ? where + " AND type = 'expense'" : "WHERE type = 'expense'"}
       ORDER BY amount DESC
       LIMIT 1`,
      params
    );

    // Largest single income
    const largestIncRows = await query(
      `SELECT amount, description, date, category
       FROM transactions
       ${where ? where + " AND type = 'income'" : "WHERE type = 'income'"}
       ORDER BY amount DESC
       LIMIT 1`,
      params
    );

    const totalIncome = Number(totals.total_income);
    const totalExpenses = Number(totals.total_expenses);

    const largestExpense = (largestExpRows as any[])[0]
      ? {
          amount: Number((largestExpRows as any[])[0].amount),
          description: (largestExpRows as any[])[0].description,
          date: (largestExpRows as any[])[0].date,
          category: (largestExpRows as any[])[0].category,
        }
      : null;

    const largestIncome = (largestIncRows as any[])[0]
      ? {
          amount: Number((largestIncRows as any[])[0].amount),
          description: (largestIncRows as any[])[0].description,
          date: (largestIncRows as any[])[0].date,
          category: (largestIncRows as any[])[0].category,
        }
      : null;

    return res.json({
      success: true,
      data: {
        total_income: totalIncome,
        total_expenses: totalExpenses,
        net: Number(totals.net),
        avg_monthly_income: Number((totalIncome / monthCount).toFixed(2)),
        avg_monthly_expenses: Number((totalExpenses / monthCount).toFixed(2)),
        largest_expense: largestExpense,
        largest_income: largestIncome,
        transaction_count: Number(totals.transaction_count),
      },
    });
  } catch (err: any) {
    console.error('[Analytics] totals error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
