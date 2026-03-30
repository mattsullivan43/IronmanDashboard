import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../database/connection';

const router = Router();

// GET /api/metrics/overview - MRR, ARR, cash balance, burn rate, runway, net P/L this month
router.get('/overview', async (_req: Request, res: Response) => {
  try {
    // MRR from active clients
    const mrrResult = await query(
      `SELECT COALESCE(SUM(monthly_revenue + monthly_recurring_fee), 0) as mrr
       FROM clients WHERE status = 'active'`,
      []
    );
    const mrr = parseFloat(mrrResult[0].mrr);
    const arr = mrr * 12;

    // Latest cash balance
    const cashResult = await query(
      'SELECT balance FROM cash_balances ORDER BY date DESC, created_at DESC LIMIT 1',
      []
    );
    const cashBalance = cashResult.length > 0 ? parseFloat(cashResult[0].balance) : 0;

    // This month's expenses (burn)
    const burnResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_expenses
       FROM transactions
       WHERE type = 'expense'
         AND date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
         AND date < DATE_FORMAT(CURDATE(), '%Y-%m-01') + INTERVAL 1 MONTH`,
      []
    );
    const monthlyExpenses = parseFloat(burnResult[0].total_expenses);

    // Average monthly burn over last 3 months
    const avgBurnResult = await query(
      `SELECT COALESCE(AVG(monthly_total), 0) as avg_burn FROM (
        SELECT DATE_FORMAT(date, '%Y-%m-01') as m, SUM(amount) as monthly_total
        FROM transactions
        WHERE type = 'expense'
          AND date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
        GROUP BY DATE_FORMAT(date, '%Y-%m-01')
      ) sub`,
      []
    );
    const burnRate = parseFloat(avgBurnResult[0].avg_burn);
    const runway = burnRate > 0 ? Math.round(cashBalance / burnRate) : null;

    // This month's income
    const incomeResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_income
       FROM transactions
       WHERE type = 'income'
         AND date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
         AND date < DATE_FORMAT(CURDATE(), '%Y-%m-01') + INTERVAL 1 MONTH`,
      []
    );
    const monthlyIncome = parseFloat(incomeResult[0].total_income);
    const netProfitLoss = monthlyIncome - monthlyExpenses;

    // Active client count
    const clientCount = await query(
      "SELECT COUNT(*) as count FROM clients WHERE status = 'active'",
      []
    );

    return res.json({
      success: true,
      data: {
        mrr,
        arr,
        cash_balance: cashBalance,
        burn_rate: burnRate,
        runway_months: runway,
        monthly_income: monthlyIncome,
        monthly_expenses: monthlyExpenses,
        net_profit_loss: netProfitLoss,
        active_clients: parseInt(clientCount[0].count, 10),
      },
    });
  } catch (err: any) {
    console.error('Overview metrics error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/metrics/revenue - MRR over time, by product line, net new MRR, churn rate, NRR
router.get('/revenue', async (req: Request, res: Response) => {
  try {
    const { months } = req.query;
    const monthCount = parseInt(months as string, 10) || 12;

    // Current MRR by product line
    const byProductLine = await query(
      `SELECT
        product_line,
        COUNT(*) as client_count,
        COALESCE(SUM(monthly_revenue + monthly_recurring_fee), 0) as mrr
       FROM clients WHERE status = 'active'
       GROUP BY product_line`,
      []
    );

    // MRR over time from snapshots
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthCount);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    const mrrHistory = await query(
      `SELECT month, mrr, new_mrr, expansion_mrr, churned_mrr,
              boomline_mrr, ai_receptionist_mrr, custom_software_revenue,
              total_customers, churned_customers
       FROM revenue_snapshots
       WHERE month >= ?
       ORDER BY month ASC`,
      [cutoffStr]
    );

    // Churn rate: churned clients in last 30 days / total active at start
    const churnResult = await query(
      `SELECT
        (SELECT COUNT(*) FROM clients WHERE status = 'churned' AND updated_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) as recently_churned,
        (SELECT COUNT(*) FROM clients WHERE status IN ('active', 'churned')) as total_base`,
      []
    );
    const recentlyChurned = parseInt(churnResult[0].recently_churned, 10);
    const totalBase = parseInt(churnResult[0].total_base, 10);
    const churnRate = totalBase > 0 ? (recentlyChurned / totalBase) * 100 : 0;

    // Net Revenue Retention from latest snapshot
    let nrr = 100;
    if (mrrHistory.length >= 2) {
      const latest = mrrHistory[mrrHistory.length - 1];
      const previous = mrrHistory[mrrHistory.length - 2];
      const prevMrr = parseFloat(previous.mrr);
      if (prevMrr > 0) {
        nrr = ((prevMrr + parseFloat(latest.expansion_mrr || '0') - parseFloat(latest.churned_mrr || '0')) / prevMrr) * 100;
      }
    }

    return res.json({
      success: true,
      data: {
        by_product_line: byProductLine,
        mrr_history: mrrHistory,
        churn_rate: Math.round(churnRate * 100) / 100,
        net_revenue_retention: Math.round(nrr * 100) / 100,
      },
    });
  } catch (err: any) {
    console.error('Revenue metrics error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/metrics/unit-economics - CAC, LTV, LTV:CAC, payback period
router.get('/unit-economics', async (_req: Request, res: Response) => {
  try {
    // Total sales & marketing spend last 6 months
    const salesSpend = await query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM transactions
       WHERE type = 'expense'
         AND category = 'Sales & Marketing'
         AND date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)`,
      []
    );

    // New customers acquired last 6 months
    const newCustomers = await query(
      `SELECT COUNT(*) as count FROM clients
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
         AND status IN ('active', 'churned')`,
      []
    );

    const totalSalesSpend = parseFloat(salesSpend[0].total);
    const newCustCount = parseInt(newCustomers[0].count, 10);
    const cac = newCustCount > 0 ? totalSalesSpend / newCustCount : 0;

    // Average revenue per customer (ARPU)
    const arpuResult = await query(
      `SELECT COALESCE(AVG(monthly_revenue + monthly_recurring_fee), 0) as arpu
       FROM clients WHERE status = 'active'`,
      []
    );
    const arpu = parseFloat(arpuResult[0].arpu);

    // Average COGS per customer
    const avgCogs = await query(
      `SELECT COALESCE(AVG(cogs_monthly), 0) as avg_cogs
       FROM clients WHERE status = 'active' AND cogs_monthly > 0`,
      []
    );
    const cogsPerCustomer = parseFloat(avgCogs[0].avg_cogs);

    // Gross margin per customer
    const grossMarginPerCustomer = arpu - cogsPerCustomer;

    // Churn rate (monthly)
    const churnData = await query(
      `SELECT
        (SELECT COUNT(*) FROM clients WHERE status = 'churned' AND updated_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) as churned,
        (SELECT COUNT(*) FROM clients WHERE status IN ('active', 'churned')) as total`,
      []
    );
    const monthlyChurnRate = parseInt(churnData[0].total, 10) > 0
      ? parseInt(churnData[0].churned, 10) / parseInt(churnData[0].total, 10)
      : 0;

    // LTV = ARPU / monthly churn rate (or ARPU * 36 if no churn)
    const ltv = monthlyChurnRate > 0
      ? grossMarginPerCustomer / monthlyChurnRate
      : grossMarginPerCustomer * 36;

    const ltvCacRatio = cac > 0 ? ltv / cac : null;
    const paybackPeriod = grossMarginPerCustomer > 0 ? cac / grossMarginPerCustomer : null;

    return res.json({
      success: true,
      data: {
        cac: Math.round(cac * 100) / 100,
        ltv: Math.round(ltv * 100) / 100,
        ltv_cac_ratio: ltvCacRatio ? Math.round(ltvCacRatio * 100) / 100 : null,
        payback_period_months: paybackPeriod ? Math.round(paybackPeriod * 10) / 10 : null,
        arpu: Math.round(arpu * 100) / 100,
        monthly_churn_rate: Math.round(monthlyChurnRate * 10000) / 100,
      },
    });
  } catch (err: any) {
    console.error('Unit economics error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/metrics/profitability - gross margin, net margin, COGS breakdown
router.get('/profitability', async (req: Request, res: Response) => {
  try {
    const { months } = req.query;
    const monthCount = parseInt(months as string, 10) || 3;

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthCount);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    // Revenue this period
    const revenueResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_revenue
       FROM transactions
       WHERE type = 'income'
         AND date >= ?`,
      [cutoffStr]
    );
    const totalRevenue = parseFloat(revenueResult[0].total_revenue);

    // COGS from transactions
    const cogsResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_cogs
       FROM transactions
       WHERE type = 'expense'
         AND category = 'COGS'
         AND date >= ?`,
      [cutoffStr]
    );
    const totalCogs = parseFloat(cogsResult[0].total_cogs);

    // All expenses by category
    const expenseBreakdown = await query(
      `SELECT category, COALESCE(SUM(amount), 0) as total
       FROM transactions
       WHERE type = 'expense'
         AND date >= ?
       GROUP BY category
       ORDER BY total DESC`,
      [cutoffStr]
    );

    const totalExpenses = expenseBreakdown.reduce(
      (sum: number, row: any) => sum + parseFloat(row.total), 0
    );

    const grossProfit = totalRevenue - totalCogs;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const netProfit = totalRevenue - totalExpenses;
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // COGS breakdown from client-level cogs
    const cogsBreakdown = await query(
      `SELECT product_line, COALESCE(SUM(cogs_monthly), 0) as monthly_cogs
       FROM clients WHERE status = 'active' AND cogs_monthly > 0
       GROUP BY product_line`,
      []
    );

    return res.json({
      success: true,
      data: {
        period_months: monthCount,
        total_revenue: totalRevenue,
        total_cogs: totalCogs,
        gross_profit: grossProfit,
        gross_margin: Math.round(grossMargin * 100) / 100,
        total_expenses: totalExpenses,
        net_profit: netProfit,
        net_margin: Math.round(netMargin * 100) / 100,
        expense_breakdown: expenseBreakdown,
        cogs_breakdown: cogsBreakdown,
      },
    });
  } catch (err: any) {
    console.error('Profitability error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/metrics/cash-burn - burn rate, runway, burn multiple, break-even
router.get('/cash-burn', async (_req: Request, res: Response) => {
  try {
    // Monthly burn over last 6 months
    const burnHistory = await query(
      `SELECT
        DATE_FORMAT(date, '%Y-%m-01') as month,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expenses,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income
       FROM transactions
       WHERE date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY DATE_FORMAT(date, '%Y-%m-01')
       ORDER BY month ASC`,
      []
    );

    // Average gross burn
    const avgGrossBurn = burnHistory.length > 0
      ? burnHistory.reduce((sum: number, r: any) => sum + parseFloat(r.expenses), 0) / burnHistory.length
      : 0;

    // Average net burn
    const avgNetBurn = burnHistory.length > 0
      ? burnHistory.reduce((sum: number, r: any) => sum + (parseFloat(r.expenses) - parseFloat(r.income)), 0) / burnHistory.length
      : 0;

    // Cash balance
    const cashResult = await query(
      'SELECT balance FROM cash_balances ORDER BY date DESC, created_at DESC LIMIT 1',
      []
    );
    const cashBalance = cashResult.length > 0 ? parseFloat(cashResult[0].balance) : 0;

    const grossRunway = avgGrossBurn > 0 ? Math.round(cashBalance / avgGrossBurn) : null;
    const netRunway = avgNetBurn > 0 ? Math.round(cashBalance / avgNetBurn) : null;

    // Burn multiple = net burn / net new ARR (from latest snapshot)
    const latestSnapshot = await query(
      'SELECT new_mrr FROM revenue_snapshots ORDER BY month DESC LIMIT 1',
      []
    );
    const netNewArr = latestSnapshot.length > 0
      ? parseFloat(latestSnapshot[0].new_mrr) * 12
      : 0;
    const burnMultiple = netNewArr > 0 ? (avgNetBurn * 12) / netNewArr : null;

    // Break-even: month where income >= expenses
    const mrrResult = await query(
      "SELECT COALESCE(SUM(monthly_revenue + monthly_recurring_fee), 0) as mrr FROM clients WHERE status = 'active'",
      []
    );
    const currentMrr = parseFloat(mrrResult[0].mrr);
    const breakEvenGap = avgGrossBurn - currentMrr;

    return res.json({
      success: true,
      data: {
        cash_balance: cashBalance,
        avg_gross_burn: Math.round(avgGrossBurn * 100) / 100,
        avg_net_burn: Math.round(avgNetBurn * 100) / 100,
        gross_runway_months: grossRunway,
        net_runway_months: netRunway,
        burn_multiple: burnMultiple ? Math.round(burnMultiple * 100) / 100 : null,
        current_mrr: currentMrr,
        break_even_gap: Math.round(breakEvenGap * 100) / 100,
        burn_history: burnHistory,
      },
    });
  } catch (err: any) {
    console.error('Cash burn error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/metrics/boomline - crane economics
router.get('/boomline', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT
        id, company_name, crane_count, per_crane_rate,
        monthly_revenue, implementation_fee, implementation_fee_collected,
        cogs_monthly, status, contract_start_date
       FROM clients
       WHERE product_line = 'boomline'
       ORDER BY created_at DESC`,
      []
    );

    const clients = result;
    const activeClients = clients.filter((c: any) => c.status === 'active');

    const totalCranes = activeClients.reduce((sum: number, c: any) => sum + (c.crane_count || 0), 0);
    const totalRevenue = activeClients.reduce((sum: number, c: any) => sum + parseFloat(c.monthly_revenue || '0'), 0);
    const totalCogs = activeClients.reduce((sum: number, c: any) => sum + parseFloat(c.cogs_monthly || '0'), 0);
    const totalMargin = totalRevenue - totalCogs;

    const revPerCrane = totalCranes > 0 ? totalRevenue / totalCranes : 0;
    const costPerCrane = totalCranes > 0 ? totalCogs / totalCranes : 0;
    const marginPerCrane = totalCranes > 0 ? totalMargin / totalCranes : 0;

    // Crane count over time from snapshots
    const craneHistory = await query(
      `SELECT month, boomline_mrr FROM revenue_snapshots ORDER BY month ASC`,
      []
    );

    return res.json({
      success: true,
      data: {
        clients,
        totals: {
          total_cranes: totalCranes,
          total_monthly_revenue: totalRevenue,
          total_monthly_cogs: totalCogs,
          total_margin: totalMargin,
          rev_per_crane: Math.round(revPerCrane * 100) / 100,
          cost_per_crane: Math.round(costPerCrane * 100) / 100,
          margin_per_crane: Math.round(marginPerCrane * 100) / 100,
        },
        history: craneHistory,
      },
    });
  } catch (err: any) {
    console.error('Boomline metrics error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/metrics/ai-receptionist - per-client and aggregate metrics
router.get('/ai-receptionist', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT
        id, company_name, monthly_recurring_fee, setup_fee, setup_fee_collected,
        cogs_monthly, status, contract_start_date
       FROM clients
       WHERE product_line = 'ai_receptionist'
       ORDER BY created_at DESC`,
      []
    );

    const clients = result;
    const activeClients = clients.filter((c: any) => c.status === 'active');

    const totalMrr = activeClients.reduce((sum: number, c: any) => sum + parseFloat(c.monthly_recurring_fee || '0'), 0);
    const totalCogs = activeClients.reduce((sum: number, c: any) => sum + parseFloat(c.cogs_monthly || '0'), 0);
    const totalMargin = totalMrr - totalCogs;
    const avgMargin = activeClients.length > 0 ? totalMargin / activeClients.length : 0;
    const marginPercent = totalMrr > 0 ? (totalMargin / totalMrr) * 100 : 0;

    // Per-client metrics
    const perClient = activeClients.map((c: any) => {
      const rev = parseFloat(c.monthly_recurring_fee || '0');
      const cogs = parseFloat(c.cogs_monthly || '0');
      const margin = rev - cogs;
      return {
        id: c.id,
        company_name: c.company_name,
        monthly_revenue: rev,
        monthly_cogs: cogs,
        margin,
        margin_percent: rev > 0 ? Math.round((margin / rev) * 10000) / 100 : 0,
      };
    });

    return res.json({
      success: true,
      data: {
        clients,
        per_client: perClient,
        totals: {
          active_clients: activeClients.length,
          total_mrr: totalMrr,
          total_cogs: totalCogs,
          total_margin: totalMargin,
          avg_margin_per_client: Math.round(avgMargin * 100) / 100,
          margin_percent: Math.round(marginPercent * 100) / 100,
        },
      },
    });
  } catch (err: any) {
    console.error('AI Receptionist metrics error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/metrics/cash-balance - update cash balance manually
router.post('/cash-balance', async (req: Request, res: Response) => {
  try {
    const { balance, date, notes } = req.body;

    if (balance === undefined || balance === null) {
      return res.status(400).json({ success: false, error: 'balance is required' });
    }

    const id = crypto.randomUUID();
    const dateVal = date || new Date().toISOString().split('T')[0];

    await query(
      `INSERT INTO cash_balances (id, balance, source, date, notes)
       VALUES (?, 'manual', ?, ?)`,
      [id, parseFloat(balance), dateVal, notes || null]
    );

    const result = await query(
      'SELECT * FROM cash_balances WHERE id = ?',
      [id]
    );

    return res.status(201).json({ success: true, data: result[0] });
  } catch (err: any) {
    console.error('Update cash balance error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/metrics/revenue-snapshots - historical MRR snapshots
router.get('/revenue-snapshots', async (req: Request, res: Response) => {
  try {
    const { months } = req.query;
    const monthCount = parseInt(months as string, 10) || 24;

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthCount);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    const result = await query(
      `SELECT * FROM revenue_snapshots
       WHERE month >= ?
       ORDER BY month ASC`,
      [cutoffStr]
    );

    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('Revenue snapshots error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/metrics/revenue-snapshots - create monthly snapshot
router.post('/revenue-snapshots', async (req: Request, res: Response) => {
  try {
    const { month } = req.body;
    const snapshotMonth = month || new Date().toISOString().slice(0, 7) + '-01';

    // Calculate current MRR breakdown
    const mrrData = await query(
      `SELECT
        COALESCE(SUM(CASE WHEN product_line = 'boomline' THEN monthly_revenue ELSE 0 END), 0) as boomline_mrr,
        COALESCE(SUM(CASE WHEN product_line = 'ai_receptionist' THEN monthly_recurring_fee ELSE 0 END), 0) as ai_receptionist_mrr,
        COALESCE(SUM(CASE WHEN product_line = 'custom_software' THEN monthly_revenue ELSE 0 END), 0) as custom_software_revenue,
        COALESCE(SUM(monthly_revenue + monthly_recurring_fee), 0) as total_mrr,
        COUNT(*) as total_customers
       FROM clients WHERE status = 'active'`,
      []
    );

    const data = mrrData[0];

    // Get previous month snapshot for net new / churn calculations
    const prevSnapshot = await query(
      `SELECT mrr, total_customers FROM revenue_snapshots
       WHERE month < ? ORDER BY month DESC LIMIT 1`,
      [snapshotMonth]
    );

    const prevMrr = prevSnapshot.length > 0 ? parseFloat(prevSnapshot[0].mrr) : 0;
    const currentMrr = parseFloat(data.total_mrr);
    const mrrChange = currentMrr - prevMrr;
    const newMrr = mrrChange > 0 ? mrrChange : 0;
    const churnedMrr = mrrChange < 0 ? Math.abs(mrrChange) : 0;

    // Recently churned customers
    const churnedCount = await query(
      `SELECT COUNT(*) as count FROM clients
       WHERE status = 'churned' AND updated_at >= DATE_SUB(?, INTERVAL 30 DAY)`,
      [snapshotMonth]
    );

    const id = crypto.randomUUID();
    const totalCustomers = parseInt(data.total_customers, 10);
    const churnedCustomers = parseInt(churnedCount[0].count, 10);

    await query(
      `INSERT INTO revenue_snapshots (
        id, month, mrr, new_mrr, expansion_mrr, churned_mrr,
        boomline_mrr, ai_receptionist_mrr, custom_software_revenue,
        total_customers, churned_customers
      ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        mrr = VALUES(mrr), new_mrr = VALUES(new_mrr),
        churned_mrr = VALUES(churned_mrr),
        boomline_mrr = VALUES(boomline_mrr),
        ai_receptionist_mrr = VALUES(ai_receptionist_mrr),
        custom_software_revenue = VALUES(custom_software_revenue),
        total_customers = VALUES(total_customers),
        churned_customers = VALUES(churned_customers)`,
      [
        id, snapshotMonth, currentMrr, newMrr, churnedMrr,
        parseFloat(data.boomline_mrr), parseFloat(data.ai_receptionist_mrr),
        parseFloat(data.custom_software_revenue),
        totalCustomers, churnedCustomers,
      ]
    );

    const result = await query(
      'SELECT * FROM revenue_snapshots WHERE month = ?',
      [snapshotMonth]
    );

    return res.status(201).json({ success: true, data: result[0] });
  } catch (err: any) {
    console.error('Create snapshot error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
