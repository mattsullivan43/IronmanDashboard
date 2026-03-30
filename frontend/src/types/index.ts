// ── Client ──────────────────────────────────────────────────────────────────

export type ProductLine = 'boomline' | 'ai_receptionist' | 'custom_software';

export interface Client {
  id: string;
  name: string;
  contactName?: string;
  email: string;
  phone?: string;
  company?: string;
  productLine: ProductLine;
  status: 'active' | 'inactive' | 'prospect' | 'churned';
  monthlyRevenue: number;
  startDate: string;
  contractTerms?: string;
  notes?: string;
  tags?: string[];
  // BoomLine fields
  craneCount?: number;
  perCraneRate?: number;
  implementationFee?: number;
  implementationFeeCollected?: boolean;
  // AI Receptionist fields
  setupFee?: number;
  setupFeeCollected?: boolean;
  monthlyRecurringFee?: number;
  cogsPerMonth?: number;
  // Custom Software fields
  projectValue?: number;
  projectPaid?: number;
  createdAt: string;
  updatedAt: string;
}

// ── Transaction ─────────────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  subcategory?: string;
  clientId?: string;
  client?: Client;
  recurring: boolean;
  recurringFrequency?: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually';
  notes?: string;
  csvUploadId?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Commission ──────────────────────────────────────────────────────────────

export interface Commission {
  id: string;
  agentName: string;
  clientId?: string;
  client?: Client;
  dealDescription?: string;
  dealValue: number;
  amount: number;
  rate: number;
  source: string;
  date: string;
  datePaid?: string;
  status: 'pending' | 'paid' | 'unpaid' | 'cancelled';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Calendar ────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  source: 'google' | 'microsoft' | 'manual';
  sourceId?: string;
  attendees?: string[];
  isAllDay: boolean;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Chat / JARVIS ───────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  conversationId: string;
  metadata?: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  title: string;
  lastMessage?: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Metrics ─────────────────────────────────────────────────────────────────

export interface MetricsOverview {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  activeClients: number;
  mrr: number;
  revenueGrowth: number;
  expenseGrowth: number;
  cashBalance: number;
  runway: number;
}

export interface RevenueMetrics {
  current: number;
  previous: number;
  growth: number;
  byMonth: Array<{ month: string; revenue: number; expenses: number; profit: number }>;
  byCategory: Array<{ category: string; amount: number; percentage: number }>;
  byClient: Array<{ clientId: string; clientName: string; revenue: number }>;
  mrr: number;
  arr: number;
}

export interface UnitEconomics {
  averageRevenuePerClient: number;
  customerAcquisitionCost: number;
  lifetimeValue: number;
  ltvCacRatio: number;
  churnRate: number;
  retentionRate: number;
  paybackPeriod: number;
  monthlyData: Array<{
    month: string;
    arpc: number;
    cac: number;
    ltv: number;
  }>;
}

export interface ProfitabilityMetrics {
  grossProfit: number;
  grossMargin: number;
  netProfit: number;
  netMargin: number;
  operatingExpenses: number;
  operatingMargin: number;
  ebitda: number;
  byMonth: Array<{
    month: string;
    revenue: number;
    cogs: number;
    grossProfit: number;
    opex: number;
    netProfit: number;
  }>;
  expenseBreakdown: Array<{ category: string; amount: number; percentage: number }>;
}

export interface CashBurnMetrics {
  cashBalance: number;
  monthlyBurn: number;
  runway: number;
  burnTrend: 'increasing' | 'decreasing' | 'stable';
  byMonth: Array<{
    month: string;
    inflow: number;
    outflow: number;
    netCash: number;
    balance: number;
  }>;
  projectedRunway: Array<{ month: string; balance: number }>;
}

export interface BoomLineMetrics {
  score: number;
  trend: 'up' | 'down' | 'stable';
  components: {
    revenueGrowth: { value: number; weight: number; score: number };
    profitMargin: { value: number; weight: number; score: number };
    clientRetention: { value: number; weight: number; score: number };
    cashRunway: { value: number; weight: number; score: number };
    efficiency: { value: number; weight: number; score: number };
  };
  history: Array<{ date: string; score: number }>;
  insights: string[];
}

export interface AIReceptionistMetrics {
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  averageDuration: number;
  appointmentsBooked: number;
  conversionRate: number;
  satisfaction: number;
  byDay: Array<{
    date: string;
    total: number;
    answered: number;
    missed: number;
    booked: number;
  }>;
  topReasons: Array<{ reason: string; count: number }>;
}

// ── CSV Upload ──────────────────────────────────────────────────────────────

export interface CsvUpload {
  id: string;
  filename: string;
  status: 'pending' | 'mapped' | 'imported' | 'failed';
  rowCount: number;
  importedCount: number;
  errorCount: number;
  columnMapping?: Record<string, string>;
  errors?: Array<{ row: number; message: string }>;
  createdAt: string;
  updatedAt: string;
}

// ── Settings ────────────────────────────────────────────────────────────────

export interface ExpenseCategory {
  id: string;
  name: string;
  color: string;
  icon?: string;
  parentId?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  companyName: string;
  ownerName: string;
  fiscalYearStart: number;
  currency: string;
  voiceEnabled: boolean;
  voiceRate: number;
  voicePitch: number;
  soundEnabled: boolean;
  theme: 'dark' | 'light';
  dashboardLayout: string[];
  notificationsEnabled: boolean;
  aiModel: string;
  briefingTime: string;
  calendarSyncInterval: number;
}

// ── AI Usage ────────────────────────────────────────────────────────────────

export interface AIUsage {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  byDay: Array<{
    date: string;
    tokens: number;
    cost: number;
    requests: number;
  }>;
  byFeature: Array<{
    feature: string;
    tokens: number;
    cost: number;
  }>;
}

// ── API Response ────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
