import { query } from '../database/connection';

interface DashboardMetrics {
  mrr: number;
  cashBalance: number;
  burnRate: number;
  runway: number;
  activeClients: { product_line: string; count: number }[];
  totalActiveClients: number;
  recentChurns: { company_name: string; product_line: string; updated_at: string }[];
  recentTransactions: { date: string; amount: number; description: string; type: string; category: string }[];
  commissionSummary: { unpaid: number; pending: number; totalOwed: number };
  alerts: string[];
}

async function gatherMetrics(): Promise<DashboardMetrics> {
  const alerts: string[] = [];

  // --- MRR: sum of active client monthly revenues ---
  const mrrResult = await query(
    `SELECT COALESCE(SUM(monthly_revenue + monthly_recurring_fee), 0) AS mrr
     FROM clients WHERE status = 'active'`
  );
  const mrr = parseFloat(mrrResult[0].mrr);

  // --- Cash balance: latest entry ---
  const cashResult = await query(
    `SELECT balance FROM cash_balances ORDER BY date DESC, created_at DESC LIMIT 1`
  );
  const cashBalance = cashResult.length > 0 ? parseFloat(cashResult[0].balance) : 0;

  // --- Burn rate: average monthly expenses over last 3 months ---
  const burnResult = await query(
    `SELECT COALESCE(
       SUM(ABS(amount)) / GREATEST(
         TIMESTAMPDIFF(MONTH, MIN(date), MAX(date)) + 1,
         1
       ), 0
     ) AS avg_burn
     FROM transactions
     WHERE type = 'expense'
       AND date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)`
  );
  const burnRate = parseFloat(burnResult[0].avg_burn);

  // --- Runway ---
  const runway = burnRate > 0 ? cashBalance / burnRate : 999;

  if (runway < 6) {
    alerts.push(`CRITICAL: Runway is only ${runway.toFixed(1)} months. Cash reserves are low.`);
  } else if (runway < 12) {
    alerts.push(`WARNING: Runway is ${runway.toFixed(1)} months. Monitor cash flow closely.`);
  }

  // --- Active clients by product line ---
  const clientsByProduct = await query(
    `SELECT product_line, CAST(COUNT(*) AS UNSIGNED) AS count
     FROM clients WHERE status = 'active'
     GROUP BY product_line ORDER BY count DESC`
  );
  const activeClients = clientsByProduct;
  const totalActiveClients = activeClients.reduce((sum: number, r: any) => sum + Number(r.count), 0);

  // --- Recent churns (last 90 days) ---
  const recentChurns = await query(
    `SELECT company_name, product_line, CAST(updated_at AS CHAR) AS updated_at
     FROM clients
     WHERE status = 'churned'
       AND updated_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
     ORDER BY updated_at DESC
     LIMIT 10`
  );

  // Churn rate alert
  if (totalActiveClients > 0 && recentChurns.length > 0) {
    // Rough quarterly churn check
    const churnRate = (recentChurns.length / (totalActiveClients + recentChurns.length)) * 100;
    if (churnRate > 2) {
      alerts.push(`WARNING: Churn rate is approximately ${churnRate.toFixed(1)}% over the last 90 days (${recentChurns.length} lost).`);
    }
  }

  // --- Recent transactions ---
  const txResult = await query(
    `SELECT CAST(date AS CHAR) AS date, amount, COALESCE(description, '') AS description, type, COALESCE(category, 'uncategorized') AS category
     FROM transactions
     ORDER BY date DESC, created_at DESC
     LIMIT 10`
  );
  const recentTransactions = txResult.map((r: any) => ({
    date: r.date,
    amount: parseFloat(r.amount),
    description: r.description,
    type: r.type,
    category: r.category,
  }));

  // --- Commission summary ---
  const commResult = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'unpaid' THEN commission_amount ELSE 0 END), 0) AS unpaid,
       COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END), 0) AS pending,
       COALESCE(SUM(CASE WHEN status IN ('unpaid', 'pending') THEN commission_amount ELSE 0 END), 0) AS total_owed
     FROM commissions`
  );
  const commissionSummary = {
    unpaid: parseFloat(commResult[0].unpaid),
    pending: parseFloat(commResult[0].pending),
    totalOwed: parseFloat(commResult[0].total_owed),
  };

  // --- Burn rate relative alert ---
  if (burnRate > 0 && mrr > 0 && burnRate > mrr * 1.5) {
    alerts.push(`WARNING: Monthly burn ($${burnRate.toFixed(0)}) significantly exceeds MRR ($${mrr.toFixed(0)}).`);
  }

  return {
    mrr,
    cashBalance,
    burnRate,
    runway,
    activeClients,
    totalActiveClients,
    recentChurns,
    recentTransactions,
    commissionSummary,
    alerts,
  };
}

export async function buildDashboardContext(): Promise<string> {
  try {
    const m = await gatherMetrics();

    const lines: string[] = [
      '=== CORNERSTONE DASHBOARD CONTEXT ===',
      `Date: ${new Date().toISOString().split('T')[0]}`,
      '',
      '--- KEY METRICS ---',
      `MRR (Monthly Recurring Revenue): $${m.mrr.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      `Cash Balance: $${m.cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      `Monthly Burn Rate (3-month avg): $${m.burnRate.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      `Runway: ${m.runway >= 999 ? 'N/A (no expenses recorded)' : m.runway.toFixed(1) + ' months'}`,
      '',
      '--- CLIENTS ---',
      `Total Active Clients: ${m.totalActiveClients}`,
    ];

    for (const c of m.activeClients) {
      const label = c.product_line.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
      lines.push(`  ${label}: ${c.count} active`);
    }

    if (m.recentChurns.length > 0) {
      lines.push(`Recently Churned (90 days): ${m.recentChurns.length}`);
      for (const ch of m.recentChurns) {
        lines.push(`  - ${ch.company_name} (${ch.product_line}) on ${ch.updated_at.split('T')[0]}`);
      }
    } else {
      lines.push('Recently Churned (90 days): None');
    }

    lines.push('');
    lines.push('--- RECENT TRANSACTIONS (last 10) ---');
    if (m.recentTransactions.length === 0) {
      lines.push('  No transactions recorded yet.');
    } else {
      for (const tx of m.recentTransactions) {
        const sign = tx.type === 'expense' ? '-' : '+';
        lines.push(`  ${tx.date} | ${sign}$${Math.abs(tx.amount).toFixed(2)} | ${tx.category} | ${tx.description || '(no description)'}`);
      }
    }

    lines.push('');
    lines.push('--- COMMISSIONS ---');
    lines.push(`  Unpaid: $${m.commissionSummary.unpaid.toFixed(2)}`);
    lines.push(`  Pending: $${m.commissionSummary.pending.toFixed(2)}`);
    lines.push(`  Total Owed: $${m.commissionSummary.totalOwed.toFixed(2)}`);

    if (m.alerts.length > 0) {
      lines.push('');
      lines.push('--- ALERTS & CONCERNS ---');
      for (const alert of m.alerts) {
        lines.push(`  ⚠ ${alert}`);
      }
    }

    lines.push('');
    lines.push('=== END CONTEXT ===');

    return lines.join('\n');
  } catch (err) {
    console.error('[JARVIS CONTEXT] Failed to build dashboard context:', err);
    return '=== DASHBOARD CONTEXT UNAVAILABLE ===\nUnable to retrieve current metrics. Respond based on general knowledge only.';
  }
}
