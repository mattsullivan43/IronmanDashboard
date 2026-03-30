import { Router, Response } from 'express';
import crypto from 'crypto';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { query } from '../database/connection';
import { chat, generateBriefing, getUsageToday } from '../services/ai';

const router = Router();

// All JARVIS routes require authentication
router.use(authenticateToken);

// POST /api/jarvis/chat - Send a message and get a response
router.post('/chat', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { message, conversationId } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    if (message.length > 5000) {
      res.status(400).json({ error: 'Message too long. Maximum 5000 characters.' });
      return;
    }

    const convoId = conversationId || crypto.randomUUID();

    // Check if we're at the daily limit before calling chat
    const usage = await getUsageToday();
    if (usage.requests >= usage.limit) {
      res.json({
        reply: "Systems in power-save mode, sir. Resume tomorrow.",
        tokensUsed: 0,
        conversationId: convoId,
        limited: true,
      });
      return;
    }

    const result = await chat(message.trim(), convoId);

    res.json({
      reply: result.reply,
      tokensUsed: result.tokensUsed,
      conversationId: convoId,
    });
  } catch (err) {
    console.error('[JARVIS ROUTE] Chat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/jarvis/briefing - Get AI-generated daily briefing
router.get('/briefing', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const usage = await getUsageToday();
    if (usage.requests >= usage.limit) {
      res.json({
        briefing: "Systems in power-save mode, sir. Resume tomorrow.",
        limited: true,
      });
      return;
    }

    const briefing = await generateBriefing();

    res.json({ briefing });
  } catch (err) {
    console.error('[JARVIS ROUTE] Briefing error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/jarvis/history - Get chat history, optionally filtered by conversationId
router.get('/history', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { conversationId, page = '1', limit = '50' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    let messagesQuery: string;
    let countQuery: string;
    let params: unknown[];
    let countParams: unknown[];

    if (conversationId) {
      messagesQuery = `
        SELECT id, role, content, tokens_used, conversation_id, created_at
        FROM chat_messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
        LIMIT ? OFFSET ?`;
      params = [conversationId, limitNum, offset];

      countQuery = `SELECT CAST(COUNT(*) AS UNSIGNED) AS total FROM chat_messages WHERE conversation_id = ?`;
      countParams = [conversationId];
    } else {
      messagesQuery = `
        SELECT id, role, content, tokens_used, conversation_id, created_at
        FROM chat_messages
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?`;
      params = [limitNum, offset];

      countQuery = `SELECT CAST(COUNT(*) AS UNSIGNED) AS total FROM chat_messages`;
      countParams = [];
    }

    const [messagesResult, countResult] = await Promise.all([
      query(messagesQuery, params),
      query(countQuery, countParams),
    ]);

    const total = countResult[0]?.total || 0;

    res.json({
      messages: messagesResult,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error('[JARVIS ROUTE] History error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/jarvis/conversations - List conversations with last message preview
router.get('/conversations', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const result = await query(
      `SELECT
         conversation_id,
         MIN(created_at) AS started_at,
         MAX(created_at) AS last_message_at,
         CAST(COUNT(*) AS UNSIGNED) AS message_count
       FROM chat_messages
       WHERE conversation_id IS NOT NULL
       GROUP BY conversation_id
       ORDER BY MAX(created_at) DESC
       LIMIT ? OFFSET ?`,
      [limitNum, offset]
    );

    // Fetch the first user message and last assistant message for each conversation as previews
    const conversations = await Promise.all(
      result.map(async (row: any) => {
        const previewResult = await query(
          `(SELECT content, role FROM chat_messages
            WHERE conversation_id = ? AND role = 'user'
            ORDER BY created_at ASC LIMIT 1)
           UNION ALL
           (SELECT content, role FROM chat_messages
            WHERE conversation_id = ? AND role = 'assistant'
            ORDER BY created_at DESC LIMIT 1)`,
          [row.conversation_id, row.conversation_id]
        );

        const firstUserMessage = previewResult.find((r: any) => r.role === 'user');
        const lastAssistantMessage = previewResult.find((r: any) => r.role === 'assistant');

        return {
          conversationId: row.conversation_id,
          startedAt: row.started_at,
          lastMessageAt: row.last_message_at,
          messageCount: row.message_count,
          preview: firstUserMessage
            ? firstUserMessage.content.substring(0, 120) + (firstUserMessage.content.length > 120 ? '...' : '')
            : null,
          lastReply: lastAssistantMessage
            ? lastAssistantMessage.content.substring(0, 120) + (lastAssistantMessage.content.length > 120 ? '...' : '')
            : null,
        };
      })
    );

    const countResult = await query(
      `SELECT CAST(COUNT(DISTINCT conversation_id) AS UNSIGNED) AS total FROM chat_messages WHERE conversation_id IS NOT NULL`
    );
    const total = countResult[0]?.total || 0;

    res.json({
      conversations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error('[JARVIS ROUTE] Conversations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/jarvis/conversations/:id - Delete a conversation
router.delete('/conversations/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ error: 'Conversation ID is required' });
      return;
    }

    // First check how many messages exist for this conversation
    const countResult = await query(
      `SELECT CAST(COUNT(*) AS UNSIGNED) AS cnt FROM chat_messages WHERE conversation_id = ?`,
      [id]
    );
    const messageCount = countResult[0]?.cnt || 0;

    if (messageCount === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    await query(
      `DELETE FROM chat_messages WHERE conversation_id = ?`,
      [id]
    );

    res.json({
      message: 'Conversation deleted, sir. No trace remains.',
      deletedMessages: messageCount,
    });
  } catch (err) {
    console.error('[JARVIS ROUTE] Delete conversation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/jarvis/usage - Get today's usage stats
router.get('/usage', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const usage = await getUsageToday();
    res.json(usage);
  } catch (err) {
    console.error('[JARVIS ROUTE] Usage error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
