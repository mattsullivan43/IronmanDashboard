import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { query } from '../database/connection';
import { parseCitibankPdf, ParsedTransaction } from '../services/statementParser';
import { categorizeTransaction } from '../services/categorizer';

const router = Router();

// Configure multer for CSV uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

// Separate multer config for statement uploads (PDF + CSV)
const statementUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB for PDFs
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf' || ext === '.csv' || file.mimetype === 'application/pdf' || file.mimetype === 'text/csv') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and CSV files are allowed'));
    }
  },
});

// POST /api/csv/upload - upload CSV, parse and return preview
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No CSV file uploaded' });
    }

    const csvContent = req.file.buffer.toString('utf-8');

    let records: any[];
    try {
      records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (parseErr: any) {
      return res.status(400).json({ success: false, error: `CSV parse error: ${parseErr.message}` });
    }

    if (records.length === 0) {
      return res.status(400).json({ success: false, error: 'CSV file is empty or has no data rows' });
    }

    const columns = Object.keys(records[0]);

    // Auto-detect column mapping by common names
    const detectedMapping: Record<string, string> = {};
    const datePatterns = ['date', 'transaction date', 'trans date', 'posting date', 'posted date'];
    const amountPatterns = ['amount', 'debit', 'total', 'transaction amount'];
    const descPatterns = ['description', 'memo', 'details', 'narrative', 'transaction description', 'name'];

    for (const col of columns) {
      const lower = col.toLowerCase().trim();
      if (datePatterns.includes(lower)) detectedMapping.date = col;
      else if (amountPatterns.includes(lower)) detectedMapping.amount = col;
      else if (descPatterns.includes(lower)) detectedMapping.description = col;
    }

    // Store the upload record
    const uploadId = crypto.randomUUID();
    await query(
      'INSERT INTO csv_uploads (id, filename, row_count, column_mapping) VALUES (?, ?, ?, ?)',
      [uploadId, req.file.originalname, records.length, JSON.stringify(detectedMapping)]
    );

    // Return preview (first 10 rows)
    const preview = records.slice(0, 10);

    return res.json({
      success: true,
      data: {
        upload_id: uploadId,
        filename: req.file.originalname,
        total_rows: records.length,
        columns,
        detected_mapping: detectedMapping,
        preview,
      },
    });
  } catch (err: any) {
    console.error('CSV upload error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/csv/import - import parsed CSV with column mapping
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { upload_id, column_mapping, rows } = req.body;

    if (!upload_id || !column_mapping || !rows || !Array.isArray(rows)) {
      return res.status(400).json({
        success: false,
        error: 'upload_id, column_mapping, and rows are required',
      });
    }

    const { date: dateCol, amount: amountCol, description: descCol } = column_mapping;

    if (!dateCol || !amountCol) {
      return res.status(400).json({
        success: false,
        error: 'Column mapping must include at least date and amount',
      });
    }

    // Fetch categorization rules
    const categories = await query('SELECT name, keywords FROM expense_categories', []);

    let imported = 0;
    let duplicates = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        const rawDate = row[dateCol];
        const rawAmount = row[amountCol];
        const description = descCol ? (row[descCol] || '') : '';

        if (!rawDate || rawAmount === undefined || rawAmount === '') continue;

        // Parse amount - handle various formats
        const cleanAmount = String(rawAmount).replace(/[$,\s]/g, '');
        const amount = parseFloat(cleanAmount);
        if (isNaN(amount)) {
          errors++;
          continue;
        }

        // Parse date
        const parsedDate = new Date(rawDate);
        if (isNaN(parsedDate.getTime())) {
          errors++;
          continue;
        }
        const dateStr = parsedDate.toISOString().split('T')[0];

        // Determine type
        const type = amount >= 0 ? 'income' : 'expense';
        const absAmount = Math.abs(amount);

        // Duplicate detection: match on date + amount + description
        const dupCheck = await query(
          `SELECT id FROM transactions
           WHERE date = ? AND amount = ? AND description = ?
           LIMIT 1`,
          [dateStr, absAmount, description]
        );

        if (dupCheck.length > 0) {
          duplicates++;
          continue;
        }

        // Auto-categorize using keyword rules
        let category: string | null = null;
        const lowerDesc = description.toLowerCase();
        for (const cat of categories) {
          const keywords = typeof cat.keywords === 'string' ? JSON.parse(cat.keywords) : cat.keywords;
          if (keywords && Array.isArray(keywords)) {
            for (const keyword of keywords) {
              if (lowerDesc.includes(keyword.toLowerCase())) {
                category = cat.name;
                break;
              }
            }
          }
          if (category) break;
        }

        await query(
          `INSERT INTO transactions (date, amount, description, source, type, category, file_upload_id)
           VALUES (?, ?, ?, 'csv', ?, ?, ?)`,
          [dateStr, absAmount, description, type, category, upload_id]
        );

        imported++;
      } catch (rowErr) {
        errors++;
      }
    }

    // Update upload record with final row count
    await query(
      'UPDATE csv_uploads SET row_count = ? WHERE id = ?',
      [imported, upload_id]
    );

    return res.json({
      success: true,
      data: {
        imported,
        duplicates,
        errors,
        total: rows.length,
      },
    });
  } catch (err: any) {
    console.error('CSV import error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/csv/uploads - list past uploads
router.get('/uploads', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT * FROM csv_uploads ORDER BY uploaded_at DESC',
      []
    );
    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('List uploads error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/csv/mapping - get saved column mapping
router.get('/mapping', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      "SELECT value FROM settings WHERE `key` = 'csv_column_mapping'",
      []
    );

    const mapping = result.length > 0 ? result[0].value : {};
    return res.json({ success: true, data: mapping });
  } catch (err: any) {
    console.error('Get mapping error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PUT /api/csv/mapping - save column mapping
router.put('/mapping', async (req: Request, res: Response) => {
  try {
    const { mapping } = req.body;

    if (!mapping || typeof mapping !== 'object') {
      return res.status(400).json({ success: false, error: 'mapping object is required' });
    }

    await query(
      "INSERT INTO settings (`key`, value, updated_at) VALUES ('csv_column_mapping', ?, NOW()) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()",
      [JSON.stringify(mapping)]
    );

    return res.json({ success: true, data: mapping });
  } catch (err: any) {
    console.error('Save mapping error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================
// Bank Statement (PDF) Upload & Import
// ============================================================

// POST /api/csv/upload-statement - upload a bank statement PDF (or CSV), parse and return preview
router.post(
  '/upload-statement',
  statementUpload.single('file'),
  async (req: Request, res: Response) => {
    let tmpPath: string | null = null;
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      const ext = path.extname(req.file.originalname).toLowerCase();

      if (ext === '.pdf') {
        // Write buffer to a temp file so pdftotext can read it
        tmpPath = path.join(os.tmpdir(), `citi-statement-${Date.now()}.pdf`);
        fs.writeFileSync(tmpPath, req.file.buffer);

        const parsed = await parseCitibankPdf(tmpPath);

        // Store upload record
        const uploadId = crypto.randomUUID();
        await query(
          'INSERT INTO csv_uploads (id, filename, row_count, column_mapping) VALUES (?, ?, ?, ?)',
          [uploadId, req.file.originalname, parsed.transactions.length, JSON.stringify({ source: 'citibank_pdf' })]
        );

        return res.json({
          success: true,
          data: {
            upload_id: uploadId,
            filename: req.file.originalname,
            format: 'citibank_pdf',
            summary: {
              accountNumber: parsed.accountNumber,
              period: parsed.statementPeriod,
              beginningBalance: parsed.beginningBalance,
              endingBalance: parsed.endingBalance,
              totalDebits: parsed.totalDebits,
              totalCredits: parsed.totalCredits,
              year: parsed.year,
            },
            transactions: parsed.transactions,
          },
        });
      } else {
        // CSV — use existing parse logic inline
        const csvContent = req.file.buffer.toString('utf-8');
        let records: any[];
        try {
          records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
          });
        } catch (parseErr: any) {
          return res.status(400).json({ success: false, error: `CSV parse error: ${parseErr.message}` });
        }

        if (records.length === 0) {
          return res.status(400).json({ success: false, error: 'CSV file is empty' });
        }

        const columns = Object.keys(records[0]);
        const uploadId = crypto.randomUUID();
        await query(
          'INSERT INTO csv_uploads (id, filename, row_count, column_mapping) VALUES (?, ?, ?, ?)',
          [uploadId, req.file.originalname, records.length, JSON.stringify({ source: 'csv' })]
        );

        return res.json({
          success: true,
          data: {
            upload_id: uploadId,
            filename: req.file.originalname,
            format: 'csv',
            columns,
            preview: records.slice(0, 10),
            total_rows: records.length,
          },
        });
      }
    } catch (err: any) {
      console.error('Statement upload error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    } finally {
      // Clean up temp file
      if (tmpPath && fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath);
        } catch (_) {
          // ignore cleanup errors
        }
      }
    }
  }
);

// POST /api/csv/import-statement - import confirmed transactions from a parsed statement
router.post('/import-statement', async (req: Request, res: Response) => {
  try {
    const { upload_id, transactions } = req.body as {
      upload_id?: string;
      transactions?: ParsedTransaction[];
    };

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'transactions array is required and must not be empty',
      });
    }

    const fileUploadId = upload_id || null;

    let imported = 0;
    let duplicates = 0;
    let errors = 0;

    for (const tx of transactions) {
      try {
        const dateStr = tx.date; // Already YYYY-MM-DD from parser
        const absAmount = Math.abs(tx.amount);
        const description = tx.description || '';
        const type = tx.type || (tx.amount >= 0 ? 'income' : 'expense');
        const category = tx.category || (await categorizeTransaction(description));

        // Duplicate detection: same date + amount + description
        const dupCheck = await query(
          `SELECT id FROM transactions
           WHERE date = ? AND amount = ? AND description = ?
           LIMIT 1`,
          [dateStr, absAmount, description]
        );

        if (dupCheck.length > 0) {
          duplicates++;
          continue;
        }

        await query(
          `INSERT INTO transactions (date, amount, description, source, type, category, file_upload_id)
           VALUES (?, ?, ?, 'csv', ?, ?, ?)`,
          [dateStr, absAmount, description, type, category, fileUploadId]
        );

        imported++;
      } catch (rowErr: any) {
        console.error('Statement import row error:', rowErr.message);
        errors++;
      }
    }

    // Update upload record
    if (fileUploadId) {
      await query(
        'UPDATE csv_uploads SET row_count = ? WHERE id = ?',
        [imported, fileUploadId]
      );
    }

    return res.json({
      success: true,
      data: {
        imported,
        duplicates,
        errors,
        total: transactions.length,
      },
    });
  } catch (err: any) {
    console.error('Statement import error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
