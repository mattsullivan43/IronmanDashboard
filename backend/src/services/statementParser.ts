import { execSync } from 'child_process';
import fs from 'fs';
import { categorizeTransaction } from './categorizer';

export interface ParsedTransaction {
  date: string;        // YYYY-MM-DD format
  description: string; // Full merged multi-line description
  amount: number;      // Positive for credits, negative for debits
  type: 'income' | 'expense';
  balance: number;     // Running balance after transaction
  rawDate: string;     // Original MM/DD format
  category: string;    // Auto-categorized
}

export interface ParsedStatement {
  accountNumber: string;
  statementPeriod: { start: string; end: string }; // YYYY-MM-DD
  beginningBalance: number;
  endingBalance: number;
  totalDebits: number;
  totalCredits: number;
  transactions: ParsedTransaction[];
  year: number;
}

// Month name -> number mapping
const MONTH_MAP: Record<string, string> = {
  'january': '01', 'february': '02', 'march': '03', 'april': '04',
  'may': '05', 'june': '06', 'july': '07', 'august': '08',
  'september': '09', 'october': '10', 'november': '11', 'december': '12',
  'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
  'jun': '06', 'jul': '07', 'aug': '08',
  'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
};

function parseAmount(s: string): number {
  return parseFloat(s.replace(/,/g, ''));
}

/**
 * Parse a Citibank business checking statement PDF.
 *
 * Uses pdftotext -layout to extract text preserving column positions,
 * then parses the specific Citibank statement format.
 */
