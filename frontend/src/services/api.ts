import axios, { AxiosError } from 'axios';
import { getAccessToken, isAuthenticated as isCognitoAuth, getIdToken } from './cognitoAuth';
import type {
  ApiResponse,
  Client,
  Transaction,
  Commission,
  CalendarEvent,
  ChatMessage,
  Conversation,
  MetricsOverview,
  RevenueMetrics,
  UnitEconomics,
  ProfitabilityMetrics,
  CashBurnMetrics,
  BoomLineMetrics,
  AIReceptionistMetrics,
  CsvUpload,
  Settings,
  ExpenseCategory,
  AIUsage,
} from '@/types';

// ── Axios Instance ──────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Support both Cognito and local JWT auth
api.interceptors.request.use(async (config) => {
  // Try Cognito first
  if (isCognitoAuth()) {
    const cognitoToken = await getAccessToken();
    if (cognitoToken) {
      config.headers.Authorization = `Bearer ${cognitoToken}`;
      // Also send ID token for user info
      const idToken = getIdToken();
      if (idToken) {
        config.headers['X-Id-Token'] = idToken;
      }
      return config;
    }
  }
  // Fall back to local JWT
  const token = localStorage.getItem('jarvis_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string; error?: string }>) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('jarvis_token');
      window.location.href = '/login';
    }
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

// ── Helper ──────────────────────────────────────────────────────────────────

function unwrap<T>(response: { data: ApiResponse<T> }): T {
  // If the response has the standard { success, data } wrapper, extract data
  const d = response.data as any;
  if (d && typeof d === 'object' && 'data' in d) {
    return d.data;
  }
  // Otherwise return the response body directly (endpoint didn't wrap)
  return d as T;
}

function unwrapFull<T>(response: { data: ApiResponse<T> }): ApiResponse<T> {
  const d = response.data as any;
  // If the response already has the ApiResponse shape, return it
  if (d && typeof d === 'object' && 'data' in d) {
    return d;
  }
  // Wrap a bare response into ApiResponse shape
  return { success: true, data: d as T } as ApiResponse<T>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export const auth = {
  login: async (username: string, password: string) => {
    const res = await api.post<{ token: string; user: { id: string; username: string; displayName: string } }>('/auth/login', { username, password });
    const { token, user } = res.data;
    localStorage.setItem('jarvis_token', token);
    return { token, user };
  },

  getMe: async () => {
    const res = await api.get<{ valid: boolean; user: { id: string; username: string; displayName: string } }>('/auth/verify');
    return res.data.user;
  },
};

// ── Clients ─────────────────────────────────────────────────────────────────

export const clients = {
  list: async (params?: { page?: number; limit?: number; search?: string; status?: string }) => {
    return unwrapFull(await api.get<ApiResponse<Client[]>>('/clients', { params }));
  },

  get: async (id: string) => {
    return unwrap(await api.get<ApiResponse<Client>>(`/clients/${id}`));
  },

  create: async (data: Partial<Client>) => {
    return unwrap(await api.post<ApiResponse<Client>>('/clients', data));
  },

  update: async (id: string, data: Partial<Client>) => {
    return unwrap(await api.put<ApiResponse<Client>>(`/clients/${id}`, data));
  },

  delete: async (id: string) => {
    return unwrap(await api.delete<ApiResponse<void>>(`/clients/${id}`));
  },

  getStats: async () => {
    return unwrap(await api.get<ApiResponse<{ total: number; active: number; inactive: number; prospect: number; totalRevenue: number }>>('/clients/stats'));
  },
};

// ── Transactions ────────────────────────────────────────────────────────────

export const transactions = {
  list: async (params?: {
    page?: number;
    limit?: number;
    type?: string;
    category?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) => {
    return unwrapFull(await api.get<ApiResponse<Transaction[]>>('/transactions', { params }));
  },

  create: async (data: Partial<Transaction>) => {
    return unwrap(await api.post<ApiResponse<Transaction>>('/transactions', data));
  },

  update: async (id: string, data: Partial<Transaction>) => {
    return unwrap(await api.put<ApiResponse<Transaction>>(`/transactions/${id}`, data));
  },

  delete: async (id: string) => {
    return unwrap(await api.delete<ApiResponse<void>>(`/transactions/${id}`));
  },

  bulkCategorize: async (data: { ids: string[]; category: string }) => {
    return unwrap(await api.post<ApiResponse<{ updated: number }>>('/transactions/bulk-categorize', data));
  },

  recategorize: async () => {
    return unwrap(await api.post<ApiResponse<{ total: number; recategorized: number; remaining: number }>>('/transactions/recategorize'));
  },

  getSummary: async (params?: { startDate?: string; endDate?: string }) => {
    return unwrap(
      await api.get<
        ApiResponse<{
          totalIncome: number;
          totalExpenses: number;
          netIncome: number;
          byCategory: Array<{ category: string; amount: number }>;
        }>
      >('/transactions/summary', { params })
    );
  },

  getByCategory: async (params?: { startDate?: string; endDate?: string }) => {
    return unwrap(
      await api.get<ApiResponse<Array<{ category: string; income: number; expense: number }>>>('/transactions/by-category', { params })
    );
  },
};

// ── CSV Upload ──────────────────────────────────────────────────────────────

export const csv = {
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return unwrap(
      await api.post<ApiResponse<CsvUpload>>('/csv/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    );
  },

  import: async (id: string, mapping: Record<string, string>) => {
    return unwrap(await api.post<ApiResponse<CsvUpload>>(`/csv/${id}/import`, { mapping }));
  },

  getUploads: async () => {
    return unwrap(await api.get<ApiResponse<CsvUpload[]>>('/csv/uploads'));
  },

  getMapping: async (id: string) => {
    return unwrap(
      await api.get<ApiResponse<{ columns: string[]; sampleData: Record<string, string>[]; suggestedMapping: Record<string, string> }>>(
        `/csv/${id}/mapping`
      )
    );
  },

  saveMapping: async (id: string, mapping: Record<string, string>) => {
    return unwrap(await api.put<ApiResponse<CsvUpload>>(`/csv/${id}/mapping`, { mapping }));
  },
};

// ── Metrics ─────────────────────────────────────────────────────────────────

export const metrics = {
  getOverview: async (params?: { period?: string }) => {
    return unwrap(await api.get<ApiResponse<MetricsOverview>>('/metrics/overview', { params }));
  },

  getRevenue: async (params?: { period?: string; startDate?: string; endDate?: string }) => {
    return unwrap(await api.get<ApiResponse<RevenueMetrics>>('/metrics/revenue', { params }));
  },

  getUnitEconomics: async (params?: { period?: string }) => {
    return unwrap(await api.get<ApiResponse<UnitEconomics>>('/metrics/unit-economics', { params }));
  },

  getProfitability: async (params?: { period?: string }) => {
    return unwrap(await api.get<ApiResponse<ProfitabilityMetrics>>('/metrics/profitability', { params }));
  },

  getCashBurn: async () => {
    return unwrap(await api.get<ApiResponse<CashBurnMetrics>>('/metrics/cash-burn'));
  },

  getBoomLine: async () => {
    return unwrap(await api.get<ApiResponse<BoomLineMetrics>>('/metrics/boom-line'));
  },

  getAIReceptionist: async (params?: { startDate?: string; endDate?: string }) => {
    return unwrap(await api.get<ApiResponse<AIReceptionistMetrics>>('/metrics/ai-receptionist', { params }));
  },

  updateCashBalance: async (balance: number) => {
    return unwrap(await api.post<ApiResponse<{ cashBalance: number }>>('/metrics/cash-balance', { balance }));
  },

  getRevenueSnapshots: async () => {
    return unwrap(
      await api.get<ApiResponse<Array<{ id: string; date: string; revenue: number; expenses: number; profit: number }>>>('/metrics/revenue-snapshots')
    );
  },

  createSnapshot: async () => {
    return unwrap(
      await api.post<ApiResponse<{ id: string; date: string; revenue: number; expenses: number; profit: number }>>('/metrics/revenue-snapshots')
    );
  },
};

// ── Commissions ─────────────────────────────────────────────────────────────

export const commissions = {
  list: async (params?: { page?: number; limit?: number; status?: string; agentName?: string }) => {
    return unwrapFull(await api.get<ApiResponse<Commission[]>>('/commissions', { params }));
  },

  create: async (data: Partial<Commission>) => {
    return unwrap(await api.post<ApiResponse<Commission>>('/commissions', data));
  },

  update: async (id: string, data: Partial<Commission>) => {
    return unwrap(await api.put<ApiResponse<Commission>>(`/commissions/${id}`, data));
  },

  delete: async (id: string) => {
    return unwrap(await api.delete<ApiResponse<void>>(`/commissions/${id}`));
  },

  getSummary: async (params?: { startDate?: string; endDate?: string }) => {
    return unwrap(
      await api.get<
        ApiResponse<{
          totalPaid: number;
          totalPending: number;
          byAgent: Array<{ agentName: string; total: number; paid: number; pending: number }>;
        }>
      >('/commissions/summary', { params })
    );
  },
};

// ── JARVIS Chat ─────────────────────────────────────────────────────────────

export const jarvis = {
  chat: async (message: string, conversationId?: string) => {
    const res = await api.post('/jarvis/chat', { message, conversationId });
    const d = res.data as any;
    // Backend returns { reply, tokensUsed, conversationId } directly (no wrapper)
    // Transform to the shape the frontend expects: { message: ChatMessage, conversationId }
    if (d.data) return d.data; // wrapped shape
    return {
      message: {
        id: `msg-${Date.now()}`,
        role: 'assistant' as const,
        content: d.reply ?? '',
        timestamp: new Date().toISOString(),
        conversationId: d.conversationId ?? '',
      },
      conversationId: d.conversationId ?? '',
    };
  },

  getBriefing: async () => {
    const res = await api.get('/jarvis/briefing');
    const d = res.data as any;
    // Backend returns { briefing: "..." } directly (no wrapper)
    if (d.data) return d.data;
    return { briefing: d.briefing ?? '', generatedAt: d.generatedAt ?? new Date().toISOString() };
  },

  getHistory: async (conversationId: string) => {
    const res = await api.get(`/jarvis/conversations/${conversationId}/messages`);
    const d = res.data as any;
    // Backend returns { messages: [...], pagination } directly (no wrapper)
    if (d.data && Array.isArray(d.data)) return d.data as ChatMessage[];
    if (Array.isArray(d.messages)) return d.messages as ChatMessage[];
    if (Array.isArray(d)) return d as ChatMessage[];
    return [] as ChatMessage[];
  },

  getConversations: async () => {
    const res = await api.get('/jarvis/conversations');
    const d = res.data as any;
    // Backend returns { conversations: [...], pagination } directly (no wrapper)
    if (d.data && Array.isArray(d.data)) return d.data as Conversation[];
    if (Array.isArray(d.conversations)) return d.conversations as Conversation[];
    if (Array.isArray(d)) return d as Conversation[];
    return [] as Conversation[];
  },

  deleteConversation: async (id: string) => {
    const res = await api.delete(`/jarvis/conversations/${id}`);
    const d = res.data as any;
    // Backend returns { message, deletedMessages } directly (no wrapper)
    return d.data ?? d;
  },

  getUsage: async () => {
    const res = await api.get<AIUsage | ApiResponse<AIUsage>>('/jarvis/usage');
    // Handle both wrapped { success, data } and direct { requests, tokens, limit } responses
    const d = res.data as any;
    if (d.data) return d.data;
    return d;
  },
};

// ── Calendar ────────────────────────────────────────────────────────────────

export const calendar = {
  getEvents: async (params?: { startDate?: string; endDate?: string; source?: string }) => {
    return unwrap(await api.get<ApiResponse<CalendarEvent[]>>('/calendar/events', { params }));
  },

  getToday: async () => {
    return unwrap(await api.get<ApiResponse<CalendarEvent[]>>('/calendar/today'));
  },

  getConflicts: async () => {
    return unwrap(await api.get<ApiResponse<Array<{ event1: CalendarEvent; event2: CalendarEvent }>>>('/calendar/conflicts'));
  },

  getGoogleAuthUrl: async () => {
    return unwrap(await api.get<ApiResponse<{ url: string }>>('/calendar/google/auth-url'));
  },

  getMicrosoftAuthUrl: async () => {
    return unwrap(await api.get<ApiResponse<{ url: string }>>('/calendar/microsoft/auth-url'));
  },

  sync: async () => {
    return unwrap(await api.post<ApiResponse<{ synced: number }>>('/calendar/sync'));
  },

  getConnections: async () => {
    return unwrap(
      await api.get<ApiResponse<Array<{ provider: string; email: string; connected: boolean; lastSync?: string }>>>('/calendar/connections')
    );
  },

  disconnect: async (provider: string) => {
    return unwrap(await api.delete<ApiResponse<void>>(`/calendar/connections/${provider}`));
  },
};

// ── Settings ────────────────────────────────────────────────────────────────

export const settings = {
  getAll: async () => {
    return unwrap(await api.get<ApiResponse<Settings>>('/settings'));
  },

  update: async (data: Partial<Settings>) => {
    return unwrap(await api.put<ApiResponse<Settings>>('/settings', data));
  },

  getCategories: async () => {
    return unwrap(await api.get<ApiResponse<ExpenseCategory[]>>('/settings/categories'));
  },

  createCategory: async (data: Partial<ExpenseCategory>) => {
    return unwrap(await api.post<ApiResponse<ExpenseCategory>>('/settings/categories', data));
  },

  updateCategory: async (id: string, data: Partial<ExpenseCategory>) => {
    return unwrap(await api.put<ApiResponse<ExpenseCategory>>(`/settings/categories/${id}`, data));
  },

  deleteCategory: async (id: string) => {
    return unwrap(await api.delete<ApiResponse<void>>(`/settings/categories/${id}`));
  },
};

// ── Statement Upload (PDF + CSV) ────────────────────────────────────────────

export const statements = {
  uploadStatement: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return unwrap(
      await api.post<ApiResponse<any>>('/csv/upload-statement', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    );
  },

  importStatement: async (data: { transactions: any[]; fileUploadId?: string; endingBalance?: number; statementDate?: string }) => {
    return unwrap(await api.post<ApiResponse<any>>('/csv/import-statement', data));
  },
};

// ── Analytics ──────────────────────────────────────────────────────────────

export const analytics = {
  getMonthlyBreakdown: async (params?: { start?: string; end?: string }) => {
    return unwrap(
      await api.get<ApiResponse<Array<{
        month: string;
        total_income: number;
        total_expenses: number;
        net: number;
        transaction_count: number;
        top_expense_category: string;
        categories: Array<{ name: string; total: number }>;
      }>>>('/analytics/monthly-breakdown', { params })
    );
  },

  getCategoryBreakdown: async (params?: { start?: string; end?: string }) => {
    return unwrap(
      await api.get<ApiResponse<Array<{
        category: string;
        total: number;
        count: number;
        avg_amount: number;
        pct_of_total: number;
      }>>>('/analytics/category-breakdown', { params })
    );
  },

  getTotals: async (params?: { start?: string; end?: string }) => {
    return unwrap(
      await api.get<ApiResponse<{
        total_income: number;
        total_expenses: number;
        net: number;
        avg_monthly_income: number;
        avg_monthly_expenses: number;
        largest_expense: { amount: number; description: string; date: string; category: string } | null;
        largest_income: { amount: number; description: string; date: string; category: string } | null;
        transaction_count: number;
      }>>('/analytics/totals', { params })
    );
  },
};

// ── Action Items ──────────────────────────────────────────────────────────────

export const actionItems = {
  list: async (date?: string) => {
    return unwrap(await api.get<ApiResponse<any[]>>('/action-items', { params: { date } }));
  },
  create: async (data: { title: string; dueDate?: string; priority?: string }) => {
    return unwrap(await api.post<ApiResponse<any>>('/action-items', data));
  },
  update: async (id: string, data: { completed?: boolean; title?: string }) => {
    return unwrap(await api.put<ApiResponse<any>>(`/action-items/${id}`, data));
  },
  delete: async (id: string) => {
    return unwrap(await api.delete<ApiResponse<void>>(`/action-items/${id}`));
  },
};

// ── Export ───────────────────────────────────────────────────────────────────

export const exportData = {
  export: async (type: string) => {
    const response = await api.get(`/export/${type}`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data as BlobPart]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${type}-export-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

export default api;
