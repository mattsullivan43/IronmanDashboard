import { useState, useCallback, useRef } from 'react';
import { jarvis } from '../services/api';
import type { ChatMessage, Conversation } from '../types';

interface JarvisUsage {
  requestsToday: number;
  limit: number;
}

interface UseJarvisReturn {
  messages: ChatMessage[];
  conversations: Conversation[];
  conversationId: string | null;
  isLoading: boolean;
  error: string | null;
  usage: JarvisUsage;
  sendMessage: (text: string) => Promise<void>;
  loadHistory: (conversationId: string) => Promise<void>;
  loadConversations: () => Promise<void>;
  loadUsage: () => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  startNewConversation: () => void;
  clearError: () => void;
}

export function useJarvis(): UseJarvisReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<JarvisUsage>({ requestsToday: 0, limit: 50 });
  const abortRef = useRef(false);

  const clearError = useCallback(() => setError(null), []);

  const loadUsage = useCallback(async () => {
    try {
      const data = await jarvis.getUsage();
      // Backend returns { requests, tokens, limit } directly — no byDay array
      let requestsToday = 0;
      if (data && typeof data === 'object') {
        if (typeof data.requests === 'number') {
          requestsToday = data.requests;
        } else if (Array.isArray(data.byDay)) {
          requestsToday = data.byDay.reduce((sum: number, d: any) => sum + (d.requests ?? 0), 0);
        }
      }
      const limit = data?.limit ?? 50;
      setUsage({ requestsToday, limit });
    } catch {
      // Usage fetch is non-critical — silently ignore
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const data = await jarvis.getConversations();
      setConversations(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    }
  }, []);

  const loadHistory = useCallback(async (convId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await jarvis.getHistory(convId);
      setMessages(Array.isArray(data) ? data : []);
      setConversationId(convId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation history');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || abortRef.current) return;

    if (usage.requestsToday >= usage.limit) {
      setError(
        'Daily request limit reached. JARVIS is entering power-save mode. Limit resets at midnight.'
      );
      return;
    }

    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
      conversationId: conversationId ?? '',
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await jarvis.chat(text.trim(), conversationId ?? undefined);
      if (!abortRef.current && response) {
        const assistantMessage: ChatMessage = response.message ?? {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: response.reply ?? '',
          timestamp: new Date().toISOString(),
          conversationId: response.conversationId ?? '',
        };
        setMessages((prev) => {
          // Replace temp user message id with real one if needed, and append assistant reply
          const updated = prev.map((m) =>
            m.id === userMessage.id ? { ...m, conversationId: response.conversationId ?? '' } : m
          );
          return [...updated, assistantMessage];
        });
        setConversationId(response.conversationId ?? null);
        setUsage((prev) => ({
          ...prev,
          requestsToday: prev.requestsToday + 1,
        }));
      }
    } catch (err) {
      if (!abortRef.current) {
        const message = err instanceof Error ? err.message : 'Failed to send message';
        setError(message);
        // Remove the optimistic user message on failure
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      }
    } finally {
      if (!abortRef.current) {
        setIsLoading(false);
      }
    }
  }, [conversationId, usage]);

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await jarvis.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete conversation');
    }
  }, [conversationId]);

  const startNewConversation = useCallback(() => {
    abortRef.current = true;
    setConversationId(null);
    setMessages([]);
    setError(null);
    setIsLoading(false);
    // Reset abort flag after state clears
    setTimeout(() => {
      abortRef.current = false;
    }, 0);
  }, []);

  return {
    messages,
    conversations,
    conversationId,
    isLoading,
    error,
    usage,
    sendMessage,
    loadHistory,
    loadConversations,
    loadUsage,
    deleteConversation,
    startNewConversation,
    clearError,
  };
}
