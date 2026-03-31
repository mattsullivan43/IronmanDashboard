import { query } from '../database/connection';

// Hardcoded fallback rules for common Citibank transaction descriptions
const CITI_KEYWORD_MAP: Record<string, string> = {
  // Infrastructure
  'aws': 'Infrastructure',
  'amazon web services': 'Infrastructure',
  'ionos': 'Infrastructure',
  'resend': 'Infrastructure',
  'digitalocean': 'Infrastructure',
  'heroku': 'Infrastructure',
  'vercel': 'Infrastructure',
  'netlify': 'Infrastructure',
  'cloudflare': 'Infrastructure',
  'godaddy': 'Infrastructure',
  'namecheap': 'Infrastructure',
  'linode': 'Infrastructure',
  'vultr': 'Infrastructure',
  // Software & Tools
  'google workspace': 'Software & Tools',
  'claude.ai': 'Software & Tools',
  'anthropic': 'Software & Tools',
  'runway': 'Software & Tools',
  'capcut': 'Software & Tools',
  'mirage': 'Software & Tools',
  'heygen': 'Software & Tools',
  'lovable': 'Software & Tools',
  'expo': 'Software & Tools',
  '650 industries': 'Software & Tools',
  'skool': 'Software & Tools',
  'p.skool': 'Software & Tools',
  'notion': 'Software & Tools',
  'slack': 'Software & Tools',
  'zoom': 'Software & Tools',
  'figma': 'Software & Tools',
  'canva': 'Software & Tools',
  'adobe': 'Software & Tools',
  'github': 'Software & Tools',
  'gitlab': 'Software & Tools',
  'atlassian': 'Software & Tools',
  'jira': 'Software & Tools',
  'hubspot': 'Software & Tools',
  'zapier': 'Software & Tools',
  'calendly': 'Software & Tools',
  'loom': 'Software & Tools',
  'grammarly': 'Software & Tools',
  'dropbox': 'Software & Tools',
  'microsoft': 'Software & Tools',
  'apple.com/bill': 'Software & Tools',
  'chatgpt': 'Software & Tools',
  // Sales & Marketing
  'google*ads': 'Sales & Marketing',
  'linkedin job': 'Sales & Marketing',
  'linkedin prem': 'Sales & Marketing',
  'facebk': 'Sales & Marketing',
  'facebook': 'Sales & Marketing',
  'meta ads': 'Sales & Marketing',
  'techsalesjobs': 'Sales & Marketing',
  'apollo.io': 'Sales & Marketing',
  'apollo': 'Sales & Marketing',
  'instantly': 'Sales & Marketing',
  'mailchimp': 'Sales & Marketing',
  'sendgrid': 'Sales & Marketing',
  'semrush': 'Sales & Marketing',
  'ahrefs': 'Sales & Marketing',
  // COGS (Cost of Goods Sold - direct costs of delivering services)
  'n8n': 'COGS',
  'paddle.net* n8n': 'COGS',
  'retell': 'COGS',
  'retellai': 'COGS',
  'autocalls': 'COGS',
  'elevenlabs': 'COGS',
  'openai': 'COGS',
  'deepseek': 'COGS',
  'twilio': 'COGS',
  // Office & Misc
  'wire fee': 'Office & Misc',
  'service charge': 'Office & Misc',
  'incoming wire': 'Office & Misc',
  'staples': 'Office & Misc',
  'office depot': 'Office & Misc',
  'usps': 'Office & Misc',
  'fedex': 'Office & Misc',
  'ups store': 'Office & Misc',
  // Income
  'odonnell': 'Income',
  'd r odonnell': 'Income',
  'wire from': 'Income',
  'zelle from': 'Income',
  // Transfers (not real income/expense — internal moves between accounts)
  'fid bkg svc': 'Transfer',
  'fidelity': 'Transfer',
  'moneyline': 'Transfer',
  'electronic credit fid': 'Transfer',
  'transfer from': 'Transfer',
  'transfer to': 'Transfer',
  'ach credit fid': 'Transfer',
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

  return 'Miscellaneous';
}
