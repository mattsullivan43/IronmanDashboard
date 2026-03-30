import { query } from '../database/connection';

// Hardcoded fallback rules for common Citibank transaction descriptions
const CITI_KEYWORD_MAP: Record<string, string> = {
  'aws': 'Infrastructure',
  'amazon web services': 'Infrastructure',
  'google workspace': 'Software & Tools',
  'google*ads': 'Sales & Marketing',
  'linkedin job': 'Sales & Marketing',
  'facebk': 'Sales & Marketing',
  'facebook': 'Sales & Marketing',
  'n8n': 'COGS',
  'paddle.net* n8n': 'COGS',
  'retell': 'COGS',
  'autocalls': 'COGS',
  'elevenlabs': 'COGS',
  'claude.ai': 'Software & Tools',
  'openai': 'COGS',
  'deepseek': 'COGS',
  'runway': 'Software & Tools',
  'capcut': 'Software & Tools',
  'mirage': 'Software & Tools',
  'heygen': 'Software & Tools',
  'ionos': 'Infrastructure',
  'resend': 'Infrastructure',
  'lovable': 'Software & Tools',
  'expo': 'Software & Tools',
  '650 industries': 'Software & Tools',
  'skool': 'Software & Tools',
  'techsalesjobs': 'Sales & Marketing',
  'wire fee': 'Office & Misc',
  'service charge': 'Office & Misc',
  'incoming wire': 'Office & Misc',
  'odonnell': 'Income',
  'd r odonnell': 'Income',
  'wire from': 'Income',
};

/**
 * Auto-categorize a transaction description by checking:
 * 1. Database expense_categories keyword rules
 * 2. Hardcoded Citibank keyword map as fallback
 *
 * Returns the category name, or 'Uncategorized' if no match.
 */
export async function categorizeTransaction(description: string): Promise<string> {
  const lowerDesc = description.toLowerCase();

  // 1. Try DB-based categories first
  try {
    const categories = await query<{ name: string; keywords: string }>(
      'SELECT name, keywords FROM expense_categories',
      []
    );

    for (const cat of categories) {
      const keywords: string[] =
        typeof cat.keywords === 'string' ? JSON.parse(cat.keywords) : cat.keywords;
      if (keywords && Array.isArray(keywords)) {
        for (const keyword of keywords) {
          if (keyword && lowerDesc.includes(keyword.toLowerCase())) {
            return cat.name;
          }
        }
      }
    }
  } catch (err) {
    // If DB is unavailable, fall through to hardcoded rules
    console.warn('[Categorizer] DB lookup failed, using fallback rules:', (err as Error).message);
  }

  // 2. Hardcoded fallback — check longer keywords first for specificity
  const sortedKeywords = Object.keys(CITI_KEYWORD_MAP).sort((a, b) => b.length - a.length);
  for (const keyword of sortedKeywords) {
    if (lowerDesc.includes(keyword.toLowerCase())) {
      return CITI_KEYWORD_MAP[keyword];
    }
  }

  return 'Uncategorized';
}