export async function parseCitibankPdf(filePath: string): Promise<ParsedStatement> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`PDF file not found: ${filePath}`);
  }

  // Extract text with layout preservation using pdftotext (poppler)
  let rawText: string;
  try {
    rawText = execSync(`pdftotext -layout "${filePath}" -`, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      timeout: 30000,
    });
  } catch (err: any) {
    throw new Error(
      `Failed to extract text from PDF. Ensure poppler-utils is installed. Error: ${err.message}`
    );
  }

  const lines = rawText.split('\n');

  // --- Extract year and statement period from header ---
  let year = new Date().getFullYear();
  let statementPeriod = { start: '', end: '' };
  let accountNumber = '';
  let beginningBalance = 0;
  let endingBalance = 0;

  // Pattern: "ACCOUNT AS OF JANUARY 31, 2026" or "Statement Period: Jan 1 - Jan 31, 2026"
  for (const line of lines) {
    // "ACCOUNT AS OF MONTH DD, YYYY"
    const asOfMatch = line.match(
      /ACCOUNT\s+AS\s+OF\s+(\w+)\s+(\d{1,2}),?\s+(\d{4})/i
    );
    if (asOfMatch) {
      const monthStr = asOfMatch[1].toLowerCase();
      const day = asOfMatch[2].padStart(2, '0');
      year = parseInt(asOfMatch[3], 10);
      const monthNum = MONTH_MAP[monthStr] || '01';
      statementPeriod.end = `${year}-${monthNum}-${day}`;
      // Assume statement starts on the 1st of the same month
      statementPeriod.start = `${year}-${monthNum}-01`;
    }

    // "Statement Period  Jan 1, 2026 - Jan 31, 2026" or similar
    const periodMatch = line.match(
      /Statement\s+Period[:\s]+(\w+)\s+(\d{1,2}),?\s+(\d{4})\s*[-–]\s*(\w+)\s+(\d{1,2}),?\s+(\d{4})/i
    );
    if (periodMatch) {
      const m1 = MONTH_MAP[periodMatch[1].toLowerCase()] || '01';
      const d1 = periodMatch[2].padStart(2, '0');
      const y1 = periodMatch[3];
      const m2 = MONTH_MAP[periodMatch[4].toLowerCase()] || '01';
      const d2 = periodMatch[5].padStart(2, '0');
      const y2 = periodMatch[6];
      statementPeriod.start = `${y1}-${m1}-${d1}`;
      statementPeriod.end = `${y2}-${m2}-${d2}`;
      year = parseInt(y2, 10);
    }

    // Account number: line containing just digits (8-12 digits) possibly with other text
    const acctMatch = line.match(/\b(\d{8,12})\b/);
    if (acctMatch && !accountNumber) {
      // Make sure this is near the top (checking activity section header area)
      // and not a transaction amount
      const numStr = acctMatch[1];
      if (!line.match(/\.\d{2}/) && numStr.length >= 8) {
        accountNumber = numStr;
      }
    }

    // Beginning Balance
    const beginMatch = line.match(/Beginning\s+Balance[:\s]*\$?([\d,]+\.\d{2})/i);
    if (beginMatch) {
      beginningBalance = parseAmount(beginMatch[1]);
    }

    // Ending Balance
    const endMatch = line.match(/Ending\s+Balance[:\s]*\$?([\d,]+\.\d{2})/i);
    if (endMatch) {
      endingBalance = parseAmount(endMatch[1]);
    }
  }

  // If no explicit period found, default based on year
  if (!statementPeriod.start) {
    statementPeriod.start = `${year}-01-01`;
  }
  if (!statementPeriod.end) {
    statementPeriod.end = `${year}-01-31`;
  }

  // --- Parse transactions ---
  const transactions: ParsedTransaction[] = [];
  let totalDebits = 0;
  let totalCredits = 0;
  let inCheckingActivity = false;
  let pastHeader = false; // past the "Date Description ... Debits Credits Balance" header

  // Date pattern: MM/DD at the start of the line (allowing some leading spaces from page formatting)
  const txDatePattern = /^(\d{2}\/\d{2})\s+/;
  // Header line pattern
  const headerPattern = /^\s*Date\s+Description\s+/i;
  // Total line
  const totalPattern = /Total\s+Debits\/Credits/i;
  // Page break / repeated header patterns to skip
  const pageSkipPatterns = [
    /^\s*Page\s+\d+/i,
    /^\s*CitiBusiness/i,
    /^\s*CHECKING\s+ACTIVITY/i,
    /^\s*Account\s+Number/i,
    /^\f/, // form feed
  ];

  let currentTx: {
    rawDate: string;
    descLines: string[];
    debit: number | null;
    credit: number | null;
    balance: number | null;
  } | null = null;

  // Track previous balance to determine debit vs credit from balance changes
  let previousBalance = beginningBalance;

  function finalizeTx(tx: typeof currentTx) {
    if (!tx) return;
    const description = tx.descLines.join(' ').replace(/\s+/g, ' ').trim();
    const balance = tx.balance || 0;
    const rawAmount = tx.debit || tx.credit || 0;

    // Use running balance to determine debit vs credit — this is 100% reliable
    // If balance went down, it's a debit (expense). If up, it's a credit (income).
    let type: 'income' | 'expense';
    let amount: number;

    if (previousBalance !== 0 && balance !== 0) {
      const balanceDiff = balance - previousBalance;
      if (balanceDiff < 0) {
        type = 'expense';
        amount = -Math.abs(rawAmount);
      } else {
        type = 'income';
        amount = Math.abs(rawAmount);
      }
    } else {
      // Fallback: use description keywords
      const descUpper = description.toUpperCase();
      const isDebit = /DEBIT|ACH DEBIT|ZELLE SENT|BILL PAY|WITHDRAWAL/.test(descUpper);
      const isCredit = /CREDIT|DEPOSIT|ELECTRONIC CREDIT|ZELLE FROM/.test(descUpper);
      if (isDebit) {
        type = 'expense';
        amount = -Math.abs(rawAmount);
      } else if (isCredit) {
        type = 'income';
        amount = Math.abs(rawAmount);
      } else {
        // Final fallback: original column heuristic
        const isColumnCredit = tx.credit !== null && tx.credit > 0;
        type = isColumnCredit ? 'income' : 'expense';
        amount = isColumnCredit ? tx.credit! : -(tx.debit || 0);
      }
    }

    previousBalance = balance;

    // Convert MM/DD to YYYY-MM-DD
    const [mm, dd] = tx.rawDate.split('/');
    const fullDate = `${year}-${mm}-${dd}`;

    transactions.push({
      date: fullDate,
      description,
      amount,
      type,
      balance,
      rawDate: tx.rawDate,
      category: '', // will be filled after
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect start of checking activity section
    if (/CHECKING\s+ACTIVITY/i.test(line)) {
      inCheckingActivity = true;
      pastHeader = false;
      continue;
    }

    if (!inCheckingActivity) continue;

    // Detect the column header line
    if (headerPattern.test(line)) {
      pastHeader = true;
      continue;
    }

    if (!pastHeader) continue;

    // Stop at Total Debits/Credits
    if (totalPattern.test(line)) {
      // Finalize any pending transaction
      finalizeTx(currentTx);
      currentTx = null;

      // Extract totals
      const amounts = extractAllAmounts(line);
      if (amounts.length >= 2) {
        totalDebits = amounts[0].value;
        totalCredits = amounts[1].value;
      } else if (amounts.length === 1) {
        totalDebits = amounts[0].value;
      }
      // We're done with this section
      inCheckingActivity = false;
      pastHeader = false;
      continue;
    }

    // Skip page headers / breaks
    if (pageSkipPatterns.some((p) => p.test(line))) {
      // If we hit a repeated page header, skip until we see the column header again
      if (/CitiBusiness/i.test(line) || /CHECKING\s+ACTIVITY/i.test(line)) {
        pastHeader = false;
      }
      continue;
    }

    // Skip blank lines
    if (line.trim() === '') continue;

    // Check if this is a new transaction line (starts with MM/DD)
    const dateMatch = line.match(txDatePattern);
    if (dateMatch) {
      // Finalize previous transaction
      finalizeTx(currentTx);

      const rawDate = dateMatch[1];
      const { debit, credit, balance } = parseAmountsFromLine(line);

      // Extract description: text between the date and the first amount
      const descText = extractDescriptionFromLine(line, rawDate);

      currentTx = {
        rawDate,
        descLines: [descText],
        debit,
        credit,
        balance,
      };
    } else if (currentTx) {
      // Continuation line (indented, no date)
      // Only treat as continuation if line starts with spaces
      if (/^\s{2,}/.test(line)) {
        const trimmed = line.trim();
        // Skip if it looks like a repeated header
        if (trimmed && !headerPattern.test(line)) {
          // Sometimes continuation lines have amounts (shouldn't normally),
          // but mostly they're just description text
          currentTx.descLines.push(trimmed);
        }
      }
    }
  }

  // Finalize last transaction if any
  finalizeTx(currentTx);

  // --- Auto-categorize ---
  for (const tx of transactions) {
    tx.category = await categorizeTransaction(tx.description);
  }

  // If we didn't extract totals from the "Total Debits/Credits" line, compute them
  if (totalDebits === 0 && totalCredits === 0) {
    for (const tx of transactions) {
      if (tx.type === 'expense') {
        totalDebits += Math.abs(tx.amount);
      } else {
        totalCredits += tx.amount;
      }
    }
    totalDebits = Math.round(totalDebits * 100) / 100;
    totalCredits = Math.round(totalCredits * 100) / 100;
  }

  return {
    accountNumber,
    statementPeriod,
    beginningBalance,
    endingBalance,
    totalDebits,
    totalCredits,
    transactions,
    year,
  };
}

/**
 * Extract all dollar amounts from a line, returning their values and column positions.
 */
function extractAllAmounts(line: string): { value: number; position: number; endPosition: number }[] {
  const results: { value: number; position: number; endPosition: number }[] = [];
  const amountRegex = /([\d,]+\.\d{2})/g;
  let match: RegExpExecArray | null;

  while ((match = amountRegex.exec(line)) !== null) {
    results.push({
      value: parseAmount(match[1]),
      position: match.index,
      endPosition: match.index + match[0].length,
    });
  }

  return results;
}

/**
 * Determine debit, credit, and balance amounts from a transaction line.
 *
 * Citibank layout has amounts right-aligned in roughly these column ranges:
 * - Debits: ~column 60-74
 * - Credits: ~column 74-86
 * - Balance: ~column 86+
 *
 * Strategy: find all amounts, then the rightmost is balance,
 * and determine debit vs credit by column position of the remaining amount(s).
 *
 * For lines with only 2 amounts: one is debit or credit, the other is balance.
 * For lines with 3 amounts: debit, credit, balance (rare — usually only one of debit/credit).
 */
function parseAmountsFromLine(line: string): {
  debit: number | null;
  credit: number | null;
  balance: number | null;
} {
  const amounts = extractAllAmounts(line);

  if (amounts.length === 0) {
    return { debit: null, credit: null, balance: null };
  }

  if (amounts.length === 1) {
    // Only balance present (unusual, but handle it)
    return { debit: null, credit: null, balance: amounts[0].value };
  }

  // The rightmost amount is always the balance
  const balance = amounts[amounts.length - 1].value;

  if (amounts.length === 2) {
    // One amount + balance. Determine if it's debit or credit by column position.
    const amt = amounts[0];
    // Use a heuristic: if the amount ends before approximately column 76,
    // it's likely a debit. If it ends after ~76, it's a credit.
    // But column positions can vary, so we also look at the gap between the amounts.
    // In the Citi format, the debit column ends around position 72-74,
    // and the credit column ends around position 82-86.
    // The balance starts around position 86+.
    //
    // A more robust approach: look at where the amount sits relative to the balance.
    // If there's a large gap between the first amount and the balance, the first is a debit.
    // If they're relatively close, the first is a credit (since credit column is closer to balance).

    // Use the midpoint between the first amount's end and the balance amount's start
    const gap = amounts[1].position - amt.endPosition;

    // In the sample data:
    // Debit lines: debit ends ~col 72, balance starts ~col 85 -> gap ~13
    // Credit lines: credit ends ~col 82, balance starts ~col 85 -> gap ~3-6
    //
    // We'll use a threshold. If gap > 10 characters, it's likely a debit.
    // But column widths vary by amount size, so also check absolute position.

    // Better: check the absolute end-position of the amount.
    // Debit amounts tend to end before column ~75
    // Credit amounts tend to end after column ~75
    if (amt.endPosition < 78) {
      return { debit: amt.value, credit: null, balance };
    } else {
      return { debit: null, credit: amt.value, balance };
    }
  }

  if (amounts.length >= 3) {
    // Three amounts: debit, credit, balance (both columns filled — very rare)
    return {
      debit: amounts[0].value,
      credit: amounts[1].value,
      balance,
    };
  }

  return { debit: null, credit: null, balance };
}

/**
 * Extract the description text from a transaction line.
 * The description sits between the date and the first dollar amount.
 */
function extractDescriptionFromLine(line: string, rawDate: string): string {
  // Find where the date ends
  const dateIdx = line.indexOf(rawDate);
  const afterDate = dateIdx + rawDate.length;

  // Find the first amount
  const amounts = extractAllAmounts(line);
  const firstAmountPos = amounts.length > 0 ? amounts[0].position : line.length;

  // Description is the text between date and first amount
  return line.substring(afterDate, firstAmountPos).trim();
}
