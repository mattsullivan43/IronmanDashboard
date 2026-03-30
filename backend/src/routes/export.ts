import { Router, Request, Response } from 'express';
import { query } from '../database/connection';

const router = Router();

function escapeCsvField(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows: any[], columns: string[]): string {
  const header = columns.map(escapeCsvField).join(',');
  const body = rows.map(row =>
    columns.map(col => escapeCsvField(row[col])).join(',')
  ).join('\n');
  return `${header}\n${body}`;
}

// GET /api/export/:type - export data as CSV
router.get('/:type', async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const { start_date, end_date, status, product_line } = req.query;

    let csvContent: string;
    let filename: string;

    switch (type) {
      case 'clients': {
        const conditions: string[] = [];
        const params: any[] = [];

        if (status) {
          conditions.push('status = ?');
          params.push(status);
        }
        if (product_line) {
          conditions.push('product_line = ?');
          params.push(product_line);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await query(
          `SELECT company_name, contact_name, contact_email, product_line, status,
                  contract_start_date, contract_end_date, monthly_revenue,
                  monthly_recurring_fee, crane_count, per_crane_rate,
                  cogs_monthly, one_time_fee, implementation_fee, setup_fee,
                  project_value, project_paid, notes, created_at
           FROM clients ${where} ORDER BY company_name`,
          params
        );

        const columns = [
          'company_name', 'contact_name', 'contact_email', 'product_line', 'status',
          'contract_start_date', 'contract_end_date', 'monthly_revenue',
          'monthly_recurring_fee', 'crane_count', 'per_crane_rate',
          'cogs_monthly', 'one_time_fee', 'implementation_fee', 'setup_fee',
          'project_value', 'project_paid', 'notes', 'created_at',
        ];

        csvContent = toCsv(result, columns);
        filename = `clients_export_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }

      case 'transactions': {
        const conditions: string[] = [];
        const params: any[] = [];

        if (start_date) {
          conditions.push('t.date >= ?');
          params.push(start_date);
        }
        if (end_date) {
          conditions.push('t.date <= ?');
          params.push(end_date);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await query(
          `SELECT t.date, t.amount, t.description, t.type, t.category,
                  t.custom_category, t.account_name, t.source,
                  c.company_name as client_name, t.created_at
           FROM transactions t
           LEFT JOIN clients c ON t.client_id = c.id
           ${where} ORDER BY t.date DESC`,
          params
        );

        const columns = [
          'date', 'amount', 'description', 'type', 'category',
          'custom_category', 'account_name', 'source', 'client_name', 'created_at',
        ];

        csvContent = toCsv(result, columns);
        filename = `transactions_export_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }

      case 'commissions': {
        const conditions: string[] = [];
        const params: any[] = [];

        if (status) {
          conditions.push('cm.status = ?');
          params.push(status);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await query(
          `SELECT cm.rep_name, cl.company_name as client_name,
                  cm.deal_description, cm.deal_value, cm.commission_rate,
                  cm.commission_amount, cm.status, cm.date_closed, cm.date_paid,
                  cm.created_at
           FROM commissions cm
           LEFT JOIN clients cl ON cm.client_id = cl.id
           ${where} ORDER BY cm.created_at DESC`,
          params
        );

        const columns = [
          'rep_name', 'client_name', 'deal_description', 'deal_value',
          'commission_rate', 'commission_amount', 'status', 'date_closed',
          'date_paid', 'created_at',
        ];

        csvContent = toCsv(result, columns);
        filename = `commissions_export_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }

      case 'metrics': {
        const result = await query(
          'SELECT * FROM revenue_snapshots ORDER BY month ASC',
          []
        );

        const columns = [
          'month', 'mrr', 'new_mrr', 'expansion_mrr', 'churned_mrr',
          'boomline_mrr', 'ai_receptionist_mrr', 'custom_software_revenue',
          'total_customers', 'churned_customers', 'created_at',
        ];

        csvContent = toCsv(result, columns);
        filename = `metrics_export_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid export type. Use: clients, transactions, commissions, or metrics',
        });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csvContent);
  } catch (err: any) {
    console.error('Export error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
