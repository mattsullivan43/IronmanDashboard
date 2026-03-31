import { Router, Request, Response } from 'express';
import { query } from '../database/connection';

const router = Router();

// GET / — list action items for a given date (default today)
router.get('/', async (req: Request, res: Response) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const rows = await query(
      'SELECT * FROM action_items WHERE due_date = ? ORDER BY completed ASC, priority = "high" DESC, created_at ASC',
      [date]
    );
    return res.json({ success: true, data: rows });
  } catch (err: any) {
    console.error('List action items error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST / — create a new action item
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, dueDate, priority } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    const id = crypto.randomUUID();
    const date = dueDate || new Date().toISOString().split('T')[0];
    const prio = priority || 'normal';

    await query(
      'INSERT INTO action_items (id, title, due_date, priority) VALUES (?, ?, ?, ?)',
      [id, title.trim(), date, prio]
    );

    const [item] = await query('SELECT * FROM action_items WHERE id = ?', [id]);
    return res.status(201).json({ success: true, data: item });
  } catch (err: any) {
    console.error('Create action item error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PUT /:id — update an action item (toggle complete, edit title, etc.)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { completed, title, priority } = req.body;

    const fields: string[] = [];
    const params: any[] = [];

    if (typeof completed === 'boolean') {
      fields.push('completed = ?');
      params.push(completed ? 1 : 0);
    }
    if (title !== undefined) {
      fields.push('title = ?');
      params.push(title.trim());
    }
    if (priority !== undefined) {
      fields.push('priority = ?');
      params.push(priority);
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    params.push(id);
    await query(`UPDATE action_items SET ${fields.join(', ')} WHERE id = ?`, params);

    const [item] = await query('SELECT * FROM action_items WHERE id = ?', [id]);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    return res.json({ success: true, data: item });
  } catch (err: any) {
    console.error('Update action item error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /:id — remove an action item
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result: any = await query('DELETE FROM action_items WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    return res.json({ success: true, data: null });
  } catch (err: any) {
    console.error('Delete action item error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
