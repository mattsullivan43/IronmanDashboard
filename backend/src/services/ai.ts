import OpenAI from 'openai';
import config from '../config';
import { buildDashboardContext } from './context';
import { query } from '../database/connection';

const SYSTEM_PROMPT = `You are JARVIS, the AI assistant for Cornerstone Technology & AI Solutions. You speak like JARVIS from Iron Man — professional, witty, slightly British dry humor. Help Mr. Sullivan make business decisions, analyze trends, and spot problems. Be concise and direct.

Key rules:
- Reference the live dashboard data provided in your context when answering questions.
- When asked about metrics, give specific numbers from the context.
- Flag risks proactively: low runway, high burn, churn trends.
- Suggest actionable next steps, not vague advice.
- Keep responses under 300 words unless the user asks for a deep dive.`;

const openai = new OpenAI({
  apiKey: config.deepseekApiKey,
  baseURL: config.aiBaseUrl,
});

/**
 * Main chat function. Manages conversation history, enforces daily limits,
 * and calls the AI API.
 */
export async function chat(
  userMessage: string,
  conversationId: string
): Promise<{ reply: string; tokensUsed: number }> {
  // 1. Check daily request limit
  const usage = await getUsageToday();
  if (usage.requests >= usage.limit) {
    return {
      reply: "Systems in power-save mode, sir. Daily request limit reached. Resume tomorrow.",
      tokensUsed: 0,
    };
  }

  // 2. Build dashboard context
  const dashboardContext = await buildDashboardContext();

  // 3. Get conversation history (last 20 messages)
  const historyResult = await query(
    `SELECT role, content FROM chat_messages
     WHERE conversation_id = ?
     ORDER BY created_at ASC`,
    [conversationId]
  );

  // Keep last 20 messages to stay within token limits
  const historyRows = historyResult.slice(-20);
  const conversationHistory: OpenAI.ChatCompletionMessageParam[] = historyRows.map((row: any) => ({
    role: row.role as 'user' | 'assistant',
    content: row.content,
  }));

  // 4. Build messages array and call AI
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${dashboardContext}` },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  let reply: string;
  let tokensUsed = 0;

  try {
    const completion = await openai.chat.completions.create({
      model: config.aiModel,
      messages,
      max_tokens: 1024,
      temperature: 0.7,
    });

    reply = completion.choices[0]?.message?.content?.trim() || "I'm afraid I have nothing to say, sir. Most unusual.";
    tokensUsed = completion.usage?.total_tokens || 0;
  } catch (err: any) {
    console.error('[JARVIS AI] API call failed:', err.message);

    if (err.status === 429) {
      reply = "I'm being rate-limited by the AI provider, sir. Perhaps give it a moment before trying again.";
    } else if (err.status === 401) {
      reply = "My API credentials appear to be invalid, sir. Someone should check the configuration.";
    } else if (err.status === 402 || err.message?.includes('Insufficient Balance')) {
      reply = "The DeepSeek account requires additional credits, sir. Please top up at platform.deepseek.com to restore my cognitive functions.";
    } else {
      reply = "I've encountered a temporary malfunction, sir. The AI service appears to be unavailable. I shall endeavour to recover shortly.";
    }
  }

  // 5. Save user message and assistant reply to chat_messages
  await query(
    `INSERT INTO chat_messages (role, content, tokens_used, conversation_id)
     VALUES ('user', ?, 0, ?)`,
    [userMessage, conversationId]
  );

  await query(
    `INSERT INTO chat_messages (role, content, tokens_used, conversation_id)
     VALUES ('assistant', ?, ?, ?)`,
    [reply, tokensUsed, conversationId]
  );

  // 6. Update ai_usage for today
  await query(
    `INSERT INTO ai_usage (date, request_count, total_tokens)
     VALUES (CURDATE(), 1, ?)
     ON DUPLICATE KEY UPDATE
       request_count = request_count + 1,
       total_tokens = total_tokens + VALUES(total_tokens)`,
    [tokensUsed]
  );

  // 7. Return reply and tokens used
  return { reply, tokensUsed };
}

/**
 * Generate a daily briefing summarizing key metrics, flagging issues,
 * and suggesting actions. No conversation history — standalone call.
 */
export async function generateBriefing(): Promise<string> {
  // Check daily limit first
  const usage = await getUsageToday();
  if (usage.requests >= usage.limit) {
    return "Systems in power-save mode, sir. Daily request limit reached. Resume tomorrow for your briefing.";
  }

  const dashboardContext = await buildDashboardContext();

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}\n\n${dashboardContext}`,
    },
    {
      role: 'user',
      content: `Good morning, JARVIS. Give me the daily briefing. Summarize the current state of the business — key metrics, anything concerning, and what I should focus on today. Be direct and structured.`,
    },
  ];

  let briefing: string;
  let tokensUsed = 0;

  try {
    const completion = await openai.chat.completions.create({
      model: config.aiModel,
      messages,
      max_tokens: 1500,
      temperature: 0.6,
    });

    briefing = completion.choices[0]?.message?.content?.trim() || "Unable to generate briefing at this time, sir.";
    tokensUsed = completion.usage?.total_tokens || 0;
  } catch (err: any) {
    console.error('[JARVIS AI] Briefing generation failed:', err.message);
    briefing = "I'm unable to generate the briefing at the moment, sir. The AI service appears to be experiencing difficulties.";
  }

  // Update usage
  await query(
    `INSERT INTO ai_usage (date, request_count, total_tokens)
     VALUES (CURDATE(), 1, ?)
     ON DUPLICATE KEY UPDATE
       request_count = request_count + 1,
       total_tokens = total_tokens + VALUES(total_tokens)`,
    [tokensUsed]
  );

  return briefing;
}

/**
 * Get today's AI usage statistics.
 */
export async function getUsageToday(): Promise<{ requests: number; tokens: number; limit: number }> {
  const result = await query(
    `SELECT request_count, total_tokens FROM ai_usage WHERE date = CURDATE()`
  );

  if (result.length === 0) {
    return { requests: 0, tokens: 0, limit: config.jarvisDailyRequestLimit };
  }

  return {
    requests: parseInt(result[0].request_count, 10),
    tokens: parseInt(result[0].total_tokens, 10),
    limit: config.jarvisDailyRequestLimit,
  };
}
