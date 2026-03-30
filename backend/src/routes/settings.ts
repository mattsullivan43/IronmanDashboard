import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../database/connection';

const router = Router();

// GET /api/settings - get all settings
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await query('SELECT `key`, value, updated_at FROM settings ORDER BY `key`', []);

    // Convert rows to key-value map
    const settings: Record<string, any> = {};
    for (const row of result) {
      settings[row.key] = row.value;
    }

    return res.json({ success: true, data: settings });
  } catch (err: any) {
    console.error('Get settings error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PUT /api/settings/:key - update a setting
router.put('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ success: false, error: 'value is required' });
    }

    const jsonValue = JSON.stringify(value);

    await query(
      `INSERT INTO settings (\`key\`, value, updated_at) VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE value = ?, updated_at = NOW()`,
      [key, jsonValue, jsonValue]
    );

    const result = await query(
      'SELECT `key`, value, updated_at FROM settings WHERE `key` = ?',
      [key]
    );

    return res.json({ success: true, data: result[0] });
  } catch (err: any) {
    console.error('Update setting error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/settings/categories - get expense categories with keywords
router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT * FROM expense_categories ORDER BY is_default DESC, name ASC',
      []
    );
    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('Get categories error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/settings/categories - create category
router.post('/categories', async (req: Request, res: Response) => {
  try {
    const { name, keywords, color } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const keywordsArray = Array.isArray(keywords) ? keywords : [];
    const id = crypto.randomUUID();

    await query(
      `INSERT INTO expense_categories (id, name, keywords, color, is_default)
       VALUES (?, ?, ?, ?, false)`,
      [id, name, JSON.stringify(keywordsArray), color || '#00D4FF']
    );

    const result = await query(
      'SELECT * FROM expense_categories WHERE id = ?',
      [id]
    );

    return res.status(201).json({ success: true, data: result[0] });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'Category name already exists' });
    }
    console.error('Create category error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PUT /api/settings/categories/:id - update category keywords
router.put('/categories/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, keywords, color } = req.body;

    const existing = await query('SELECT id FROM expense_categories WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    const setClauses: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      setClauses.push('name = ?');
      params.push(name);
    }
    if (keywords !== undefined) {
      setClauses.push('keywords = ?');
      params.push(JSON.stringify(Array.isArray(keywords) ? keywords : []));
    }
    if (color !== undefined) {
      setClauses.push('color = ?');
      params.push(color);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    params.push(id);
    await query(
      `UPDATE expense_categories SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    const result = await query(
      'SELECT * FROM expense_categories WHERE id = ?',
      [id]
    );

    return res.json({ success: true, data: result[0] });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'Category name already exists' });
    }
    console.error('Update category error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /api/settings/categories/:id
router.delete('/categories/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Prevent deleting default categories
    const existing = await query('SELECT is_default FROM expense_categories WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }
    if (existing[0].is_default) {
      return res.status(403).json({ success: false, error: 'Cannot delete default categories' });
    }

    await query('DELETE FROM expense_categories WHERE id = ?', [id]);
    return res.json({ success: true, data: { deleted: id } });
  } catch (err: any) {
    console.error('Delete category error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
