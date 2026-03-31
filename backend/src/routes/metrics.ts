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
       WHERE type = 'expense' AND COALESCE(category,'') != 'Transfer'
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
        WHERE type = 'expense' AND COALESCE(category,'') != 'Transfer'
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
       WHERE type = 'income' AND COALESCE(category,'') != 'Transfer'
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

    // Revenue growth: compare this month's income to last month's
    const prevIncomeResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_income
       FROM transactions
       WHERE type = 'income' AND COALESCE(category,'') != 'Transfer'
         AND date >= DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-01')
         AND date < DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
      []
    );
    const prevIncome = parseFloat(prevIncomeResult[0].total_income);
    const revenueGrowth = prevIncome > 0 ? ((monthlyIncome - prevIncome) / prevIncome) * 100 : 0;
    const profitMargin = monthlyIncome > 0 ? (netProfitLoss / monthlyIncome) * 100 : 0;

    return res.json({
      success: true,
      data: {
        mrr,
        arr,
        cashBalance,
        burnRate,
        runway: runway ?? 0,
        totalRevenue: monthlyIncome,
        totalExpenses: monthlyExpenses,
        netProfit: netProfitLoss,
        revenueGrowth: Math.round(revenueGrowth * 100) / 100,
        expenseGrowth: 0,
        profitMargin: Math.round(profitMargin * 100) / 100,
        activeClients: parseInt(clientCount[0].count, 10),
      },
    });
  } catch (err: any) {
    console.error('Overview metrics error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/metrics/revenue - MRR, ARR, growth, byMonth, byCategory, byClient
// Frontend expects RevenueMetrics shape: { mrr, arr, growth, current, previous, byMonth, byCategory, byClient }
router.get('/revenue', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, months } = req.query;

    // Determine date range
    let start: string;
    let end: string;
    if (startDate && endDate) {
      start = startDate as string;
      end = endDate as string;
    } else {
      const monthCount = parseInt(months as string, 10) || 6;
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - monthCount);
      start = cutoff.toISOString().split('T')[0];
      end = new Date().toISOString().split('T')[0];
    }

    // ── MRR from active clients (contract-based baseline) ──────────────
    const mrrResult = await query(
      `SELECT COALESCE(SUM(monthly_revenue + monthly_recurring_fee), 0) as mrr
       FROM clients WHERE status = 'active'`,
      []
    );
    const clientMrr = parseFloat(mrrResult[0].mrr);

    // ── Monthly revenue/expenses/profit from transactions ──────────────
    const monthlyData = await query(
      `SELECT
        DATE_FORMAT(date, '%Y-%m') as month,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as revenue,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expenses
       FROM transactions
       WHERE date >= ? AND date <= ?
       GROUP BY DATE_FORMAT(date, '%Y-%m')
       ORDER BY month ASC`,
      [start, end]
    );

    const byMonth = monthlyData.map((row: any) => {
      const revenue = parseFloat(row.revenue);
      const expenses = parseFloat(row.expenses);
      return {
        month: row.month,
        revenue,
        expenses,
        profit: revenue - expenses,
      };
    });

    // ── MRR & growth from actual transaction data ──────────────────────
    // Use the most recent full month's income as transaction-based MRR
    // Fall back to client-based MRR if no transaction data
    let transactionMrr = clientMrr;
    let prevMonthRevenue = 0;
    if (byMonth.length >= 1) {
      transactionMrr = byMonth[byMonth.length - 1].revenue;
    }
    if (byMonth.length >= 2) {
      prevMonthRevenue = byMonth[byMonth.length - 2].revenue;
    }

    // Use the higher of client-based MRR and transaction-based MRR
    // (transactions reflect actual payments; client table reflects contracts)
    const mrr = Math.max(clientMrr, transactionMrr);
    const arr = mrr * 12;

    // MRR growth rate: month-over-month change from transactions
    const growth = prevMonthRevenue > 0
      ? (transactionMrr - prevMonthRevenue) / prevMonthRevenue
      : 0;

    // Current & previous period totals
    const current = byMonth.reduce((sum: number, m: any) => sum + m.revenue, 0);
    // For previous, query the same-length period before start
    const startD = new Date(start);
    const endD = new Date(end);
    const rangeDays = Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(startD);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - rangeDays);
    const prevPeriodStr = prevStart.toISOString().split('T')[0];
    const prevEndStr = prevEnd.toISOString().split('T')[0];

    const prevResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM transactions
       WHERE type = 'income' AND COALESCE(category,'') != 'Transfer' AND date >= ? AND date <= ?`,
      [prevPeriodStr, prevEndStr]
    );
    const previous = parseFloat(prevResult[0].total);

    // ── Revenue by category/product line from transactions ─────────────
    // Join with clients to get product_line, fall back to transaction category
    const categoryData = await query(
      `SELECT
        COALESCE(
          CASE c.product_line
            WHEN 'boomline' THEN 'BoomLine'
            WHEN 'ai_receptionist' THEN 'AI Receptionist'
            WHEN 'custom_software' THEN 'Custom Software'
            ELSE NULL
          END,
          t.category,
          'Uncategorized'
        ) as category,
        COALESCE(SUM(t.amount), 0) as amount
       FROM transactions t
       LEFT JOIN clients c ON t.client_id = c.id
       WHERE t.type = 'income' AND t.date >= ? AND t.date <= ?
       GROUP BY category
       ORDER BY amount DESC`,
      [start, end]
    );

    const totalCategoryRevenue = categoryData.reduce(
      (sum: number, row: any) => sum + parseFloat(row.amount), 0
    );

    const byCategory = categoryData.map((row: any) => {
      const amount = parseFloat(row.amount);
      return {
        category: row.category,
        amount,
        percentage: totalCategoryRevenue > 0 ? amount / totalCategoryRevenue : 0,
      };
    });

    // ── Revenue by client from transactions ────────────────────────────
    const clientData = await query(
      `SELECT
        COALESCE(t.client_id, 'unknown') as clientId,
        COALESCE(c.company_name, t.description, 'Unknown') as clientName,
        COALESCE(SUM(t.amount), 0) as revenue
       FROM transactions t
       LEFT JOIN clients c ON t.client_id = c.id
       WHERE t.type = 'income' AND t.date >= ? AND t.date <= ?
       GROUP BY clientId, clientName
       ORDER BY revenue DESC
       LIMIT 20`,
      [start, end]
    );

    const byClient = clientData.map((row: any) => ({
      clientId: row.clientId,
      clientName: row.clientName,
      revenue: parseFloat(row.revenue),
    }));

    return res.json({
      success: true,
      data: {
        mrr,
        arr,
        growth: Math.round(growth * 10000) / 10000,
        current,
        previous,
        byMonth,
        byCategory,
        byClient,
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
       WHERE type = 'expense' AND COALESCE(category,'') != 'Transfer'
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

// GET /api/metrics/profitability - gross margin, net margin, COGS breakdown, monthly P&L
router.get('/profitability', async (req: Request, res: Response) => {
  try {
    // Support both ?months=6 and ?period=6m formats (frontend sends period=6m)
    const { months, period } = req.query;
    let monthCount = parseInt(months as string, 10) || 0;
    if (!monthCount && typeof period === 'string') {
      const match = period.match(/^(\d+)m$/i);
      if (match) monthCount = parseInt(match[1], 10);
    }
    if (!monthCount) monthCount = 6;

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthCount);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    // Monthly breakdown: revenue, COGS, other expenses per month
    const monthlyData = await query(
      `SELECT
        DATE_FORMAT(date, '%Y-%m') as month,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as revenue,
        COALESCE(SUM(CASE WHEN type = 'expense' AND category = 'COGS' THEN amount ELSE 0 END), 0) as cogs,
        COALESCE(SUM(CASE WHEN type = 'expense' AND category != 'COGS' THEN amount ELSE 0 END), 0) as opex,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expenses
       FROM transactions
       WHERE date >= ?
       GROUP BY DATE_FORMAT(date, '%Y-%m')
       ORDER BY month ASC`,
      [cutoffStr]
    );

    const byMonth = monthlyData.map((row: any) => {
      const revenue = parseFloat(row.revenue);
      const cogs = parseFloat(row.cogs);
      const opex = parseFloat(row.opex);
      const grossProfit = revenue - cogs;
      const netProfit = grossProfit - opex;
      return {
        month: row.month,
        revenue,
        cogs,
        grossProfit,
        opex,
        netProfit,
      };
    });

    // Aggregate totals across the period
    const totalRevenue = byMonth.reduce((sum: number, m: any) => sum + m.revenue, 0);
    const totalCogs = byMonth.reduce((sum: number, m: any) => sum + m.cogs, 0);
    const totalOpex = byMonth.reduce((sum: number, m: any) => sum + m.opex, 0);
    const totalExpenses = totalCogs + totalOpex;
    const grossProfit = totalRevenue - totalCogs;
    const grossMargin = totalRevenue > 0 ? grossProfit / totalRevenue : 0;
    const netProfit = grossProfit - totalOpex;
    const netMargin = totalRevenue > 0 ? netProfit / totalRevenue : 0;
    const operatingMargin = totalRevenue > 0 ? (totalRevenue - totalExpenses) / totalRevenue : 0;
    // EBITDA approximated as net profit (no depreciation/amortization/interest/tax data)
    const ebitda = netProfit;

    // Expense breakdown by category
    const expenseRows = await query(
      `SELECT category, COALESCE(SUM(amount), 0) as total
       FROM transactions
       WHERE type = 'expense' AND COALESCE(category,'') != 'Transfer'
         AND date >= ?
       GROUP BY category
       ORDER BY total DESC`,
      [cutoffStr]
    );

    const expenseBreakdown = expenseRows.map((row: any) => {
      const amount = parseFloat(row.total);
      return {
        category: row.category,
        amount,
        percentage: totalExpenses > 0 ? amount / totalExpenses : 0,
      };
    });

    return res.json({
      success: true,
      data: {
        grossProfit,
        grossMargin,
        netProfit,
        netMargin,
        operatingExpenses: totalOpex,
        operatingMargin,
        ebitda,
        byMonth,
        expenseBreakdown,
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

    const netRunway = avgNetBurn > 0 ? cashBalance / avgNetBurn : 0;

    // Monthly burn: use current month's net burn if available, else 3-month avg
    const now = new Date();
    const currentMonthStr = now.toISOString().slice(0, 7);
    const currentMonthEntry = burnHistory.find(
      (r: any) => r.month.startsWith(currentMonthStr)
    );
    const monthlyBurn = currentMonthEntry
      ? parseFloat(currentMonthEntry.expenses) - parseFloat(currentMonthEntry.income)
      : avgNetBurn;

    // Burn trend: compare last two months of burn history
    let burnTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (burnHistory.length >= 2) {
      const recent = burnHistory.slice(-3);
      if (recent.length >= 2) {
        const lastBurn = parseFloat(recent[recent.length - 1].expenses) - parseFloat(recent[recent.length - 1].income);
        const prevBurn = parseFloat(recent[recent.length - 2].expenses) - parseFloat(recent[recent.length - 2].income);
        const change = lastBurn - prevBurn;
        const threshold = prevBurn * 0.1; // 10% threshold
        if (change > threshold) burnTrend = 'increasing';
        else if (change < -threshold) burnTrend = 'decreasing';
      }
    }

    // Map burn_history to byMonth with running balance
    let runningBalance = cashBalance;
    // Build byMonth in reverse to calculate historical balances
    const byMonthReversed = [...burnHistory].reverse().map((r: any) => {
      const inflow = parseFloat(r.income);
      const outflow = parseFloat(r.expenses);
      const netCash = inflow - outflow;
      const balance = runningBalance;
      runningBalance = runningBalance - netCash; // previous month's balance
      return { month: r.month.slice(0, 7), inflow, outflow, netCash, balance };
    });
    const byMonth = byMonthReversed.reverse();

    // Projected runway: 12 months forward based on avg net burn
    const projectedRunway: Array<{ month: string; balance: number }> = [];
    let projBalance = cashBalance;
    for (let i = 1; i <= 12; i++) {
      const projDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const projMonth = projDate.toISOString().slice(0, 7);
      projBalance = Math.max(0, projBalance - avgNetBurn);
      projectedRunway.push({
        month: projMonth,
        balance: Math.round(projBalance * 100) / 100,
      });
    }

    return res.json({
      success: true,
      data: {
        cashBalance,
        monthlyBurn: Math.round(monthlyBurn * 100) / 100,
        runway: Math.round(netRunway * 10) / 10,
        burnTrend,
        byMonth,
        projectedRunway,
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
    const activeClientIds = activeClients.map((c: any) => c.id);

    const totalCranes = activeClients.reduce((sum: number, c: any) => sum + (c.crane_count || 0), 0);
    const contractRevenue = activeClients.reduce((sum: number, c: any) => sum + parseFloat(c.monthly_revenue || '0'), 0);
    const totalCogs = activeClients.reduce((sum: number, c: any) => sum + parseFloat(c.cogs_monthly || '0'), 0);

    // Supplement with actual transaction income for boomline clients (current month)
    let actualRevenue = contractRevenue;
    if (activeClientIds.length > 0) {
      const placeholders = activeClientIds.map(() => '?').join(',');
      const txResult = await query(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM transactions
         WHERE type = 'income' AND COALESCE(category,'') != 'Transfer'
           AND client_id IN (${placeholders})
           AND date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
           AND date < DATE_FORMAT(CURDATE(), '%Y-%m-01') + INTERVAL 1 MONTH`,
        activeClientIds
      );
      const txTotal = parseFloat(txResult[0].total);
      // Use transaction total if it exists (actual payments), otherwise fall back to contract
      if (txTotal > 0) {
        actualRevenue = txTotal;
      }
    }

    const totalRevenue = actualRevenue;
    const totalMargin = totalRevenue - totalCogs;

    const revPerCrane = totalCranes > 0 ? totalRevenue / totalCranes : 0;
    const costPerCrane = totalCranes > 0 ? totalCogs / totalCranes : 0;
    const marginPerCrane = totalCranes > 0 ? totalMargin / totalCranes : 0;

    // Per-client: compare contract vs actual transaction revenue
    const clientsWithActuals = await Promise.all(
      clients.map(async (c: any) => {
        const txResult = await query(
          `SELECT COALESCE(SUM(amount), 0) as total
           FROM transactions
           WHERE type = 'income' AND COALESCE(category,'') != 'Transfer'
             AND client_id = ?
             AND date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
             AND date < DATE_FORMAT(CURDATE(), '%Y-%m-01') + INTERVAL 1 MONTH`,
          [c.id]
        );
        const actualMonthlyRevenue = parseFloat(txResult[0].total);
        return {
          ...c,
          actual_monthly_revenue: actualMonthlyRevenue,
          revenue_validated: actualMonthlyRevenue > 0
            ? Math.abs(actualMonthlyRevenue - parseFloat(c.monthly_revenue || '0')) < 0.01
            : null,
        };
      })
    );

    // Crane count over time from snapshots
    const craneHistory = await query(
      `SELECT month, boomline_mrr FROM revenue_snapshots ORDER BY month ASC`,
      []
    );

    return res.json({
      success: true,
      data: {
        clients: clientsWithActuals,
        totals: {
          total_cranes: totalCranes,
          total_monthly_revenue: totalRevenue,
          total_monthly_revenue_contract: contractRevenue,
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
    const activeClientIds = activeClients.map((c: any) => c.id);

    const contractMrr = activeClients.reduce((sum: number, c: any) => sum + parseFloat(c.monthly_recurring_fee || '0'), 0);
    const totalCogs = activeClients.reduce((sum: number, c: any) => sum + parseFloat(c.cogs_monthly || '0'), 0);

    // Supplement with actual transaction income for AI receptionist clients (current month)
    let actualMrr = contractMrr;
    if (activeClientIds.length > 0) {
      const placeholders = activeClientIds.map(() => '?').join(',');
      const txResult = await query(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM transactions
         WHERE type = 'income' AND COALESCE(category,'') != 'Transfer'
           AND client_id IN (${placeholders})
           AND date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
           AND date < DATE_FORMAT(CURDATE(), '%Y-%m-01') + INTERVAL 1 MONTH`,
        activeClientIds
      );
      const txTotal = parseFloat(txResult[0].total);
      if (txTotal > 0) {
        actualMrr = txTotal;
      }
    }

    const totalMrr = actualMrr;
    const totalMargin = totalMrr - totalCogs;
    const avgMargin = activeClients.length > 0 ? totalMargin / activeClients.length : 0;
    const marginPercent = totalMrr > 0 ? (totalMargin / totalMrr) * 100 : 0;

    // Per-client metrics with transaction validation
    const perClient = await Promise.all(
      activeClients.map(async (c: any) => {
        const contractRev = parseFloat(c.monthly_recurring_fee || '0');
        const cogs = parseFloat(c.cogs_monthly || '0');

        // Check actual transaction revenue for this client
        const txResult = await query(
          `SELECT COALESCE(SUM(amount), 0) as total
           FROM transactions
           WHERE type = 'income' AND COALESCE(category,'') != 'Transfer'
             AND client_id = ?
             AND date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
             AND date < DATE_FORMAT(CURDATE(), '%Y-%m-01') + INTERVAL 1 MONTH`,
          [c.id]
        );
        const actualRev = parseFloat(txResult[0].total);
        const rev = actualRev > 0 ? actualRev : contractRev;
        const margin = rev - cogs;

        return {
          id: c.id,
          company_name: c.company_name,
          monthly_revenue: rev,
          monthly_revenue_contract: contractRev,
          actual_monthly_revenue: actualRev,
          revenue_validated: actualRev > 0
            ? Math.abs(actualRev - contractRev) < 0.01
            : null,
          monthly_cogs: cogs,
          margin,
          margin_percent: rev > 0 ? Math.round((margin / rev) * 10000) / 100 : 0,
        };
      })
    );

    return res.json({
      success: true,
      data: {
        clients,
        per_client: perClient,
        totals: {
          active_clients: activeClients.length,
          total_mrr: totalMrr,
          total_mrr_contract: contractMrr,
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
       VALUES (?, ?, 'manual', ?, ?)`,
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
