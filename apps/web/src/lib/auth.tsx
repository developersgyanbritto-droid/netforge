'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<{ user: User | null }>('/auth/me'), staleTime: 60_000 });
  const value: AuthState = {
    user: me.data?.user ?? null,
    loading: me.isLoading,
    refresh: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
    logout: async () => {
      await api.post('/auth/logout');
      qc.clear();
      window.location.href = '/';
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
